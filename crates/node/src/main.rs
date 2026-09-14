// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
use axum::{
    Json, Router,
    body::{Body, Bytes},
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::{Signer, SigningKey};
use futures_util::StreamExt;
use network_ai_runtime::{
    Capability, Chat, Config, Error, Result, Sse, atomic_write, client, event, hash, nonce, now,
    reqwest, verify_cap,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    convert::Infallible,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::{Duration, Instant},
};
use tokio::sync::{Mutex, OwnedSemaphorePermit, Semaphore, mpsc};
use tokio_stream::wrappers::ReceiverStream;
use tokio_util::sync::CancellationToken;

struct Prepared {
    id: String,
    cap: Capability,
    until: u64,
    _permit: OwnedSemaphorePermit,
}
struct App {
    config: Config,
    http: reqwest::Client,
    key: SigningKey,
    boot: String,
    epoch: AtomicU64,
    ready: AtomicBool,
    storage_healthy: AtomicBool,
    permits: Arc<Semaphore>,
    prepared: Mutex<HashMap<String, Prepared>>,
    running: Mutex<HashMap<String, CancellationToken>>,
    outbox: PathBuf,
    inventory: Value,
}
impl App {
    async fn signed(&self, path: &str, body: &Value) -> anyhow::Result<Value> {
        let bytes = serde_json::to_vec(body)?;
        let timestamp = now();
        let nonce = nonce();
        let route = format!("/api/v1/nodes/{}{path}", self.config.node_id);
        let message = format!(
            "network-ai/node/v1\nPOST\n{route}\n{timestamp}\n{nonce}\n{}",
            hash(&bytes)
        );
        let signature = URL_SAFE_NO_PAD.encode(self.key.sign(message.as_bytes()).to_bytes());
        let response = self
            .http
            .post(format!(
                "http://127.0.0.1:{}{route}",
                self.config.control_port
            ))
            .header("content-type", "application/json")
            .header("x-node-timestamp", timestamp.to_string())
            .header("x-node-nonce", nonce)
            .header("x-node-signature", signature)
            .timeout(Duration::from_secs(5))
            .body(bytes)
            .send()
            .await?;
        let status = response.status();
        let value: Value = response.json().await?;
        anyhow::ensure!(
            status.is_success(),
            "Node control rejected with HTTP {}",
            status.as_u16()
        );
        Ok(value)
    }
    fn cap(&self, headers: &HeaderMap, scope: &str) -> Result<Capability> {
        let token = headers
            .get(header::AUTHORIZATION)
            .and_then(|h| h.to_str().ok())
            .and_then(|s| s.strip_prefix("Bearer "))
            .unwrap_or_default();
        let cap = verify_cap(token, &self.config.capability_public_key)?;
        if cap.node_id != self.config.node_id
            || cap.epoch != self.epoch.load(Ordering::SeqCst)
            || cap.backend_model != self.config.backend_model
            || cap.scope != scope
        {
            return Err(Error(
                StatusCode::UNAUTHORIZED,
                "capability_scope",
                "A autorização não pertence a este nó ou época.".into(),
            ));
        }
        Ok(cap)
    }
    async fn loaded(&self) -> anyhow::Result<Vec<String>> {
        // LM Studio's OpenAI catalog also lists unloaded weights. Read actual loaded instances.
        let endpoint = if self.config.backend_kind == "lmstudio" {
            "/api/v1/models"
        } else {
            "/v1/models"
        };
        let request = self
            .http
            .get(format!("{}{endpoint}", self.config.backend_url));
        let request = if self.config.backend_api_key.is_empty() {
            request
        } else {
            request.bearer_auth(&self.config.backend_api_key)
        };
        let data: Value = request
            .timeout(Duration::from_secs(4))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        let mut names = Vec::new();
        if self.config.backend_kind == "lmstudio" {
            for model in data["models"].as_array().into_iter().flatten() {
                for instance in model["loaded_instances"].as_array().into_iter().flatten() {
                    if let Some(id) = instance["id"].as_str() {
                        names.push(id.to_owned());
                    }
                }
            }
        } else {
            for model in data["data"].as_array().into_iter().flatten() {
                if let Some(id) = model["id"].as_str() {
                    names.push(id.to_owned());
                }
            }
        }
        names.truncate(32);
        Ok(names)
    }
    async fn heartbeat(&self) -> anyhow::Result<()> {
        self.prepared.lock().await.retain(|_, p| p.until >= now());
        let loaded = self.loaded().await.unwrap_or_default();
        let running = self
            .running
            .lock()
            .await
            .keys()
            .cloned()
            .collect::<Vec<_>>();
        let ready = loaded.contains(&self.config.backend_model)
            && self.storage_healthy.load(Ordering::SeqCst);
        let advertised = if ready {
            vec![self.config.backend_model.clone()]
        } else {
            Vec::new()
        };
        let response=self.signed("/heartbeat",&json!({"boot_id":self.boot,"epoch":self.epoch.load(Ordering::SeqCst),
            "state":if ready{"READY"}else{"VALIDATING"},"loaded_backend_models":advertised,"running_sessions":running,"inventory":self.inventory})).await?;
        self.ready.store(
            ready && response["desired_state"] == "READY" && response["state"] == "READY",
            Ordering::SeqCst,
        );
        let running = self.running.lock().await;
        for id in response["cancel_sessions"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
        {
            if let Some(token) = running.get(id) {
                token.cancel();
            }
        }
        Ok(())
    }
    async fn flush_outbox(&self) -> anyhow::Result<()> {
        for entry in std::fs::read_dir(&self.outbox)?.take(100) {
            let path = entry?.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let receipt: Value = serde_json::from_slice(&std::fs::read(&path)?)?;
            let response = self.signed("/receipts", &receipt).await?;
            if response["accepted"] == true || response["terminal"] == true {
                std::fs::remove_file(path)?;
            }
        }
        Ok(())
    }
}
async fn health(State(app): State<Arc<App>>) -> Json<Value> {
    Json(
        json!({"status":"ok","mode":"private_lab","component":"node","node_id":app.config.node_id,
        "epoch":app.epoch.load(Ordering::SeqCst),"ready":app.ready.load(Ordering::SeqCst),"running":app.running.lock().await.len()}),
    )
}
async fn prepare(State(app): State<Arc<App>>, headers: HeaderMap) -> Result<Json<Value>> {
    let cap = app.cap(&headers, "prepare")?;
    if !app.ready.load(Ordering::SeqCst) {
        return Err(Error(
            StatusCode::SERVICE_UNAVAILABLE,
            "node_not_ready",
            "O nó não está pronto.".into(),
        ));
    }
    let mut prepared = app.prepared.lock().await;
    prepared.retain(|_, p| p.until >= now());
    if let Some(existing) = prepared.get(&cap.session_id) {
        if existing.cap.attempt_id == cap.attempt_id {
            return Ok(Json(json!({"prepare_id":existing.id})));
        }
        return Err(Error::new(
            "prepare_conflict",
            "Outra tentativa já reservou esta sessão.",
        ));
    }
    let permit = app.permits.clone().try_acquire_owned().map_err(|_| {
        Error(
            StatusCode::CONFLICT,
            "node_busy",
            "A capacidade local está ocupada.".into(),
        )
    })?;
    let id = nonce();
    prepared.insert(
        cap.session_id.clone(),
        Prepared {
            id: id.clone(),
            until: (now() + 15).min(cap.exp),
            cap,
            _permit: permit,
        },
    );
    Ok(Json(json!({"prepare_id":id})))
}
async fn execute(State(app): State<Arc<App>>, headers: HeaderMap, body: Bytes) -> Result<Response> {
    let cap = app.cap(&headers, "execute")?;
    let chat = Chat::parse(&body)?;
    if hash(&body) != cap.request_sha256
        || chat.model != cap.model
        || chat.max_tokens != cap.max_output_tokens
        || chat.content_bytes() > cap.max_input_bytes
        || chat.content_bytes() + chat.messages.len() * 64 + chat.max_tokens as usize
            > cap.max_context_tokens as usize
    {
        return Err(Error::new(
            "request_binding",
            "O conteúdo não corresponde à autorização.",
        ));
    }
    let prepared = {
        let mut map = app.prepared.lock().await;
        let p = map
            .get(&cap.session_id)
            .ok_or_else(|| Error::new("prepare_missing", "Reserva local não encontrada."))?;
        if p.until < now()
            || Some(&p.id) != cap.prepare_id.as_ref()
            || p.cap.attempt_id != cap.attempt_id
        {
            return Err(Error::new(
                "prepare_expired",
                "Reserva local inválida ou expirada.",
            ));
        }
        map.remove(&cap.session_id).expect("checked under lock")
    };
    app.signed("/claim",&json!({"session_id":cap.session_id,"attempt_id":cap.attempt_id,"epoch":cap.epoch,"prepare_id":cap.prepare_id})).await
        .map_err(|_|Error(StatusCode::CONFLICT,"claim_rejected","A execução não pôde ser autorizada.".into()))?;
    let cancellation = CancellationToken::new();
    app.running
        .lock()
        .await
        .insert(cap.session_id.clone(), cancellation.clone());
    let (tx, rx) = mpsc::channel::<std::result::Result<Bytes, Infallible>>(16);
    tokio::spawn(run(app, cap, chat, prepared, cancellation, tx));
    let mut response = Body::from_stream(ReceiverStream::new(rx)).into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        "text/event-stream; charset=utf-8".parse().unwrap(),
    );
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    Ok(response)
}
struct Meter {
    prompt: u64,
    completion: u64,
    finish: Option<String>,
    done: bool,
    hash: Sha256,
}
async fn engine(
    app: &App,
    chat: Chat,
    tx: &mpsc::Sender<std::result::Result<Bytes, Infallible>>,
    meter: &mut Meter,
) -> anyhow::Result<()> {
    let mut request = serde_json::to_value(chat)?;
    request["model"] = json!(app.config.backend_model);
    request["stream"] = json!(true);
    request["stream_options"] = json!({"include_usage":true});
    // A local, explicit operator profile. This does not enable arbitrary extra client parameters.
    if app.config.backend_kind == "lmstudio" {
        request["chat_template_kwargs"] = json!({"enable_thinking":false});
    }
    let backend_request = app
        .http
        .post(format!("{}/v1/chat/completions", app.config.backend_url));
    let backend_request = if app.config.backend_api_key.is_empty() {
        backend_request
    } else {
        backend_request.bearer_auth(&app.config.backend_api_key)
    };
    let response = backend_request
        .json(&request)
        .send()
        .await?
        .error_for_status()?;
    let mut stream = response.bytes_stream();
    let mut parser = Sse::default();
    let mut total = 0usize;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        total += chunk.len();
        anyhow::ensure!(total <= 4 * 1024 * 1024, "Output size limit");
        meter.hash.update(&chunk);
        for data in parser.push(&chunk)? {
            if data == "[DONE]" {
                meter.done = true;
                continue;
            }
            let value: Value = serde_json::from_str(&data)?;
            anyhow::ensure!(value.get("error").is_none(), "Engine error event");
            if let Some(usage) = value.get("usage").filter(|v| !v.is_null()) {
                meter.prompt = usage["prompt_tokens"]
                    .as_u64()
                    .ok_or_else(|| anyhow::anyhow!("Usage missing input"))?;
                meter.completion = usage["completion_tokens"]
                    .as_u64()
                    .ok_or_else(|| anyhow::anyhow!("Usage missing output"))?;
            }
            if let Some(reason) = value["choices"][0]["finish_reason"].as_str() {
                meter.finish = Some(reason.to_owned());
            }
            tx.send(Ok(Bytes::from(event(&value)))).await?;
        }
    }
    anyhow::ensure!(
        meter.done && meter.finish.is_some() && meter.prompt > 0 && meter.completion > 0,
        "Incomplete engine stream"
    );
    Ok(())
}
async fn run(
    app: Arc<App>,
    cap: Capability,
    chat: Chat,
    _prepared: Prepared,
    cancel: CancellationToken,
    tx: mpsc::Sender<std::result::Result<Bytes, Infallible>>,
) {
    let start = Instant::now();
    let mut meter = Meter {
        prompt: 0,
        completion: 0,
        finish: None,
        done: false,
        hash: Sha256::new(),
    };
    let (state, error) = tokio::select! {
        outcome=engine(&app,chat,&tx,&mut meter)=>if outcome.is_ok(){("COMPLETED",None)}else{("FAILED",Some("engine_failed"))},
        ()=cancel.cancelled()=>("CANCELLED",Some("cancelled")),
        ()=tx.closed()=>("CANCELLED",Some("client_disconnected")),
        ()=tokio::time::sleep(Duration::from_secs(cap.exp.saturating_sub(now())))=>("INTERRUPTED",Some("execution_timeout")),
    };
    let receipt = json!({"session_id":cap.session_id,"attempt_id":cap.attempt_id,"epoch":cap.epoch,"state":state,
        "prompt_tokens":meter.prompt.min(1_000_000),"completion_tokens":meter.completion.min(100_000),"output_sha256":format!("{:x}",meter.hash.finalize()),
        "stream_done":meter.done,"finish_reason":meter.finish,"error_code":error,"elapsed_ms":start.elapsed().as_millis().min(3_600_000) as u64,"metering_source":"engine_reported"});
    let path = app.outbox.join(format!("{}.json", cap.session_id));
    let persisted =
        atomic_write(&path, &serde_json::to_vec(&receipt).expect("Receipt JSON")).is_ok();
    if !persisted {
        app.storage_healthy.store(false, Ordering::SeqCst);
        app.ready.store(false, Ordering::SeqCst);
    }
    let settlement = if persisted {
        app.signed("/receipts", &receipt).await.ok()
    } else {
        None
    };
    if settlement
        .as_ref()
        .is_some_and(|v| v["accepted"] == true || v["terminal"] == true)
    {
        let _ = std::fs::remove_file(&path);
    }
    app.running.lock().await.remove(&cap.session_id);
    let successful = persisted
        && state == "COMPLETED"
        && !settlement.as_ref().is_some_and(|s| {
            s["state"] == "FAILED" || s["state"] == "CANCELLED" || s["terminal"] == true
        });
    if successful {
        let status = settlement.unwrap_or_else(|| json!({"receipt_pending":true}));
        let _ = tx
            .send(Ok(Bytes::from(format!(
                "event: network_ai_receipt\ndata: {status}\n\n"
            ))))
            .await;
        let _ = tx.send(Ok(Bytes::from_static(b"data: [DONE]\n\n"))).await;
    } else {
        let _=tx.send(Ok(Bytes::from(event(&json!({"error":{"code":error.unwrap_or("settlement_disputed"),"message":"Execução encerrada sem cobrança confirmada.","session_id":cap.session_id}}))))).await;
    }
}
async fn inventory() -> Value {
    let mut command = tokio::process::Command::new("nvidia-smi");
    command.args([
        "--query-gpu=name,memory.total,memory.free",
        "--format=csv,noheader,nounits",
    ]);
    #[cfg(windows)]
    {
        command.creation_flags(0x08000000);
    }
    let output = tokio::time::timeout(Duration::from_secs(3), command.output()).await;
    let values = if let Ok(Ok(out)) = output {
        String::from_utf8_lossy(&out.stdout)
            .lines()
            .next()
            .unwrap_or_default()
            .split(',')
            .map(|v| v.trim().to_owned())
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };
    json!({"os":std::env::consts::OS,"gpu_name":values.first(),"memory_total_mib":values.get(1).and_then(|v|v.parse::<u64>().ok()),
        "memory_free_mib":values.get(2).and_then(|v|v.parse::<u64>().ok()),"physical_domain_hint":"operator-assigned; inventory at process start"})
}
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = Config::load()?;
    let port = config.node_port;
    let directory = PathBuf::from(&config.state_dir).join("node");
    std::fs::create_dir_all(directory.join("outbox"))?;
    let path = directory.join("identity.key");
    let seed: [u8; 32] = if path.exists() {
        URL_SAFE_NO_PAD
            .decode(std::fs::read_to_string(&path)?.trim())?
            .try_into()
            .map_err(|_| anyhow::anyhow!("Invalid node identity"))?
    } else {
        let seed = rand::random::<[u8; 32]>();
        atomic_write(&path, URL_SAFE_NO_PAD.encode(seed).as_bytes())?;
        seed
    };
    let app = Arc::new(App {
        config,
        http: client(),
        key: SigningKey::from_bytes(&seed),
        boot: uuid::Uuid::new_v4().to_string(),
        epoch: AtomicU64::new(0),
        ready: AtomicBool::new(false),
        storage_healthy: AtomicBool::new(true),
        permits: Arc::new(Semaphore::new(1)),
        prepared: Mutex::new(HashMap::new()),
        running: Mutex::new(HashMap::new()),
        outbox: directory.join("outbox"),
        inventory: inventory().await,
    });
    let resume = app.signed("/resume", &json!({"boot_id":app.boot})).await;
    let registration = if let Ok(value) = resume {
        value
    } else {
        let timestamp = now();
        let nonce = nonce();
        let public_key = URL_SAFE_NO_PAD.encode(app.key.verifying_key().to_bytes());
        let message = format!(
            "network-ai/register/v1\n{}\n{nonce}\n{public_key}\n{}\n{timestamp}",
            hash(app.config.node_invite.as_bytes()),
            app.boot
        );
        let value = json!({"invite":app.config.node_invite,"name":app.config.node_name,"public_key":public_key,"nonce":nonce,"timestamp":timestamp,
            "signature":URL_SAFE_NO_PAD.encode(app.key.sign(message.as_bytes()).to_bytes()),"boot_id":app.boot});
        app.http
            .post(app.config.control("/nodes/register"))
            .json(&value)
            .timeout(Duration::from_secs(5))
            .send()
            .await?
            .error_for_status()?
            .json::<Value>()
            .await?
    };
    anyhow::ensure!(
        registration["id"] == app.config.node_id,
        "Unexpected node registration"
    );
    app.epoch.store(
        registration["epoch"]
            .as_u64()
            .ok_or_else(|| anyhow::anyhow!("Missing epoch"))?,
        Ordering::SeqCst,
    );
    app.heartbeat().await?;
    let background = app.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(2)).await;
            if background.heartbeat().await.is_err() {
                background.ready.store(false, Ordering::SeqCst);
            }
            let _ = background.flush_outbox().await;
        }
    });
    let router = Router::new()
        .route("/health", get(health))
        .route("/prepare", post(prepare))
        .route("/execute", post(execute))
        .layer(DefaultBodyLimit::max(131072))
        .with_state(app);
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).await?;
    println!("NETWORK AI node ready on 127.0.0.1:{port} (private_lab)");
    axum::serve(listener, router)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
