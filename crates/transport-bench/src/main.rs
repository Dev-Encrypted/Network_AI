//! Private loopback comparison. No discovery, public relay or inference runtime.
mod iroh_bench;
mod libp2p_bench;
mod wire;
use anyhow::{Context, Result, ensure};
use serde::Serialize;
use std::{fs::OpenOptions, io::Write, path::PathBuf};

#[derive(Debug, Serialize)]
pub struct SizeReport {
    payload_bytes: usize,
    samples: usize,
    round_trip_p50_ms: f64,
    round_trip_p95_ms: f64,
    application_request_bytes: usize,
    application_response_bytes: usize,
}
pub fn size_report(size: usize, mut elapsed: Vec<f64>) -> SizeReport {
    elapsed.sort_by(f64::total_cmp);
    let n = elapsed.len();
    SizeReport {
        payload_bytes: size,
        samples: n,
        round_trip_p50_ms: elapsed[(n as f64 * 0.5).ceil() as usize - 1],
        round_trip_p95_ms: elapsed[(n as f64 * 0.95).ceil() as usize - 1],
        application_request_bytes: size + wire::HEADER,
        application_response_bytes: wire::RESPONSE,
    }
}
#[derive(Debug, Serialize)]
pub struct TransportReport {
    transport: &'static str,
    physical_hosts: u32,
    samples_by_size: Vec<SizeReport>,
    replay_rejected: bool,
    unauthorized_peer_rejected: bool,
    wrong_server_identity_rejected: bool,
    oversized_request_rejected: bool,
    cancellation_read_error_observed: Option<bool>,
    request_after_negative_checks_passed: bool,
}
#[tokio::main(flavor = "multi_thread", worker_threads = 4)]
async fn main() -> Result<()> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    ensure!(
        args.len() == 2 && args[0] == "--output",
        "usage: network-ai-transport-bench --output PATH.json"
    );
    let output = PathBuf::from(&args[1]);
    ensure!(!output.exists(), "refusing to overwrite evidence");
    eprintln!("Measuring libp2p QUIC on loopback...");
    let libp2p = libp2p_bench::run().await.context("libp2p bench")?;
    eprintln!("Measuring Iroh QUIC with discovery and relays disabled...");
    let iroh = iroh_bench::run().await.context("Iroh bench")?;
    let report = serde_json::json!({
        "evidence_type":"MEASURED_LOCAL_LOOPBACK", "transports":[libp2p,iroh],
        "wire_protocol":"network-ai/f0/1", "payload_digest":"sha256",
        "build_debug_assertions":cfg!(debug_assertions), "public_launch_approved":false,
        "limitations":[
            "One computer; does not qualify two physical hosts, WAN, NAT or relays",
            "Transport identities do not prove unique people, GPUs or correct inference",
            "Latency includes application SHA-256, serialization and local scheduling",
            "Application byte counts exclude QUIC, UDP, IP, TLS and retransmission overhead",
            "Replay protection is in-memory and scoped to ephemeral bench identities; durable restart protection remains required",
            "Iroh cancellation is a stream-read error; no GPU cancellation or ledger effect is exercised",
            "libp2p application cancellation is not implemented in this bench"
        ]
    });
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&output)?;
    file.write_all(serde_json::to_string_pretty(&report)?.as_bytes())?;
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}
