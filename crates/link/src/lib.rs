// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
//! An authenticated, bounded bridge for private node protocols. Not a general proxy.
use anyhow::{Context, Result, ensure};
use axum::{
    Router,
    body::{Body, Bytes},
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, Method, StatusCode, Uri},
    response::{IntoResponse, Response},
};
use futures_util::StreamExt;
use iroh::{Endpoint, EndpointAddr, PublicKey, RelayMode, SecretKey, endpoint::presets};
use network_ai_runtime::reqwest;
use serde::{Deserialize, Serialize};
use std::{io, net::SocketAddr, sync::Arc, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    sync::{Semaphore, mpsc},
};
use tokio_stream::wrappers::ReceiverStream;

pub const ALPN: &[u8] = b"network-ai/private-link/1";
const HEADER: usize = 8192;
const REQUEST: usize = 131072;
const CHUNK: usize = 65536;
const RESPONSE: usize = 8 * 1024 * 1024;
const DEADLINE: Duration = Duration::from_secs(195);
const HEADERS: [&str; 4] = [
    "authorization",
    "x-node-timestamp",
    "x-node-nonce",
    "x-node-signature",
];

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Control,
    Node,
}
impl Role {
    fn opposite(self) -> Self {
        match self {
            Self::Control => Self::Node,
            Self::Node => Self::Control,
        }
    }
    pub fn permits(self, method: &str, path: &str, node: &str) -> bool {
        match self {
            Self::Node => {
                (method == "GET" && path == "/health")
                    || (method == "POST" && matches!(path, "/prepare" | "/execute"))
            }
            Self::Control => {
                method == "POST"
                    && (path == "/api/v1/nodes/register"
                        || ["resume", "heartbeat", "claim", "receipts"]
                            .iter()
                            .any(|action| path == format!("/api/v1/nodes/{node}/{action}")))
            }
        }
    }
}

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub schema_version: u8,
    pub role: Role,
    pub node_id: String,
    pub secret_key: String,
    pub peer_id: String,
    pub peer_addresses: Vec<SocketAddr>,
    pub bind_addr: SocketAddr,
    pub forward_port: u16,
    pub target_port: u16,
}
impl Config {
    pub fn validate(&self) -> Result<()> {
        ensure!(self.schema_version == 1, "Unsupported link config");
        uuid::Uuid::parse_str(&self.node_id)?;
        ensure!(
            (1024..=65535).contains(&self.forward_port)
                && (1024..=65535).contains(&self.target_port)
                && self.forward_port != self.target_port,
            "Invalid local ports"
        );
        ensure!(
            !self.peer_addresses.is_empty() && self.peer_addresses.len() <= 8,
            "Use 1..8 explicit peer addresses"
        );
        ensure!(
            self.peer_addresses
                .iter()
                .all(|a| !a.ip().is_unspecified() && !a.ip().is_multicast() && a.port() > 0),
            "Invalid peer address"
        );
        let key: SecretKey = self
            .secret_key
            .parse()
            .context("Invalid private link key")?;
        let peer: PublicKey = self.peer_id.parse().context("Invalid peer identity")?;
        ensure!(key.public() != peer, "Peer must have a different identity");
        Ok(())
    }
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct RequestHead {
    version: u8,
    method: String,
    path: String,
    headers: Vec<(String, String)>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ResponseHead {
    version: u8,
    status: u16,
    content_type: String,
}

// Frames are length-prefixed. A zero frame terminates the response; transport EOF
// without it is an error, so a broken link cannot manufacture successful completion.
async fn write_frame<W: tokio::io::AsyncWrite + Unpin>(w: &mut W, data: &[u8]) -> Result<()> {
    w.write_u32(data.len().try_into()?).await?;
    w.write_all(data).await?;
    Ok(())
}
async fn read_frame<R: tokio::io::AsyncRead + Unpin>(r: &mut R, max: usize) -> Result<Vec<u8>> {
    let len = r.read_u32().await? as usize;
    ensure!(len <= max, "Frame exceeds limit");
    let mut data = vec![0; len];
    r.read_exact(&mut data).await?;
    Ok(data)
}

struct App {
    config: Config,
    endpoint: Endpoint,
    peer: EndpointAddr,
    http: reqwest::Client,
    inbound: Arc<Semaphore>,
    outbound: Arc<Semaphore>,
    connections: Arc<Semaphore>,
}

pub struct Link {
    pub endpoint: Endpoint,
    pub local_addr: SocketAddr,
    tasks: Vec<tokio::task::JoinHandle<()>>,
}
impl Link {
    pub async fn start(config: Config) -> Result<Self> {
        config.validate()?;
        let listener =
            tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, config.forward_port))
                .await?;
        let local_addr = listener.local_addr()?;
        let endpoint = Endpoint::builder(presets::Minimal)
            .secret_key(config.secret_key.parse()?)
            .clear_ip_transports()
            .bind_addr(config.bind_addr)?
            .relay_mode(RelayMode::Disabled)
            .alpns(vec![ALPN.to_vec()])
            .bind()
            .await?;
        let peer = config
            .peer_addresses
            .iter()
            .fold(EndpointAddr::new(config.peer_id.parse()?), |addr, ip| {
                addr.with_ip_addr(*ip)
            });
        let app = Arc::new(App {
            config,
            endpoint: endpoint.clone(),
            peer,
            http: network_ai_runtime::client(),
            inbound: Arc::new(Semaphore::new(16)),
            outbound: Arc::new(Semaphore::new(16)),
            connections: Arc::new(Semaphore::new(16)),
        });
        let router = Router::new()
            .fallback(proxy)
            .layer(DefaultBodyLimit::max(REQUEST))
            .with_state(app.clone());
        let http_task = tokio::spawn(async move {
            let _ = axum::serve(listener, router).await;
        });
        let accept_task = tokio::spawn(async move {
            while let Some(incoming) = app.endpoint.accept().await {
                let Ok(permit) = app.connections.clone().try_acquire_owned() else {
                    incoming.refuse();
                    continue;
                };
                let app = app.clone();
                tokio::spawn(async move {
                    let _permit = permit;
                    let Ok(Ok(conn)) = tokio::time::timeout(Duration::from_secs(5), incoming).await
                    else {
                        return;
                    };
                    if conn.remote_id() != app.peer.id {
                        conn.close(1u32.into(), b"unauthorized");
                        return;
                    }
                    loop {
                        let Ok(Ok((mut send, mut recv))) =
                            tokio::time::timeout(DEADLINE, conn.accept_bi()).await
                        else {
                            break;
                        };
                        let Ok(permit) = app.inbound.clone().try_acquire_owned() else {
                            let _ = recv.stop(2u32.into());
                            let _ = send.reset(2u32.into());
                            continue;
                        };
                        let app = app.clone();
                        tokio::spawn(async move {
                            let _permit = permit;
                            if !matches!(
                                tokio::time::timeout(DEADLINE, serve(&app, &mut send, &mut recv))
                                    .await,
                                Ok(Ok(()))
                            ) {
                                let _ = recv.stop(3u32.into());
                                let _ = send.reset(3u32.into());
                            }
                        });
                    }
                    conn.close(0u32.into(), b"idle");
                });
            }
        });
        Ok(Self {
            endpoint,
            local_addr,
            tasks: vec![http_task, accept_task],
        })
    }
    pub async fn close(self) {
        self.endpoint.close().await;
        for task in self.tasks {
            task.abort();
        }
    }
}

