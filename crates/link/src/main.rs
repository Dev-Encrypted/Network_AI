// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
use anyhow::Result;
use network_ai_link::{Config, Link};

#[tokio::main]
async fn main() -> Result<()> {
    let path = std::env::var("NETWORK_AI_LINK_CONFIG")?;
    let config: Config = serde_json::from_slice(&std::fs::read(path)?)?;
    let link = Link::start(config).await?;
    println!(
        "NETWORK AI private link ready on {} (direct QUIC; relay disabled)",
        link.local_addr
    );
    tokio::signal::ctrl_c().await?;
    link.close().await;
    Ok(())
}
