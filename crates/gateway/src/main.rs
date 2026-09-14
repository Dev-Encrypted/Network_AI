// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
use axum::{
    Json, Router,
    body::{Body, Bytes},
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use futures_util::{
    StreamExt,
    future::{join_all, try_join_all},
};
use network_ai_runtime::{Chat, Config, Error, Result, Sse, client, event, hash, reqwest};
use serde_json::{Value, json};
use std::{convert::Infallible, sync::Arc, time::Duration};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

struct App {
    config: Config,
    http: reqwest::Client,
}
fn consumer(
    mut request: reqwest::RequestBuilder,
    headers: &HeaderMap,
    internal: bool,
) -> reqwest::RequestBuilder {
    for (source, forwarded) in [
        ("authorization", "x-consumer-authorization"),
        ("cookie", "x-consumer-cookie"),
        ("origin", "x-consumer-origin"),
    ] {
        if let Some(value) = headers.get(source) {
            request = request.header(if internal { forwarded } else { source }, value);
        }
    }
    request
}
async fn control(
    app: &App,
    path: &str,
    body: Option<&Value>,
    headers: &HeaderMap,
    internal: bool,
) -> Result<Value> {
    let request = if let Some(body) = body {
        app.http.post(app.config.control(path)).json(body)
    } else {
        app.http.get(app.config.control(path))
    };
    let response = consumer(request, headers, internal)
        .header("x-gateway-secret", &app.config.gateway_secret)
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|_| {
            Error(
                StatusCode::SERVICE_UNAVAILABLE,
                "control_unavailable",
                "O controle está temporariamente indisponível.".into(),
            )
        })?;
    let status = response.status();
    let value: Value = response
        .json()
        .await
        .map_err(|_| Error::new("control_protocol", "Resposta de controle inválida."))?;
    if !status.is_success() {
        return Err(Error(
            status,
            "control_rejected",
            value["error"]["message"]
                .as_str()
                .unwrap_or("Solicitação rejeitada pelo controle.")
                .into(),
        ));
    }
    Ok(value)
}
async fn health() -> Json<Value> {
    Json(json!({"status":"ok","mode":"private_lab","component":"gateway"}))
}
async fn models(State(app): State<Arc<App>>, headers: HeaderMap) -> Result<Json<Value>> {
    let value = control(&app, "/models", None, &headers, false).await?;
    let data = value["data"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|m| m["available"] == true)
        .map(|m| json!({"id":m["id"],"object":"model","owned_by":"network-ai-private-lab"}))
        .collect::<Vec<_>>();
    Ok(Json(json!({"object":"list","data":data})))
}
async fn chat(State(app): State<Arc<App>>, headers: HeaderMap, body: Bytes) -> Result<Response> {
    let chat = Chat::parse(&body)?;
    let idempotency = headers
        .get("idempotency-key")
        .and_then(|h| h.to_str().ok())
        .map(str::to_owned)
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let quote = if let Some(id) = headers.get("x-quote-id").and_then(|h| h.to_str().ok()) {
        id.to_string()
    } else {
        control(
            &app,
            "/quotes",
            Some(&json!({"model":chat.model,"max_output_tokens":chat.max_tokens})),
            &headers,
            false,
        )
        .await?["id"]
            .as_str()
            .ok_or_else(|| Error::new("quote_protocol", "Cotação inválida."))?
            .into()
    };
    let created=control(&app,"/internal/sessions",Some(&json!({"quote_id":quote,"idempotency_key":idempotency,
        "request_sha256":hash(&body),"request_bytes":body.len(),"model":chat.model,"max_tokens":chat.max_tokens,
        "content_bytes":chat.content_bytes(),"message_count":chat.messages.len()})),&headers,true).await?;
    let id = created["id"]
        .as_str()
        .ok_or_else(|| Error::new("session_protocol", "Sessão inválida."))?
        .to_owned();
    if created["reused"] == true {
        return Ok((StatusCode::CONFLICT,Json(json!({"error":{"code":"idempotent_session_exists","message":"Esta sessão já existe. Consulte seu estado; o conteúdo não é retido.","session_id":id},"state":created["state"]}))).into_response());
    }
    let (tx, mut rx) = mpsc::channel::<std::result::Result<Bytes, Infallible>>(16);
    let task_app = app.clone();
    let task_id = id.clone();
    let task_headers = headers.clone();
    tokio::spawn(async move {
        let outcome = tokio::select! {
            result=dispatch(&task_app,&task_id,&task_headers,body,&tx)=>result,
            ()=tx.closed()=>{
                let _=control(&task_app,&format!("/sessions/{task_id}/cancel"),Some(&json!({})),&task_headers,false).await;
                return;
            }
        };
        if outcome.is_err() {
            let _ = control(
                &task_app,
                &format!("/internal/sessions/{task_id}/fail"),
                Some(&json!({"code":"gateway_delivery_failed"})),
                &task_headers,
                true,
            )
            .await;
            let _=tx.send(Ok(Bytes::from(event(&json!({"error":{"code":"inference_interrupted","message":"A inferência foi interrompida. Consulte a sessão para acompanhar a devolução.","session_id":task_id}}))))).await;
        }
    });
    if chat.stream {
        let mut response = Body::from_stream(ReceiverStream::new(rx)).into_response();
        response.headers_mut().insert(
            header::CONTENT_TYPE,
            "text/event-stream; charset=utf-8".parse().unwrap(),
        );
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
        response
            .headers_mut()
            .insert("x-network-ai-session-id", id.parse().unwrap());
        return Ok(response);
    }
    let mut parser = Sse::default();
    let mut content = String::new();
    let mut reasoning = String::new();
    let mut usage = json!({});
    let mut finish = Value::Null;
    let mut done = false;
    let mut error = None;
    while let Some(Ok(bytes)) = rx.recv().await {
        for data in parser
            .push(&bytes)
            .map_err(|_| Error::new("stream_protocol", "O fluxo de resposta é inválido."))?
        {
            if data == "[DONE]" {
                done = true;
                continue;
            }
            let Ok(value) = serde_json::from_str::<Value>(&data) else {
                continue;
            };
            if value.get("error").is_some() {
                error = Some(value);
                continue;
            }
            if let Some(text) = value["choices"][0]["delta"]["content"].as_str() {
                content.push_str(text);
            }
            if let Some(text) = value["choices"][0]["delta"]["reasoning_content"].as_str() {
                reasoning.push_str(text);
            }
            if !value["usage"].is_null() {
                usage = value["usage"].clone();
            }
            if !value["choices"][0]["finish_reason"].is_null() {
                finish = value["choices"][0]["finish_reason"].clone();
            }
        }
    }
    if let Some(error) = error {
        return Ok((StatusCode::BAD_GATEWAY, Json(error)).into_response());
    }
    if !done {
        return Err(Error(
            StatusCode::BAD_GATEWAY,
            "incomplete_stream",
            "A resposta não foi concluída.".into(),
        ));
    }
    let mut response=Json(json!({"id":format!("chatcmpl-{id}"),"object":"chat.completion","created":network_ai_runtime::now(),"model":chat.model,
        "choices":[{"index":0,"message":{"role":"assistant","content":content,"reasoning_content":reasoning},"finish_reason":finish}],"usage":usage,
        "network_ai":{"session_id":id,"unit":"LAB_TU","mode":"private_lab"}})).into_response();
    response
        .headers_mut()
        .insert("x-network-ai-session-id", id.parse().unwrap());
    Ok(response)
}
async fn dispatch(
    app: &App,
    id: &str,
    headers: &HeaderMap,
    body: Bytes,
    tx: &mpsc::Sender<std::result::Result<Bytes, Infallible>>,
) -> anyhow::Result<()> {
    tx.send(Ok(Bytes::from(format!(
        "event: network_ai_status\ndata: {}\n\n",
        json!({"session_id":id,"state":"QUEUED"})
    ))))
    .await?;
    let admission = loop {
        let value = control(
            app,
            &format!("/internal/sessions/{id}/admit"),
            Some(&json!({})),
            headers,
            true,
        )
        .await
        .map_err(|_| anyhow::anyhow!("Admission failed"))?;
        if value["state"] == "PREPARING" {
            break value;
        }
        anyhow::ensure!(value["state"] == "QUEUED", "Session ended in queue");
        tokio::time::sleep(Duration::from_millis(300)).await;
    };
    let node = participant_url(&admission)?;
    let mut stages = Vec::new();
    if let Some(parts) = admission.get("participants") {
        let parts = parts
            .as_array()
            .ok_or_else(|| anyhow::anyhow!("Invalid route"))?;
        anyhow::ensure!((2..=16).contains(&parts.len()), "Route size");
        let mut ids = std::collections::BTreeSet::new();
        let mut roots = 0;
        for p in parts {
            let id = p["node_id"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Node identity"))?;
            uuid::Uuid::parse_str(id)?;
            anyhow::ensure!(ids.insert(id), "Duplicate route node");
            participant_url(p)?;
            if p["role"] == "ROOT" {
                roots += 1;
                anyhow::ensure!(p["node_url"] == admission["node_url"], "Root binding");
            } else {
                anyhow::ensure!(p["role"] == "STAGE", "Unknown route role");
                stages.push(p.clone());
            }
        }
        anyhow::ensure!(roots == 1, "Missing unique route root");
    }
    let routed = !stages.is_empty();
    let mut authorization: Option<Value> = None;
    let outcome: anyhow::Result<()> = async {
        let prepared_stages = try_join_all(stages.iter().map(|p| async {
            let prepared = node_post(app, p, "/prepare", "capability", &json!({})).await?;
            Ok::<Value, anyhow::Error>(
                json!({"node_id":p["node_id"],"prepare_id":prepared["prepare_id"]}),
            )
        }))
        .await?;
        let prepared = node_post(app, &admission, "/prepare", "capability", &json!({})).await?;
        let mut request = json!({"prepare_id":prepared["prepare_id"]});
        if routed {
            request["participants"] = json!(prepared_stages);
        }
        authorization = Some(
            control(
                app,
                &format!("/internal/sessions/{id}/authorize"),
                Some(&request),
                headers,
                true,
            )
            .await
            .map_err(|_| anyhow::anyhow!("Authorization failed"))?,
        );
        let auth = authorization.as_ref().expect("assigned above");
        if routed {
            let parts = auth["participants"]
                .as_array()
                .ok_or_else(|| anyhow::anyhow!("Stage authorizations missing"))?;
            anyhow::ensure!(
                parts.len() == stages.len()
                    && parts.iter().all(|p| stages
                        .iter()
                        .any(|s| s["node_id"] == p["node_id"] && s["node_url"] == p["node_url"])),
                "Stage authorization binding"
            );
            let empty = json!({});
            try_join_all(
                parts
                    .iter()
                    .map(|p| node_post(app, p, "/stage/start", "capability", &empty)),
            )
            .await?;
        }
        let response = app
            .http
            .post(format!("{node}/execute"))
            .bearer_auth(auth["capability"].as_str().unwrap_or_default())
            .header("content-type", "application/json")
            .body(body)
            .send()
            .await?
            .error_for_status()?;
        let mut stream = response.bytes_stream();
        let mut total = 0usize;
        let mut parser = Sse::default();
        let mut done = false;
        let mut failed = false;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            total += chunk.len();
            anyhow::ensure!(total <= 4 * 1024 * 1024, "Output limit");
            if routed {
                // The route is complete only after the workers have persisted
                // their own receipts. Hold the root's final marker until then.
                for data in parser.push(&chunk)? {
                    if data == "[DONE]" {
                        done = true;
                        continue;
                    }
                    let value: Value = serde_json::from_str(&data)?;
                    failed |= value.get("error").is_some();
                    tx.send(Ok(Bytes::from(event(&value)))).await?;
                }
            } else {
                tx.send(Ok(chunk)).await?;
            }
        }
        anyhow::ensure!(!routed || (done && !failed), "Incomplete route root stream");
        Ok(())
    }
    .await;
    let mut durable = true;
    if routed {
        if let Some(parts) = authorization
            .as_ref()
            .and_then(|a| a["participants"].as_array())
        {
            let finish = json!({"state":if outcome.is_ok(){"COMPLETED"}else{"FAILED"}});
            for result in join_all(
                parts
                    .iter()
                    .map(|p| node_post(app, p, "/stage/finish", "finish_capability", &finish)),
            )
            .await
            {
                durable &= result.as_ref().is_ok_and(|v| {
                    v["durable"] == true
                        && v["state"] != "FAILED"
                        && v["state"] != "CANCELLED"
                        && v["state"] != "INTERRUPTED"
                });
            }
        } else {
            durable = false;
        }
    }
    if outcome.is_err() || !durable {
        // Release unclaimed local preparations. Cancellation resolves any stage
        // that claimed but whose finish response was lost; no execution retry.
        let mut prepared_parts = stages;
        prepared_parts.push(admission);
        let empty = json!({});
        let _ = join_all(
            prepared_parts
                .iter()
                .map(|p| node_post(app, p, "/release", "capability", &empty)),
        )
        .await;
        let _ = control(
            app,
            &format!("/sessions/{id}/cancel"),
            Some(&empty),
            headers,
            false,
        )
        .await;
        outcome?;
        anyhow::bail!("A stage receipt was not durably confirmed");
    }
    outcome?;
    if routed {
        let status = control(
            app,
            &format!("/internal/sessions/{id}"),
            None,
            headers,
            true,
        )
        .await
        .unwrap_or_else(|_| json!({"receipt_pending":true}));
        anyhow::ensure!(
            status["state"] != "FAILED"
                && status["state"] != "CANCELLED"
                && status["state"] != "INTERRUPTED",
            "Route did not settle"
        );
        tx.send(Ok(Bytes::from(format!(
            "event: network_ai_receipt\ndata: {status}\n\n"
        ))))
        .await?;
        tx.send(Ok(Bytes::from_static(b"data: [DONE]\n\n"))).await?;
    }
    Ok(())
}
fn participant_url(part: &Value) -> anyhow::Result<String> {
    let node = part["node_url"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("Missing node"))?;
    let url = reqwest::Url::parse(node)?;
    anyhow::ensure!(
        url.scheme() == "http"
            && url.host_str() == Some("127.0.0.1")
            && url.username().is_empty()
            && url.password().is_none()
            && url.query().is_none()
            && url.fragment().is_none()
            && url.path() == "/"
            && url.port().is_some_and(|p| (43103..=43299).contains(&p)),
        "Endpoint policy"
    );
    Ok(node.to_owned())
}
async fn node_post(
    app: &App,
    part: &Value,
    path: &str,
    key: &str,
    body: &Value,
) -> anyhow::Result<Value> {
    let node = participant_url(part)?;
    let token = part[key]
        .as_str()
        .filter(|s| s.len() <= 8192)
        .ok_or_else(|| anyhow::anyhow!("Missing participant capability"))?;
    Ok(app
        .http
        .post(format!("{node}{path}"))
        .bearer_auth(token)
        .timeout(Duration::from_secs(8))
        .json(body)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?)
}
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = Config::load()?;
    anyhow::ensure!(
        config.gateway_secret.len() >= 40,
        "A gateway requires its own control credential"
    );
    let port = config.gateway_port;
    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/models", get(models))
        .route("/v1/chat/completions", post(chat))
        .layer(DefaultBodyLimit::max(131072))
        .with_state(Arc::new(App {
            config,
            http: client(),
        }));
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).await?;
    println!("NETWORK AI gateway ready on 127.0.0.1:{port} (private_lab)");
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
