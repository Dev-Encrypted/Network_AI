// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
use anyhow::{Context, Result};
use iroh::{Endpoint, EndpointAddr, RelayMode, SecretKey, endpoint::presets};
use network_ai_link::rpc::{ALPN, Binding, Config, HEADER_LIMIT, Role, RpcLink};
use std::{
    collections::HashSet,
    net::{Ipv4Addr, TcpListener, UdpSocket},
    sync::{LazyLock, Mutex},
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
    time::timeout,
};

fn tcp() -> u16 {
    static CLAIMED: LazyLock<Mutex<HashSet<u16>>> = LazyLock::new(|| Mutex::new(HashSet::new()));
    let mut claimed = CLAIMED.lock().unwrap();
    loop {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        if claimed.insert(port) {
            return port;
        }
    }
}
fn udp() -> u16 {
    // The OS may return a just-probed port again before the endpoint owns it.
    // Do not assign that number to a second fixture in this concurrent suite.
    static CLAIMED: LazyLock<Mutex<HashSet<u16>>> = LazyLock::new(|| Mutex::new(HashSet::new()));
    let mut claimed = CLAIMED.lock().unwrap();
    loop {
        let socket = UdpSocket::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = socket.local_addr().unwrap().port();
        if claimed.insert(port) {
            return port;
        }
    }
}
fn configs(target: u16) -> (Config, Config) {
    let binding = Binding {
        stage_node_id: uuid::Uuid::new_v4().to_string(),
        route_id: uuid::Uuid::new_v4().to_string(),
        route_sha256: "a1".repeat(32),
        manifest_sha256: "b2".repeat(32),
    };
    let root = Config {
        schema_version: 1,
        role: Role::Root,
        binding,
        secret_key: "16".repeat(32),
        peer_id: SecretKey::from_bytes(&[23; 32]).public().to_string(),
        peer_addresses: vec![format!("127.0.0.1:{}", udp()).parse().unwrap()],
        bind_addr: format!("127.0.0.1:{}", udp()).parse().unwrap(),
        local_port: tcp(),
    };
    let stage = Config {
        role: Role::Stage,
        secret_key: "17".repeat(32),
        peer_id: SecretKey::from_bytes(&[22; 32]).public().to_string(),
        peer_addresses: vec![root.bind_addr],
        bind_addr: root.peer_addresses[0],
        local_port: target,
        ..root.clone()
    };
    (root, stage)
}
async fn raw(key: u8, port: u16) -> Result<Endpoint> {
    Ok(Endpoint::builder(presets::Minimal)
        .secret_key(SecretKey::from_bytes(&[key; 32]))
        .clear_ip_transports()
        .bind_addr(format!("127.0.0.1:{port}"))?
        .relay_mode(RelayMode::Disabled)
        .bind()
        .await?)
}
async fn ended(tcp: &mut TcpStream) -> Result<()> {
    let mut buf = [0u8; 1];
    let result = timeout(Duration::from_secs(3), tcp.read(&mut buf)).await?;
    assert!(
        matches!(result, Ok(0) | Err(_)),
        "Unexpected bytes after transport ended"
    );
    Ok(())
}
async fn idle(link: &RpcLink) -> Result<()> {
    timeout(Duration::from_secs(3), async {
        while link.snapshot().active_tunnels != 0 {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await?;
    Ok(())
}

#[tokio::test]
async fn streamed_payload_backpressure_slot_and_keepalive() -> Result<()> {
    let target = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
    let (r, s) = configs(target.local_addr()?.port());
    let stage = RpcLink::start(s).await?;
    let root = RpcLink::start(r).await?;
    let mut client = TcpStream::connect(root.local_addr.unwrap()).await?;
    let (mut worker, _) = timeout(Duration::from_secs(5), target.accept()).await??;
    let payload: Vec<u8> = (0..16 * 1024 * 1024).map(|n| (n % 251) as u8).collect();
    let expected = payload.clone();
    let echo = tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(250)).await;
        let mut buf = vec![0u8; 65536];
        loop {
            let n = worker.read(&mut buf).await?;
            if n == 0 {
                return Ok::<_, std::io::Error>(());
            }
            worker.write_all(&buf[..n]).await?;
        }
    });
    let mut duplicate = TcpStream::connect(root.local_addr.unwrap()).await?;
    ended(&mut duplicate).await?;
    let (mut read, mut write) = client.split();
    let (sent, received) = timeout(Duration::from_secs(30), async {
        tokio::join!(write.write_all(&payload), async {
            let mut got = vec![0u8; expected.len()];
            read.read_exact(&mut got).await?;
            assert_eq!(got, expected);
            Ok::<_, std::io::Error>(())
        })
    })
    .await?;
    sent?;
    received?;
    // Longer than the configured network idle timeout: keepalive preserves an idle loaded model.
    tokio::time::sleep(Duration::from_secs(17)).await;
    client.write_all(b"still-loaded").await?;
    let mut reply = [0u8; 12];
    timeout(Duration::from_secs(3), client.read_exact(&mut reply)).await??;
    assert_eq!(&reply, b"still-loaded");
    assert_eq!(root.snapshot().accepted_tunnels, 1);
    assert_eq!(root.snapshot().rejected_tunnels, 1);
    assert_eq!(stage.snapshot().active_tunnels, 1);
    assert_eq!(
        root.snapshot().root_to_stage_bytes,
        payload.len() as u64 + 12
    );
    assert_eq!(
        root.snapshot().stage_to_root_bytes,
        payload.len() as u64 + 12
    );
    assert_eq!(
        stage.snapshot().root_to_stage_bytes,
        payload.len() as u64 + 12
    );
    drop(client);
    idle(&root).await?;
    idle(&stage).await?;
    let _ = echo.await?;
    root.close().await?;
    stage.close().await?;
    Ok(())
}

