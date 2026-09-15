// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
use anyhow::{Result, ensure};
use network_ai_link::rpc::{Config, RpcLink};
use std::{
    path::PathBuf,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    ensure!(
        args.len() == 2 && args[0] == "--config",
        "Use --config PRIVATE_RPC_JSON"
    );
    let path = PathBuf::from(&args[1]);
    let config: Config = serde_json::from_slice(&std::fs::read(&path)?)?;
    let status_path = path.with_file_name("rpc-status.json");
    let temporary = path.with_file_name("rpc-status.tmp");
    let role = config.role;
    let binding = config.binding.clone();
    let link = RpcLink::start(config).await?;
    let boot = uuid::Uuid::new_v4().to_string();
    let mut interval = tokio::time::interval(Duration::from_secs(1));
    println!("NETWORK AI guarded RPC link ready (pinned direct QUIC; relay disabled)");
    loop {
        tokio::select! {
            _ = tokio::signal::ctrl_c() => break,
            _ = interval.tick() => {
                let bytes = serde_json::to_vec_pretty(&serde_json::json!({
                    "schema_version": 1, "transport": "iroh-direct-quic-guarded-rpc",
                    "pid": std::process::id(), "boot_id": boot,
                    "observed_at_unix_ms": SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis(),
                    "role": role, "binding": binding, "counters": link.snapshot()
                }))?;
                tokio::fs::write(&temporary, bytes).await?;
                tokio::fs::rename(&temporary, &status_path).await?;
            }
        }
    }
    link.close().await?;
    let _ = tokio::fs::remove_file(status_path).await;
    Ok(())
}
