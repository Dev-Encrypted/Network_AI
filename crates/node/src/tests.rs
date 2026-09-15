// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Synthetic HTTP and signed-capability contract tests; no model is executed.
use super::*;
use network_ai_runtime::GenerationProfile;

const TEMPLATE: &str = "{% if enable_thinking %}<think>{% endif %}";
fn profile() -> GenerationProfile {
    serde_json::from_value(json!({"schema_version":1,"adapter":"llama_cpp_b10964_jinja","thinking":"disabled","chat_template_sha256":hash(TEMPLATE.as_bytes())})).unwrap()
}
fn fixture(backend_url: String) -> App {
    let key = SigningKey::from_bytes(&[71; 32]); // Synthetic test identity only.
    App {
        config: Config {
            mode: "private_lab".into(),
            control_port: 43101,
            gateway_port: 43102,
            gateway_secret: String::new(),
            capability_public_key: URL_SAFE_NO_PAD.encode(key.verifying_key().to_bytes()),
            node_id: "test-node".into(),
            node_port: 43104,
            node_invite: String::new(),
            node_name: "Synthetic fixture".into(),
            backend_url,
            backend_api_key: String::new(),
            backend_model: "synthetic-engine".into(),
            backend_kind: "openai".into(),
            generation_profile: Some(profile()),
            state_dir: String::new(),
            web_origin: "http://127.0.0.1:43100".into(),
        },
        http: client(),
        key,
        boot: "test-boot".into(),
        epoch: AtomicU64::new(1),
        ready: AtomicBool::new(true),
        storage_healthy: AtomicBool::new(true),
        permits: Arc::new(Semaphore::new(1)),
        prepared: Mutex::new(HashMap::new()),
        running: Mutex::new(HashMap::new()),
        outbox: PathBuf::new(),
        inventory: json!({}),
    }
}
fn authorization(app: &App, generation: Option<Value>) -> HeaderMap {
    let mut value = json!({"network":"network-ai-private-lab","aud":"network-ai-node","scope":"prepare",
        "session_id":"test-session","attempt_id":"test-attempt","node_id":"test-node","epoch":1,"model":"synthetic-offer",
        "backend_model":"synthetic-engine","manifest_sha256":hash(b"manifest"),"request_sha256":hash(b"request"),
        "max_output_tokens":24,"max_context_tokens":2048,"max_input_bytes":1400,"exp":now()+60});
    if let Some(generation) = generation {
        value["generation_profile"] = generation;
    }
    let message = format!(
        "{}.{}",
        URL_SAFE_NO_PAD.encode(br#"{"alg":"EdDSA","typ":"NAI-CAP","v":1}"#),
        URL_SAFE_NO_PAD.encode(serde_json::to_vec(&value).unwrap())
    );
    let token = format!(
        "{message}.{}",
        URL_SAFE_NO_PAD.encode(app.key.sign(message.as_bytes()).to_bytes())
    );
    let mut headers = HeaderMap::new();
    headers.insert(
        header::AUTHORIZATION,
        format!("Bearer {token}").parse().unwrap(),
    );
    headers
}
#[test]
fn signed_generation_terms_cannot_silently_downgrade_or_change_policy() {
    let mut app = fixture("http://127.0.0.1:43210".into());
    let value = serde_json::to_value(profile()).unwrap();
    assert!(
        app.cap(&authorization(&app, Some(value.clone())), "prepare")
            .is_ok()
    );
    assert!(app.cap(&authorization(&app, None), "prepare").is_err());
    for (field, replacement) in [
        ("thinking", json!("template_default")),
        ("chat_template_sha256", json!(hash(b"different"))),
        ("schema_version", json!(2)),
    ] {
        let mut changed = value.clone();
        changed[field] = replacement;
        assert!(
            app.cap(&authorization(&app, Some(changed)), "prepare")
                .is_err()
        );
    }
    app.config.generation_profile = None;
    assert!(
        app.cap(&authorization(&app, Some(value)), "prepare")
            .is_err()
    );
    assert!(app.cap(&authorization(&app, None), "prepare").is_ok());
}

#[derive(Clone)]
struct Backend {
    props: Arc<Mutex<Value>>,
    requests: Arc<Mutex<Vec<Value>>>,
}
#[tokio::test]
async fn actual_http_adapter_applies_policy_and_stops_before_generation_when_template_changes() {
    let backend = Backend {
        props: Arc::new(Mutex::new(json!({"chat_template":TEMPLATE}))),
        requests: Arc::new(Mutex::new(Vec::new())),
    };
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
        .await
        .unwrap();
    let mut app = fixture(format!("http://{}", listener.local_addr().unwrap()));
    let router = Router::new()
        .route("/props", get(|State(b): State<Backend>| async move { Json(b.props.lock().await.clone()) }))
        .route("/v1/models", get(|| async { Json(json!({"data":[{"id":"synthetic-engine"}]})) }))
        .route("/v1/chat/completions", post(|State(b): State<Backend>, Json(request): Json<Value>| async move {
            b.requests.lock().await.push(request);
            "data: {\"choices\":[{\"delta\":{\"content\":\"synthetic\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":1}}\n\ndata: [DONE]\n\n"
        })).with_state(backend.clone());
    let server = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    let chat = Chat::parse(br#"{"model":"synthetic-offer","messages":[{"role":"user","content":"test"}],"max_tokens":24}"#).unwrap();
    let (tx, _receiver) = mpsc::channel(8);
    let mut meter = Meter {
        prompt: 0,
        completion: 0,
        finish: None,
        done: false,
        hash: Sha256::new(),
    };
    assert_eq!(app.loaded().await.unwrap(), vec!["synthetic-engine"]);
    engine(&app, chat.clone(), &tx, &mut meter).await.unwrap();
    let sent = backend.requests.lock().await[0].clone();
    assert_eq!(
        sent["chat_template_kwargs"],
        json!({"enable_thinking":false})
    );
    assert_eq!(sent["max_tokens"], 24);
    assert_eq!(
        sent["messages"],
        serde_json::to_value(&chat.messages).unwrap()
    );
    assert_eq!(meter.prompt, 10);

    *backend.props.lock().await = json!({"chat_template":"changed after readiness"});
    assert!(engine(&app, chat.clone(), &tx, &mut meter).await.is_err());
    assert!(app.loaded().await.is_err());
    assert_eq!(
        backend.requests.lock().await.len(),
        1,
        "A mismatched template must not reach the generation endpoint"
    );
    *backend.props.lock().await = json!({"chat_template":"x".repeat(1024*1024)});
    assert!(app.loaded().await.is_err());

    *backend.props.lock().await = json!({"chat_template":TEMPLATE});
    let mut default = serde_json::to_value(profile()).unwrap();
    default["thinking"] = json!("template_default");
    app.config.generation_profile = Some(serde_json::from_value(default).unwrap());
    engine(&app, chat, &tx, &mut meter).await.unwrap();
    assert!(
        backend.requests.lock().await[1]
            .get("chat_template_kwargs")
            .is_none()
    );
    server.abort();
}
