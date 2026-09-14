// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
use axum::{
    Json, Router,
    body::{Body, Bytes},
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use futures_util::StreamExt;
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
    let node = admission["node_url"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("Missing node"))?;
    let url = reqwest::Url::parse(node)?;
    anyhow::ensure!(
        url.scheme() == "http"
            && url.host_str() == Some("127.0.0.1")
            && url.port().is_some_and(|p| (43103..=43299).contains(&p)),
        "Endpoint policy"
    );
    let prepared: Value = app
        .http
        .post(format!("{node}/prepare"))
        .bearer_auth(admission["capability"].as_str().unwrap_or_default())
        .timeout(Duration::from_secs(8))
        .json(&json!({}))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let authorization = control(
        app,
        &format!("/internal/sessions/{id}/authorize"),
        Some(&json!({"prepare_id":prepared["prepare_id"]})),
        headers,
        true,
    )
    .await
    .map_err(|_| anyhow::anyhow!("Authorization failed"))?;
    let response = app
        .http
        .post(format!("{node}/execute"))
        .bearer_auth(authorization["capability"].as_str().unwrap_or_default())
        .header("content-type", "application/json")
        .body(body)
        .send()
        .await?
        .error_for_status()?;
    let mut stream = response.bytes_stream();
    let mut total = 0usize;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        total += chunk.len();
        anyhow::ensure!(total <= 4 * 1024 * 1024, "Output limit");
        tx.send(Ok(chunk)).await?;
    }
    Ok(())
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
