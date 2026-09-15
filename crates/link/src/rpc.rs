// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
//! Private, pinned transport for a single guarded ggml RPC stage.
//! The worker-side guard still owns capabilities, compute limits and receipts.
use anyhow::{Context, Result, bail, ensure};
use iroh::{
    Endpoint, EndpointAddr, PublicKey, RelayMode, SecretKey,
    endpoint::{Connection, QuicTransportConfig, RecvStream, SendStream, presets},
};
use serde::{Deserialize, Serialize};
use std::{
    net::{Ipv4Addr, SocketAddr, UdpSocket},
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::Semaphore,
    task::{JoinHandle, JoinSet},
};

pub const ALPN: &[u8] = b"network-ai/guarded-rpc/1";
pub const HEADER_LIMIT: usize = 1024;
const SETUP: Duration = Duration::from_secs(5);
const BUFFER: usize = 64 * 1024;
const WINDOW: u32 = 4 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Root,
    Stage,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Binding {
    pub stage_node_id: String,
    pub route_id: String,
    pub route_sha256: String,
    pub manifest_sha256: String,
}
impl Binding {
    pub fn validate(&self) -> Result<()> {
        for id in [&self.stage_node_id, &self.route_id] {
            ensure!(
                uuid::Uuid::parse_str(id)?.to_string() == *id,
                "Use canonical UUIDs"
            );
        }
        for hash in [&self.route_sha256, &self.manifest_sha256] {
            ensure!(
                hash.len() == 64
                    && hash
                        .bytes()
                        .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)),
                "Invalid binding digest"
            );
        }
        Ok(())
    }
}

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub schema_version: u8,
    pub role: Role,
    pub binding: Binding,
    pub secret_key: String,
    pub peer_id: String,
    pub peer_addresses: Vec<SocketAddr>,
    pub bind_addr: SocketAddr,
    // Root: loopback TCP listener. Stage: loopback guard target, never an arbitrary URL.
    pub local_port: u16,
}
impl Config {
    pub fn validate(&self) -> Result<()> {
        ensure!(self.schema_version == 1, "Unsupported RPC config");
        self.binding.validate()?;
        ensure!(
            self.local_port >= 1024
                && self.bind_addr.port() >= 1024
                && !self.bind_addr.ip().is_multicast(),
            "Invalid RPC ports or bind address"
        );
        ensure!(
            !self.peer_addresses.is_empty() && self.peer_addresses.len() <= 8,
            "Use 1..8 explicit peer addresses"
        );
        ensure!(
            self.peer_addresses
                .iter()
                .all(|a| !a.ip().is_unspecified() && !a.ip().is_multicast() && a.port() >= 1024),
            "Invalid peer address"
        );
        let key: SecretKey = self.secret_key.parse()?;
        let peer: PublicKey = self.peer_id.parse()?;
        ensure!(key.public() != peer, "Peer must have a different identity");
        Ok(())
    }
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Hello {
    version: u8,
    binding: Binding,
}

#[derive(Default)]
struct Counters {
    active: AtomicU64,
    accepted: AtomicU64,
    rejected: AtomicU64,
    closed: AtomicU64,
    root_to_stage: AtomicU64,
    stage_to_root: AtomicU64,
}
#[derive(Debug, Serialize)]
pub struct Snapshot {
    pub active_tunnels: u64,
    pub accepted_tunnels: u64,
    pub rejected_tunnels: u64,
    pub closed_tunnels: u64,
    pub root_to_stage_bytes: u64,
    pub stage_to_root_bytes: u64,
}
struct Active(Arc<Counters>);
impl Active {
    fn new(c: Arc<Counters>) -> Self {
        c.active.fetch_add(1, Ordering::Relaxed);
        c.accepted.fetch_add(1, Ordering::Relaxed);
        Self(c)
    }
}
impl Drop for Active {
    fn drop(&mut self) {
        self.0.active.fetch_sub(1, Ordering::Relaxed);
        self.0.closed.fetch_add(1, Ordering::Relaxed);
    }
}

struct App {
    config: Config,
    endpoint: Endpoint,
    peer: EndpointAddr,
    slot: Arc<Semaphore>,
    counters: Arc<Counters>,
}
pub struct RpcLink {
    pub endpoint: Endpoint,
    pub local_addr: Option<SocketAddr>,
    counters: Arc<Counters>,
    task: JoinHandle<()>,
    bind_addr: SocketAddr,
}
impl RpcLink {
    pub async fn start(config: Config) -> Result<Self> {
        config.validate()?;
        let bind_addr = config.bind_addr;
        let listener = if config.role == Role::Root {
            Some(TcpListener::bind((Ipv4Addr::LOCALHOST, config.local_port)).await?)
        } else {
            None
        };
        let local_addr = listener.as_ref().map(TcpListener::local_addr).transpose()?;
        let transport = QuicTransportConfig::builder()
            .max_concurrent_bidi_streams(if config.role == Role::Stage { 1u32 } else { 0 }.into())
            .max_concurrent_uni_streams(0u32.into())
            .stream_receive_window(WINDOW.into())
            .receive_window(WINDOW.into())
            .send_window(u64::from(WINDOW))
            .keep_alive_interval(Duration::from_secs(3))
            .max_idle_timeout(Some(Duration::from_secs(15).try_into()?))
            .build();
        let endpoint = Endpoint::builder(presets::Minimal)
            .secret_key(config.secret_key.parse()?)
            .clear_ip_transports()
            .bind_addr(config.bind_addr)?
            .relay_mode(RelayMode::Disabled)
            .transport_config(transport)
            .alpns(if config.role == Role::Stage {
                vec![ALPN.to_vec()]
            } else {
                vec![]
            })
            .bind()
            .await?;
        let peer = config
            .peer_addresses
            .iter()
            .fold(EndpointAddr::new(config.peer_id.parse()?), |addr, ip| {
                addr.with_ip_addr(*ip)
            });
        let counters = Arc::new(Counters::default());
        let app = Arc::new(App {
            config,
            endpoint: endpoint.clone(),
            peer,
            slot: Arc::new(Semaphore::new(1)),
            counters: counters.clone(),
        });
        let task = tokio::spawn(async move {
            if let Some(listener) = listener {
                accept_tcp(app, listener).await;
            } else {
                accept_quic(app).await;
            }
        });
        Ok(Self {
            endpoint,
            local_addr,
            counters,
            task,
            bind_addr,
        })
    }
    pub fn snapshot(&self) -> Snapshot {
        let c = &self.counters;
        Snapshot {
            active_tunnels: c.active.load(Ordering::Relaxed),
            accepted_tunnels: c.accepted.load(Ordering::Relaxed),
            rejected_tunnels: c.rejected.load(Ordering::Relaxed),
            closed_tunnels: c.closed.load(Ordering::Relaxed),
            root_to_stage_bytes: c.root_to_stage.load(Ordering::Relaxed),
            stage_to_root_bytes: c.stage_to_root.load(Ordering::Relaxed),
        }
    }
    /// Drain owned tasks and confirm that the direct UDP address is released.
    /// An externally retained endpoint clone or occupied address is an error,
    /// not a successful close. This does not terminate another address owner.
    pub async fn close(self) -> Result<()> {
        self.endpoint.close().await;
        // Listener loops drain their JoinSets before returning. Aborting only
        // the listener drops its JoinSet without waiting for endpoint clones in
        // those child tasks, so an immediate restart can still find a bound UDP
        // socket even though close() has returned.
        self.task.await.context("RPC listener shutdown failed")?;
        drop(self.endpoint);
        // Iroh keeps the OS socket until all endpoint/driver references drop.
        // Observe the real bind state after dropping ours; a fixed sleep or a
        // retry of the next model connection would conceal incomplete cleanup.
        tokio::time::timeout(Duration::from_secs(3), async {
            loop {
                match UdpSocket::bind(self.bind_addr) {
                    Ok(socket) => {
                        drop(socket);
                        return Ok::<_, std::io::Error>(());
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::AddrInUse => {
                        tokio::time::sleep(Duration::from_millis(10)).await;
                    }
                    Err(error) => return Err(error),
                }
            }
        })
        .await
        .context("RPC UDP address remains occupied after shutdown")??;
        Ok(())
    }
}

async fn write_hello(send: &mut SendStream, binding: &Binding) -> Result<()> {
    let bytes = serde_json::to_vec(&Hello {
        version: 1,
        binding: binding.clone(),
    })?;
    ensure!(bytes.len() <= HEADER_LIMIT, "RPC header limit");
    send.write_u32(bytes.len() as u32).await?;
    send.write_all(&bytes).await?;
    Ok(())
}
async fn verify_hello(recv: &mut RecvStream, binding: &Binding) -> Result<()> {
    let len = recv.read_u32().await? as usize;
    ensure!(len > 0 && len <= HEADER_LIMIT, "RPC header limit");
    let mut bytes = vec![0; len];
    recv.read_exact(&mut bytes).await?;
    let hello: Hello = serde_json::from_slice(&bytes)?;
    ensure!(
        hello.version == 1 && hello.binding == *binding,
        "RPC binding mismatch"
    );
    Ok(())
}
async fn pump<R: AsyncRead + Unpin, W: AsyncWrite + Unpin>(
    r: &mut R,
    w: &mut W,
    count: &AtomicU64,
) -> Result<()> {
    let mut buffer = vec![0; BUFFER];
    loop {
        let n = r.read(&mut buffer).await?;
        // ggml RPC is a persistent full-duplex protocol: half-close ends this tunnel.
        ensure!(n != 0, "RPC transport ended");
        w.write_all(&buffer[..n]).await?;
        count.fetch_add(n as u64, Ordering::Relaxed);
    }
}
async fn forward(
    app: &App,
    conn: &Connection,
    mut tcp: TcpStream,
    mut send: SendStream,
    mut recv: RecvStream,
) -> Result<()> {
    tcp.set_nodelay(true)?;
    let _active = Active::new(app.counters.clone());
    let (mut read, mut write) = tcp.split();
    let (to_quic, from_quic) = if app.config.role == Role::Root {
        (&app.counters.root_to_stage, &app.counters.stage_to_root)
    } else {
        (&app.counters.stage_to_root, &app.counters.root_to_stage)
    };
    tokio::select! {
        r = pump(&mut read, &mut send, to_quic) => r,
        r = pump(&mut recv, &mut write, from_quic) => r,
        _ = conn.closed() => bail!("RPC connection closed"),
    }
}
async fn accept_tcp(app: Arc<App>, listener: TcpListener) {
    let mut tasks = JoinSet::new();
    loop {
        tokio::select! {
            _ = app.endpoint.closed() => break,
            _ = tasks.join_next(), if !tasks.is_empty() => {},
            accepted = listener.accept() => {
                let Ok((tcp, _)) = accepted else { break; };
                let Ok(slot) = app.slot.clone().try_acquire_owned() else {
                    app.counters.rejected.fetch_add(1, Ordering::Relaxed);
                    continue;
                };
                let app = app.clone();
                tasks.spawn(async move {
                    let _slot = slot;
                    let connection = tokio::time::timeout(SETUP, app.endpoint.connect(app.peer.clone(), ALPN)).await;
                    let Ok(Ok(conn)) = connection else {
                        app.counters.rejected.fetch_add(1, Ordering::Relaxed); return;
                    };
                    let setup = tokio::time::timeout(SETUP, async {
                        ensure!(conn.remote_id() == app.peer.id, "Wrong RPC peer");
                        let (mut send, mut recv) = conn.open_bi().await?;
                        write_hello(&mut send, &app.config.binding).await?;
                        verify_hello(&mut recv, &app.config.binding).await?;
                        Ok::<_, anyhow::Error>((send, recv))
                    }).await;
                    if let Ok(Ok((send, recv))) = setup {
                        let _ = forward(&app, &conn, tcp, send, recv).await;
                    } else { app.counters.rejected.fetch_add(1, Ordering::Relaxed); }
                    conn.close(1u32.into(), b"rpc tunnel ended");
                });
            }
        }
    }
    tasks.shutdown().await;
}
async fn accept_quic(app: Arc<App>) {
    let pending = Arc::new(Semaphore::new(4));
    let mut tasks = JoinSet::new();
    loop {
        tokio::select! {
            _ = tasks.join_next(), if !tasks.is_empty() => {},
            incoming = app.endpoint.accept() => {
                let Some(incoming) = incoming else { break; };
                let Ok(permit) = pending.clone().try_acquire_owned() else {
                    incoming.refuse();
                    app.counters.rejected.fetch_add(1, Ordering::Relaxed);
                    continue;
                };
                let app = app.clone();
                tasks.spawn(async move {
                    let _permit = permit;
                    let Ok(Ok(conn)) = tokio::time::timeout(SETUP, incoming).await else { return; };
                    let setup = tokio::time::timeout(SETUP, async {
                        ensure!(conn.remote_id() == app.peer.id, "Wrong RPC peer");
                        let (mut send, mut recv) = conn.accept_bi().await?;
                        verify_hello(&mut recv, &app.config.binding).await?;
                        let slot = app.slot.clone().try_acquire_owned()?;
                        // No TCP connection is made until peer and binding are verified.
                        let tcp = TcpStream::connect((Ipv4Addr::LOCALHOST, app.config.local_port)).await?;
                        write_hello(&mut send, &app.config.binding).await?;
                        Ok::<_, anyhow::Error>((tcp, send, recv, slot))
                    }).await;
                    if let Ok(Ok((tcp, send, recv, _slot))) = setup {
                        let _ = forward(&app, &conn, tcp, send, recv).await;
                    } else { app.counters.rejected.fetch_add(1, Ordering::Relaxed); }
                    conn.close(1u32.into(), b"rpc tunnel ended");
                });
            }
        }
    }
    tasks.shutdown().await;
}