#[tokio::test]
async fn identities_headers_and_protocol_rejected_before_guard_connection() -> Result<()> {
    let target = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
    let (r, s) = configs(target.local_addr()?.port());
    let address =
        EndpointAddr::new(s.secret_key.parse::<SecretKey>()?.public()).with_ip_addr(s.bind_addr);
    let stage = RpcLink::start(s).await?;
    let root = raw(22, r.bind_addr.port()).await?;
    let intruder = raw(24, udp()).await?;
    if let Ok(conn) = intruder.connect(address.clone(), ALPN).await {
        timeout(Duration::from_secs(3), conn.closed()).await?;
    }
    assert!(
        root.connect(address.clone(), network_ai_link::ALPN)
            .await
            .is_err()
    );
    let valid = serde_json::json!({"version":1,"binding":r.binding});
    let mut variants = vec![vec![], b"invalid-json".to_vec()];
    for field in [
        "stage_node_id",
        "route_id",
        "route_sha256",
        "manifest_sha256",
    ] {
        let mut v = valid.clone();
        v["binding"][field] = "wrong".into();
        variants.push(serde_json::to_vec(&v)?);
    }
    let mut version = valid.clone();
    version["version"] = 2.into();
    variants.push(serde_json::to_vec(&version)?);
    let mut extra = valid.clone();
    extra["target_port"] = 12345.into();
    variants.push(serde_json::to_vec(&extra)?);
    for bytes in variants {
        let conn = root.connect(address.clone(), ALPN).await?;
        let (mut send, _) = conn.open_bi().await?;
        send.write_u32(bytes.len() as u32).await?;
        send.write_all(&bytes).await?;
        timeout(Duration::from_secs(3), conn.closed()).await?;
    }
    let conn = root.connect(address.clone(), ALPN).await?;
    let (mut send, _) = conn.open_bi().await?;
    send.write_u32(HEADER_LIMIT as u32 + 1).await?;
    // No oversized body needs to be sent or allocated for rejection.
    timeout(Duration::from_secs(3), conn.closed()).await?;
    let conn = root.connect(address, ALPN).await?;
    let (mut send, _) = conn.open_bi().await?;
    send.write_u32(500).await?;
    send.write_all(b"{").await?;
    timeout(Duration::from_secs(7), conn.closed()).await?;
    assert!(
        timeout(Duration::from_millis(100), target.accept())
            .await
            .is_err()
    );
    assert_eq!(stage.snapshot().accepted_tunnels, 0);
    assert!(stage.snapshot().rejected_tunnels >= 11);
    intruder.close().await;
    root.close().await;
    stage.close().await?;
    Ok(())
}

