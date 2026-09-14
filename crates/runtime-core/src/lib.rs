// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
pub use reqwest;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    path::Path,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Deserialize)]
pub struct Config {
    pub mode: String,
    pub control_port: u16,
    pub gateway_port: u16,
    #[serde(default)]
    pub gateway_secret: String,
    pub capability_public_key: String,
    pub node_id: String,
    pub node_port: u16,
    pub node_invite: String,
    pub node_name: String,
    pub backend_url: String,
    #[serde(default)]
    pub backend_api_key: String,
    pub backend_model: String,
    pub backend_kind: String,
    pub state_dir: String,
    pub web_origin: String,
}
impl Config {
    pub fn load() -> anyhow::Result<Self> {
        let path = std::env::var("NETWORK_AI_CONFIG")?;
        let value: Self = serde_json::from_slice(&std::fs::read(path)?)?;
        anyhow::ensure!(value.mode == "private_lab", "Only private_lab is supported");
        let url = reqwest::Url::parse(&value.backend_url)?;
        anyhow::ensure!(
            url.scheme() == "http"
                && url.host_str() == Some("127.0.0.1")
                && url.username().is_empty()
                && url.password().is_none()
                && url.query().is_none()
                && url.fragment().is_none(),
            "Backend must be a local operator endpoint"
        );
        anyhow::ensure!(
            (43103..=43299).contains(&value.node_port),
            "Node port is outside the local range"
        );
        Ok(value)
    }
    pub fn control(&self, path: &str) -> String {
        format!("http://127.0.0.1:{}/api/v1{}", self.control_port, path)
    }
}
pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(190))
        .build()
        .expect("HTTP client")
}
pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
pub fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub fn nonce() -> String {
    URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>())
}
pub fn atomic_write(path: &Path, bytes: &[u8]) -> anyhow::Result<()> {
    use std::io::Write;
    let temporary = path.with_extension("tmp");
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&temporary)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);
    std::fs::rename(temporary, path)?;
    Ok(())
}
#[derive(Debug)]
pub struct Error(pub StatusCode, pub &'static str, pub String);
impl Error {
    pub fn new(code: &'static str, message: &str) -> Self {
        Self(StatusCode::BAD_REQUEST, code, message.into())
    }
}
impl IntoResponse for Error {
    fn into_response(self) -> Response {
        (
            self.0,
            Json(json!({"error":{"code":self.1,"message":self.2}})),
        )
            .into_response()
    }
}
pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Message {
    pub role: String,
    pub content: String,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct StreamOptions {
    pub include_usage: bool,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Chat {
    pub model: String,
    pub messages: Vec<Message>,
    #[serde(default)]
    pub stream: bool,
    #[serde(default = "default_tokens")]
    pub max_tokens: u32,
    #[serde(default = "default_temperature")]
    pub temperature: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream_options: Option<StreamOptions>,
}
fn default_tokens() -> u32 {
    256
}
fn default_temperature() -> f32 {
    0.7
}
impl Chat {
    pub fn parse(bytes: &[u8]) -> Result<Self> {
        let value: Self = serde_json::from_slice(bytes).map_err(|_| {
            Error::new(
                "invalid_request",
                "Formato de chat inválido ou campo não suportado.",
            )
        })?;
        let stop_valid = match &value.stop {
            None => true,
            Some(Value::String(s)) => s.len() <= 100,
            Some(Value::Array(items)) => {
                items.len() <= 4
                    && items
                        .iter()
                        .all(|i| i.as_str().is_some_and(|s| s.len() <= 100))
            }
            _ => false,
        };
        if value.model.is_empty()
            || value.model.len() > 80
            || value.messages.is_empty()
            || value.messages.len() > 64
            || value.messages.iter().any(|m| {
                !["system", "user", "assistant"].contains(&m.role.as_str())
                    || m.content.len() > 65536
            })
            || value.max_tokens == 0
            || value.max_tokens > 8192
            || !(0.0..=2.0).contains(&value.temperature)
            || value.top_p.is_some_and(|p| !(0.01..=1.0).contains(&p))
            || value.n.is_some_and(|n| n != 1)
            || !stop_valid
        {
            return Err(Error::new(
                "invalid_request",
                "Os parâmetros excedem o contrato de chat deste ambiente.",
            ));
        }
        Ok(value)
    }
    pub fn content_bytes(&self) -> usize {
        self.messages.iter().map(|m| m.content.len()).sum()
    }
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Capability {
    pub network: String,
    pub aud: String,
    pub scope: String,
    pub session_id: String,
    pub attempt_id: String,
    pub node_id: String,
    pub epoch: u64,
    pub model: String,
    pub backend_model: String,
    pub manifest_sha256: String,
    pub request_sha256: String,
    pub max_output_tokens: u32,
    pub max_context_tokens: u32,
    pub max_input_bytes: usize,
    pub prepare_id: Option<String>,
    pub exp: u64,
}
pub fn verify_cap(token: &str, public_key: &str) -> Result<Capability> {
    let invalid = || {
        Error(
            StatusCode::UNAUTHORIZED,
            "invalid_capability",
            "Autorização de execução inválida.".into(),
        )
    };
    if token.len() > 8192 {
        return Err(invalid());
    }
    let parts: Vec<_> = token.split('.').collect();
    if parts.len() != 3 {
        return Err(invalid());
    }
    let key: [u8; 32] = URL_SAFE_NO_PAD
        .decode(public_key)
        .map_err(|_| invalid())?
        .try_into()
        .map_err(|_| invalid())?;
    let header: Value =
        serde_json::from_slice(&URL_SAFE_NO_PAD.decode(parts[0]).map_err(|_| invalid())?)
            .map_err(|_| invalid())?;
    if header != json!({"alg":"EdDSA","typ":"NAI-CAP","v":1}) {
        return Err(invalid());
    }
    let signature =
        Signature::from_slice(&URL_SAFE_NO_PAD.decode(parts[2]).map_err(|_| invalid())?)
            .map_err(|_| invalid())?;
    VerifyingKey::from_bytes(&key)
        .map_err(|_| invalid())?
        .verify(format!("{}.{}", parts[0], parts[1]).as_bytes(), &signature)
        .map_err(|_| invalid())?;
    let cap: Capability =
        serde_json::from_slice(&URL_SAFE_NO_PAD.decode(parts[1]).map_err(|_| invalid())?)
            .map_err(|_| invalid())?;
    if cap.exp < now()
        || cap.exp > now() + 190
        || cap.network != "network-ai-private-lab"
        || cap.aud != "network-ai-node"
    {
        return Err(invalid());
    }
    Ok(cap)
}
/// Bounded incremental SSE decoder. UTF-8 is decoded only after a complete event arrives.
#[derive(Default)]
pub struct Sse {
    buffer: Vec<u8>,
}
impl Sse {
    pub fn push(&mut self, bytes: &[u8]) -> anyhow::Result<Vec<String>> {
        self.buffer.extend_from_slice(bytes);
        let mut result = Vec::new();
        loop {
            let lf = self
                .buffer
                .windows(2)
                .position(|w| w == b"\n\n")
                .map(|i| (i, 2));
            let crlf = self
                .buffer
                .windows(4)
                .position(|w| w == b"\r\n\r\n")
                .map(|i| (i, 4));
            let next = match (lf, crlf) {
                (Some(a), Some(b)) => Some(if a.0 < b.0 { a } else { b }),
                (a, b) => a.or(b),
            };
            let Some((end, separator)) = next else {
                break;
            };
            anyhow::ensure!(end <= 65536, "SSE event limit");
            let event = String::from_utf8(self.buffer.drain(..end + separator).collect())?;
            let data = event
                .lines()
                .filter_map(|line| line.strip_prefix("data:").map(str::trim_start))
                .collect::<Vec<_>>()
                .join("\n");
            if !data.is_empty() {
                result.push(data);
            }
        }
        anyhow::ensure!(self.buffer.len() <= 65536, "SSE event limit");
        Ok(result)
    }
}
pub fn event(value: &Value) -> String {
    format!("data: {}\n\n", value)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sse_handles_split_utf8_and_crlf() {
        let mut parser = Sse::default();
        let b = "data: {\"text\":\"ação\"}\r\n\r\n".as_bytes();
        let mut events = Vec::new();
        for byte in b {
            events.extend(parser.push(&[*byte]).unwrap());
        }
        assert_eq!(events, vec!["{\"text\":\"ação\"}"]);
    }
    #[test]
    fn rejects_oversized_sse() {
        assert!(Sse::default().push(&vec![b'a'; 65537]).is_err());
    }
    #[test]
    fn rejects_unsupported_fields() {
        assert!(
            Chat::parse(br#"{"model":"x","messages":[{"role":"user","content":"ok"}],"tools":[]}"#)
                .is_err()
        );
    }
    #[test]
    fn rejects_unsigned_capability() {
        assert!(verify_cap("a.b.c", &URL_SAFE_NO_PAD.encode([0; 32])).is_err());
    }
}