async fn serve(
    app: &App,
    send: &mut iroh::endpoint::SendStream,
    recv: &mut iroh::endpoint::RecvStream,
) -> Result<()> {
    let head: RequestHead = serde_json::from_slice(&read_frame(recv, HEADER).await?)?;
    ensure!(
        head.version == 1
            && app
                .config
                .role
                .permits(&head.method, &head.path, &app.config.node_id),
        "Forbidden route"
    );
    ensure!(
        head.headers.len() <= HEADERS.len()
            && head
                .headers
                .iter()
                .all(|(k, v)| HEADERS.contains(&k.as_str()) && v.len() <= 4096),
        "Forbidden headers"
    );
    let body = read_frame(recv, REQUEST).await?;
    ensure!(recv.read_to_end(0).await?.is_empty(), "Extra request data");
    let mut request = app
        .http
        .request(
            head.method.parse()?,
            format!("http://127.0.0.1:{}{}", app.config.target_port, head.path),
        )
        .header("content-type", "application/json")
        .body(body);
    for (key, value) in head.headers {
        request = request.header(key, value);
    }
    let response = tokio::select! {
        value = request.send() => value?,
        _ = send.stopped() => anyhow::bail!("Consumer disconnected"),
    };
    let content_type = if response
        .headers()
        .get("content-type")
        .is_some_and(|v| v.as_bytes().starts_with(b"text/event-stream"))
    {
        "text/event-stream; charset=utf-8"
    } else {
        "application/json"
    };
    write_frame(
        send,
        &serde_json::to_vec(&ResponseHead {
            version: 1,
            status: response.status().as_u16(),
            content_type: content_type.into(),
        })?,
    )
    .await?;
    let mut stream = response.bytes_stream();
    let mut size = 0usize;
    loop {
        let next = tokio::select! { v = stream.next() => v, _ = send.stopped() => anyhow::bail!("Consumer disconnected") };
        let Some(bytes) = next else {
            break;
        };
        let bytes = bytes?;
        size += bytes.len();
        ensure!(size <= RESPONSE, "Response exceeds limit");
        for chunk in bytes.chunks(CHUNK) {
            write_frame(send, chunk).await?;
        }
    }
    write_frame(send, &[]).await?;
    send.finish()?;
    Ok(())
}