#[tokio::test]
async fn stage_enforces_one_tunnel_even_across_pinned_peer_connections() -> Result<()> {
    let target = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
    let (r, s) = configs(target.local_addr()?.port());
    let address =
        EndpointAddr::new(s.secret_key.parse::<SecretKey>()?.public()).with_ip_addr(s.bind_addr);
    let stage = RpcLink::start(s).await?;
    let root = raw(22, r.bind_addr.port()).await?;
    let hello = serde_json::to_vec(&serde_json::json!({"version":1,"binding":r.binding}))?;
    let first = root.connect(address.clone(), ALPN).await?;
    let (mut send, mut recv) = first.open_bi().await?;
    send.write_u32(hello.len() as u32).await?;
    send.write_all(&hello).await?;
    let (worker, _) = timeout(Duration::from_secs(5), target.accept()).await??;
    let len = recv.read_u32().await?;
    let mut ack = vec![0; len as usize];
    recv.read_exact(&mut ack).await?;
    let duplicate = root.connect(address.clone(), ALPN).await?;
    let (mut other, _) = duplicate.open_bi().await?;
    other.write_u32(hello.len() as u32).await?;
    other.write_all(&hello).await?;
    timeout(Duration::from_secs(3), duplicate.closed()).await?;
    assert!(
        timeout(Duration::from_millis(100), target.accept())
            .await
            .is_err()
    );
    assert_eq!(stage.snapshot().active_tunnels, 1);
    drop(worker);
    timeout(Duration::from_secs(3), first.closed()).await?;
    idle(&stage).await?;
    assert_eq!(stage.snapshot().closed_tunnels, 1);
    root.close().await;
    stage.close().await?;
    Ok(())
}

#[tokio::test]
async fn broken_link_closes_tcp_and_restarted_peer_can_reconnect() -> Result<()> {
    let target = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
    let (r, s) = configs(target.local_addr()?.port());
    let stage_address = s.bind_addr;
    let root_address = r.bind_addr;
    let stage = RpcLink::start(s.clone())
        .await
        .context("initial stage bind")?;
    let root = RpcLink::start(r).await.context("initial root bind")?;
    let mut client = TcpStream::connect(root.local_addr.unwrap()).await?;
    let (mut worker, _) = timeout(Duration::from_secs(5), target.accept()).await??;
    worker.write_all(b"partial").await?;
    let mut partial = [0; 7];
    client.read_exact(&mut partial).await?;
    assert_eq!(&partial, b"partial");
    stage.close().await?;
    // A completed close must release the actual port before any retry/delay.
    drop(UdpSocket::bind(stage_address).context("stage UDP port retained after close")?);
    ended(&mut client).await?;
    ended(&mut worker).await?;
    idle(&root).await?;
    let stage = RpcLink::start(s).await.context("restarted stage bind")?;
    let mut client = TcpStream::connect(root.local_addr.unwrap()).await?;
    let (mut worker, _) = timeout(Duration::from_secs(5), target.accept()).await??;
    client.write_all(b"new-model-connection").await?;
    let mut actual = [0; 20];
    worker.read_exact(&mut actual).await?;
    assert_eq!(&actual, b"new-model-connection");
    root.close().await?;
    drop(UdpSocket::bind(root_address).context("root UDP port retained after close")?);
    ended(&mut client).await?;
    ended(&mut worker).await?;
    stage.close().await?;
    drop(UdpSocket::bind(stage_address).context("restarted stage UDP port retained after close")?);
    Ok(())
}

#[tokio::test]
async fn close_reports_an_externally_retained_endpoint() -> Result<()> {
    let (_, s) = configs(12345);
    let address = s.bind_addr;
    let stage = RpcLink::start(s).await?;
    let retained = stage.endpoint.clone();
    let error = stage.close().await.unwrap_err();
    assert!(error.to_string().contains("UDP address remains occupied"));
    assert!(UdpSocket::bind(address).is_err());
    drop(retained);
    timeout(Duration::from_secs(3), async {
        loop {
            if UdpSocket::bind(address).is_ok() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await?;
    Ok(())
}

#[test]
fn strict_config_rejects_unknown_fields_wildcard_peers_and_invalid_bindings() {
    let (config, _) = configs(12345);
    assert!(config.validate().is_ok());
    let mut bad = config.clone();
    bad.peer_addresses[0] = "0.0.0.0:12345".parse().unwrap();
    assert!(bad.validate().is_err());
    let mut bad = config.clone();
    bad.binding.manifest_sha256 = "X".repeat(64);
    assert!(bad.validate().is_err());
    let mut bad = config.clone();
    bad.peer_id = bad
        .secret_key
        .parse::<SecretKey>()
        .unwrap()
        .public()
        .to_string();
    assert!(bad.validate().is_err());
    let mut bad = config;
    bad.local_port = 80;
    assert!(bad.validate().is_err());
    assert!(
        serde_json::from_str::<Config>(
            "{\"schema_version\":1,\"target_url\":\"https://example.com\"}"
        )
        .is_err()
    );
}
