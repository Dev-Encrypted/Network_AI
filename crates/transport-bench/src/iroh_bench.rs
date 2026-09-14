use crate::{TransportReport, size_report, wire};
use anyhow::{Context, Result, ensure};
use iroh::{
    Endpoint, EndpointAddr, RelayMode,
    endpoint::{Connection, presets},
};
use std::{
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::{Duration, Instant},
};
const ALPN: &[u8] = b"network-ai/f0/1";
async fn endpoint() -> Result<Endpoint> {
    Ok(Endpoint::builder(presets::Minimal)
        .clear_ip_transports()
        .bind_addr("127.0.0.1:0")?
        .relay_mode(RelayMode::Disabled)
        .alpns(vec![ALPN.to_vec()])
        .bind()
        .await?)
}
async fn exchange(conn: &Connection, frame: &[u8]) -> Result<Vec<u8>> {
    tokio::time::timeout(Duration::from_secs(5), async {
        let (mut send, mut recv) = conn.open_bi().await?;
        send.write_all(frame).await?;
        send.finish()?;
        let response = recv.read_to_end(wire::RESPONSE).await?;
        ensure!(response.len() == wire::RESPONSE, "invalid response size");
        Ok::<_, anyhow::Error>(response)
    })
    .await?
}
pub async fn run() -> Result<TransportReport> {
    let client = endpoint().await?;
    let server = endpoint().await?;
    let intruder = endpoint().await?;
    let allowed = client.id();
    let server_id = server.id();
    let ip = *server
        .bound_sockets()
        .first()
        .context("no loopback socket")?;
    ensure!(ip.ip().is_loopback(), "non-loopback bind");
    let addr = EndpointAddr::new(server_id).with_ip_addr(ip);
    let acceptor = server.clone();
    let gate = Arc::new(Mutex::new(wire::Gate::default()));
    let read_errors = Arc::new(AtomicU64::new(0));
    let server_errors = read_errors.clone();
    let accept_task = tokio::spawn(async move {
        while let Some(incoming) = acceptor.accept().await {
            let gate = gate.clone();
            let errors = server_errors.clone();
            tokio::spawn(async move {
                let Ok(Ok(conn)) = tokio::time::timeout(Duration::from_secs(3), incoming).await
                else {
                    return;
                };
                let authorized = conn.remote_id() == allowed;
                while let Ok((mut send, mut recv)) = conn.accept_bi().await {
                    match tokio::time::timeout(
                        Duration::from_secs(3),
                        recv.read_to_end(wire::MAX_FRAME),
                    )
                    .await
                    {
                        Ok(Ok(frame)) => {
                            let response = match gate.lock() {
                                Ok(mut guard) => guard.respond(authorized, &frame),
                                Err(_) => {
                                    conn.close(1u32.into(), b"state unavailable");
                                    return;
                                }
                            };
                            if send.write_all(&response).await.is_ok() {
                                let _ = send.finish();
                            }
                        }
                        _ => {
                            errors.fetch_add(1, Ordering::SeqCst);
                            let _ = recv.stop(1u32.into());
                            let _ = send.reset(1u32.into());
                        }
                    }
                }
            });
        }
    });
    let conn =
        tokio::time::timeout(Duration::from_secs(5), client.connect(addr.clone(), ALPN)).await??;
    ensure!(conn.remote_id() == server_id, "wrong authenticated server");
    let mut sequence = 0;
    let mut reports = Vec::new();
    for size in [1024, 16384, 65536] {
        let mut elapsed = Vec::new();
        for sample in 0..33 {
            sequence += 1;
            let request = wire::request(sequence, size);
            let start = Instant::now();
            let response = exchange(&conn, &request).await?;
            ensure!(
                wire::verified(&response, &request),
                "digest or sequence mismatch"
            );
            if sample >= 3 {
                elapsed.push(start.elapsed().as_secs_f64() * 1000.0);
            }
        }
        reports.push(size_report(size, elapsed));
    }
    let replay = exchange(&conn, &wire::request(sequence, 1024)).await?;
    ensure!(replay[0] == wire::REPLAY, "replay accepted");
    let unauthorized_conn =
        tokio::time::timeout(Duration::from_secs(5), intruder.connect(addr, ALPN)).await??;
    let unauthorized = exchange(&unauthorized_conn, &wire::request(sequence + 1, 1024)).await?;
    ensure!(
        unauthorized[0] == wire::UNAUTHORIZED,
        "unauthorized peer accepted"
    );
    let wrong_addr = EndpointAddr::new(intruder.id()).with_ip_addr(ip);
    let wrong =
        tokio::time::timeout(Duration::from_secs(3), client.connect(wrong_addr, ALPN)).await;
    ensure!(
        !matches!(wrong, Ok(Ok(_))),
        "wrong server identity accepted"
    );
    let before = read_errors.load(Ordering::SeqCst);
    let (mut send, mut recv) = conn.open_bi().await?;
    let partial = wire::request(sequence + 1, 1024);
    send.write_all(&partial[..16]).await?;
    tokio::time::sleep(Duration::from_millis(50)).await;
    send.reset(7u32.into())?;
    recv.stop(7u32.into())?;
    tokio::time::timeout(Duration::from_secs(2), async {
        while read_errors.load(Ordering::SeqCst) == before {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .context("cancellation not observed by server")?;
    ensure!(
        exchange(&conn, &wire::request(sequence + 1, wire::MAX_PAYLOAD + 1))
            .await
            .is_err(),
        "oversized frame accepted"
    );
    sequence += 1;
    let request = wire::request(sequence, 1024);
    let response = exchange(&conn, &request).await?;
    ensure!(wire::verified(&response, &request), "failed recovery");
    conn.close(0u32.into(), b"bench complete");
    unauthorized_conn.close(0u32.into(), b"bench complete");
    client.close().await;
    intruder.close().await;
    server.close().await;
    accept_task.abort();
    Ok(TransportReport {
        transport: "iroh-1.2.0/QUIC",
        physical_hosts: 1,
        samples_by_size: reports,
        replay_rejected: true,
        unauthorized_peer_rejected: true,
        wrong_server_identity_rejected: true,
        oversized_request_rejected: true,
        cancellation_read_error_observed: Some(true),
        request_after_negative_checks_passed: true,
    })
}