async fn proxy(
    State(app): State<Arc<App>>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if !app
        .config
        .role
        .opposite()
        .permits(method.as_str(), &uri.to_string(), &app.config.node_id)
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    let Ok(permit) = app.outbound.clone().try_acquire_owned() else {
        return StatusCode::TOO_MANY_REQUESTS.into_response();
    };
    let head = RequestHead {
        version: 1,
        method: method.to_string(),
        path: uri.to_string(),
        headers: HEADERS
            .iter()
            .filter_map(|key| {
                headers
                    .get(*key)
                    .and_then(|v| v.to_str().ok())
                    .map(|v| (key.to_string(), v.to_owned()))
            })
            .collect(),
    };
    let Ok(encoded) = serde_json::to_vec(&head) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    if encoded.len() > HEADER {
        return StatusCode::REQUEST_HEADER_FIELDS_TOO_LARGE.into_response();
    }
    let deadline = tokio::time::Instant::now() + DEADLINE;
    let setup = tokio::time::timeout(Duration::from_secs(12), async {
        let conn = app.endpoint.connect(app.peer.clone(), ALPN).await?;
        ensure!(conn.remote_id() == app.peer.id, "Wrong peer identity");
        let (mut send, mut recv) = conn.open_bi().await?;
        write_frame(&mut send, &encoded).await?;
        write_frame(&mut send, &body).await?;
        send.finish()?;
        let head: ResponseHead = serde_json::from_slice(&read_frame(&mut recv, HEADER).await?)?;
        ensure!(
            head.version == 1
                && (200..=599).contains(&head.status)
                && matches!(
                    head.content_type.as_str(),
                    "application/json" | "text/event-stream; charset=utf-8"
                ),
            "Invalid response header"
        );
        Ok::<_, anyhow::Error>((conn, recv, head))
    })
    .await;
    let Ok(Ok((conn, mut recv, head))) = setup else {
        return StatusCode::BAD_GATEWAY.into_response();
    };
    let (tx, rx) = mpsc::channel::<std::result::Result<Bytes, io::Error>>(4);
    tokio::spawn(async move {
        let _permit = permit;
        let result = tokio::time::timeout_at(deadline, async {
            let mut size = 0;
            loop {
                let chunk = tokio::select! { r = read_frame(&mut recv, CHUNK) => r?, () = tx.closed() => anyhow::bail!("Consumer closed") };
                if chunk.is_empty() { ensure!(recv.read_to_end(0).await?.is_empty(), "Trailing response data"); break; }
                size += chunk.len(); ensure!(size <= RESPONSE, "Response exceeds limit");
                tx.send(Ok(Bytes::from(chunk))).await?;
            }
            Ok::<_, anyhow::Error>(())
        }).await;
        if !matches!(result, Ok(Ok(()))) {
            let _ = recv.stop(3u32.into());
            let _ = tx.try_send(Err(io::Error::other("Private link interrupted")));
        }
        conn.close(0u32.into(), b"request complete");
    });
    Response::builder()
        .status(head.status)
        .header("content-type", head.content_type)
        .header("cache-control", "no-store")
        .body(Body::from_stream(ReceiverStream::new(rx)))
        .expect("validated response")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn routes_cannot_escape_the_assigned_protocol() {
        let id = uuid::Uuid::new_v4().to_string();
        assert!(Role::Control.permits("POST", &format!("/api/v1/nodes/{id}/heartbeat"), &id));
        for path in [
            "/api/v1/admin/users",
            "/api/v1/nodes/other/heartbeat",
            "/api/v1/nodes/register?x=1",
            "/api/v1/nodes/register/../admin",
            "http://example.org/",
        ] {
            assert!(!Role::Control.permits("POST", path, &id));
        }
        assert!(!Role::Node.permits("GET", "/execute", &id));
        assert!(!Role::Node.permits("POST", "/execute?x=1", &id));
    }
    #[tokio::test]
    async fn framing_rejects_allocation_attack_and_truncation() {
        let mut huge: &[u8] = &u32::MAX.to_be_bytes();
        assert!(read_frame(&mut huge, HEADER).await.is_err());
        let mut short: &[u8] = &[0, 0, 0, 3, 1];
        assert!(read_frame(&mut short, HEADER).await.is_err());
    }
}
