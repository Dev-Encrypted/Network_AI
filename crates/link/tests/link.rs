// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
use anyhow::Result;
use axum::{
    Router,
    body::Bytes,
    http::HeaderMap,
    routing::{get, post},
};
use iroh::{Endpoint, EndpointAddr, RelayMode, SecretKey, endpoint::presets};
use network_ai_link::{ALPN, Config, Link, Role};
use network_ai_runtime::reqwest;
use std::{
    net::{Ipv4Addr, TcpListener, UdpSocket},
    time::Duration,
};

fn tcp() -> u16 {
    TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}
fn udp() -> u16 {
    UdpSocket::bind((Ipv4Addr::LOCALHOST, 0))
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}

#[tokio::test]
async fn authenticated_bidirectional_transport_and_failure_boundaries() -> Result<()> {
    let control_target = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
    let node_target = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
    let c_port = control_target.local_addr()?.port();
    let n_port = node_target.local_addr()?.port();
    let c_task = tokio::spawn(async {
        axum::serve(
            control_target,
            Router::new().route(
                "/api/v1/nodes/register",
                post(|headers: HeaderMap, bytes: Bytes| async move {
                    assert!(headers.get("cookie").is_none());
                    assert!(headers.get("x-gateway-secret").is_none());
                    assert_eq!(headers.get("x-node-nonce").unwrap(), "signed-nonce");
                    bytes
                }),
            ),
        )
        .await
        .unwrap()
    });
    let n_task = tokio::spawn(async {
        axum::serve(
            node_target,
            Router::new()
                .route("/health", get(|| async { "{\"ready\":true}" }))
                .route("/execute", post(|bytes: Bytes| async move { bytes })),
        )
        .await
        .unwrap()
    });
    let c_key = SecretKey::from_bytes(&[13; 32]);
    let n_key = SecretKey::from_bytes(&[14; 32]);
    let c_udp = udp();
    let n_udp = udp();
    let node_id = uuid::Uuid::new_v4().to_string();
    let control = Link::start(Config {
        schema_version: 1,
        role: Role::Control,
        node_id: node_id.clone(),
        secret_key: "0d".repeat(32),
        peer_id: n_key.public().to_string(),
        peer_addresses: vec![format!("127.0.0.1:{n_udp}").parse()?],
        bind_addr: format!("127.0.0.1:{c_udp}").parse()?,
        forward_port: tcp(),
        target_port: c_port,
    })
    .await?;
    let node = Link::start(Config {
        schema_version: 1,
        role: Role::Node,
        node_id,
        secret_key: "0e".repeat(32),
        peer_id: c_key.public().to_string(),
        peer_addresses: vec![format!("127.0.0.1:{c_udp}").parse()?],
        bind_addr: format!("127.0.0.1:{n_udp}").parse()?,
        forward_port: tcp(),
        target_port: n_port,
    })
    .await?;
    let http = network_ai_runtime::client();
    let c_url = format!("http://{}", control.local_addr);
    let n_url = format!("http://{}", node.local_addr);
    // More requests than the connection limit proves completed requests release permits.
    for _ in 0..20 {
        assert_eq!(
            http.get(format!("{c_url}/health"))
                .send()
                .await?
                .text()
                .await?,
            "{\"ready\":true}"
        );
    }
    let data = "á🚀".repeat(16384);
    assert_eq!(
        http.post(format!("{c_url}/execute"))
            .body(data.clone())
            .send()
            .await?
            .text()
            .await?,
        data
    );
    assert_eq!(
        http.post(format!("{n_url}/api/v1/nodes/register"))
            .header("x-node-nonce", "signed-nonce")
            .header("cookie", "must-not-forward")
            .header("x-gateway-secret", "must-not-forward")
            .body("{\"protocol\":true}")
            .send()
            .await?
            .text()
            .await?,
        "{\"protocol\":true}"
    );
    for path in [
        "/api/v1/admin/users",
        "/api/v1/nodes/other/heartbeat",
        "/api/v1/nodes/register?x=1",
    ] {
        assert_eq!(
            http.post(format!("{n_url}{path}")).send().await?.status(),
            reqwest::StatusCode::FORBIDDEN
        );
    }
    assert_eq!(
        http.post(format!("{c_url}/execute"))
            .body(vec![0; 131073])
            .send()
            .await?
            .status(),
        reqwest::StatusCode::PAYLOAD_TOO_LARGE
    );
    // A valid QUIC identity that is not the pinned peer cannot access any application path.
    let intruder = Endpoint::builder(presets::Minimal)
        .clear_ip_transports()
        .bind_addr("127.0.0.1:0")?
        .relay_mode(RelayMode::Disabled)
        .bind()
        .await?;
    let unauthorized = intruder
        .connect(
            EndpointAddr::new(c_key.public()).with_ip_addr(format!("127.0.0.1:{c_udp}").parse()?),
            ALPN,
        )
        .await;
    if let Ok(conn) = unauthorized {
        tokio::time::timeout(Duration::from_secs(3), conn.closed()).await?;
    }
    intruder.close().await;
    node.close().await;
    let failed = http
        .get(format!("{c_url}/health"))
        .timeout(Duration::from_secs(15))
        .send()
        .await?;
    assert_eq!(failed.status(), reqwest::StatusCode::BAD_GATEWAY);
    control.close().await;
    c_task.abort();
    n_task.abort();
    Ok(())
}
