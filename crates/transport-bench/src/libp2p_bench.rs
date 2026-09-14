use crate::{TransportReport, size_report, wire};
use anyhow::{Result, bail, ensure};
use futures::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, StreamExt};
use libp2p::{
    Multiaddr, PeerId, StreamProtocol, Swarm, SwarmBuilder, identity, request_response as rr,
    swarm::SwarmEvent,
};
use std::{
    io,
    time::{Duration, Instant},
};
#[derive(Clone, Default)]
struct BoundedCodec;
async fn read_bounded<T: AsyncRead + Unpin + Send>(
    io: &mut T,
    maximum: usize,
) -> io::Result<Vec<u8>> {
    let mut frame = Vec::new();
    io.take((maximum + 1) as u64)
        .read_to_end(&mut frame)
        .await?;
    if frame.len() > maximum {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "frame budget exceeded",
        ));
    }
    Ok(frame)
}
impl rr::Codec for BoundedCodec {
    type Protocol = StreamProtocol;
    type Request = Vec<u8>;
    type Response = Vec<u8>;
    async fn read_request<T>(&mut self, _: &Self::Protocol, io: &mut T) -> io::Result<Vec<u8>>
    where
        T: AsyncRead + Unpin + Send,
    {
        read_bounded(io, wire::MAX_FRAME).await
    }
    async fn read_response<T>(&mut self, _: &Self::Protocol, io: &mut T) -> io::Result<Vec<u8>>
    where
        T: AsyncRead + Unpin + Send,
    {
        let frame = read_bounded(io, wire::RESPONSE).await?;
        if frame.len() != wire::RESPONSE {
            return Err(io::ErrorKind::InvalidData.into());
        }
        Ok(frame)
    }
    async fn write_request<T>(
        &mut self,
        _: &Self::Protocol,
        io: &mut T,
        frame: Vec<u8>,
    ) -> io::Result<()>
    where
        T: AsyncWrite + Unpin + Send,
    {
        io.write_all(&frame).await
    }
    async fn write_response<T>(
        &mut self,
        _: &Self::Protocol,
        io: &mut T,
        frame: Vec<u8>,
    ) -> io::Result<()>
    where
        T: AsyncWrite + Unpin + Send,
    {
        io.write_all(&frame).await
    }
}
type BenchSwarm = Swarm<rr::Behaviour<BoundedCodec>>;
fn swarm() -> Result<BenchSwarm> {
    Ok(
        SwarmBuilder::with_existing_identity(identity::Keypair::generate_ed25519())
            .with_tokio()
            .with_quic()
            .with_behaviour(|_| {
                rr::Behaviour::with_codec(
                    BoundedCodec,
                    [(
                        StreamProtocol::new("/network-ai/f0/1"),
                        rr::ProtocolSupport::Full,
                    )],
                    rr::Config::default()
                        .with_request_timeout(Duration::from_secs(3))
                        .with_max_concurrent_streams(16),
                )
            })?
            .with_swarm_config(|c| c.with_idle_connection_timeout(Duration::from_secs(30)))
            .build(),
    )
}
async fn exchange(
    client: &mut BenchSwarm,
    server: &mut BenchSwarm,
    allowed: PeerId,
    target: PeerId,
    gate: &mut wire::Gate,
    request: Vec<u8>,
) -> Result<Vec<u8>> {
    let wanted = client.behaviour_mut().send_request(&target, request);
    tokio::time::timeout(Duration::from_secs(5),async {
        loop { tokio::select! {
            event=client.select_next_some()=>match event {
                SwarmEvent::Behaviour(rr::Event::Message {message:rr::Message::Response {request_id,response},..}) if request_id==wanted=>return Ok(response),
                SwarmEvent::Behaviour(rr::Event::OutboundFailure {request_id,error,..}) if request_id==wanted=>bail!("request rejected: {error}"), _=>{}
            },
            event=server.select_next_some()=> {
                if let SwarmEvent::Behaviour(rr::Event::Message {peer,message:rr::Message::Request {request,channel,..},..})=event {
                    let response=gate.respond(peer==allowed,&request); let _=server.behaviour_mut().send_response(channel,response);
                }
            }
        }}
    }).await?
}
async fn dial(
    client: &mut BenchSwarm,
    server: &mut BenchSwarm,
    addr: Multiaddr,
    expected: PeerId,
) -> Result<()> {
    client.dial(addr)?;
    tokio::time::timeout(Duration::from_secs(5),async {
        loop { tokio::select! {
            event=client.select_next_some()=>match event {
                SwarmEvent::ConnectionEstablished {peer_id,..}=>{ensure!(peer_id==expected,"wrong authenticated peer");return Ok(());},
                SwarmEvent::OutgoingConnectionError {error,..}=>bail!("dial rejected: {error}"),_=>{}
            }, _event=server.select_next_some()=>{}
        }}
    }).await?
}
pub async fn run() -> Result<TransportReport> {
    let mut server = swarm()?;
    let mut client = swarm()?;
    let allowed = *client.local_peer_id();
    let server_id = *server.local_peer_id();
    server.listen_on("/ip4/127.0.0.1/udp/0/quic-v1".parse()?)?;
    let bare = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if let SwarmEvent::NewListenAddr { address, .. } = server.select_next_some().await {
                break address;
            }
        }
    })
    .await?;
    let addr = bare
        .clone()
        .with(libp2p::multiaddr::Protocol::P2p(server_id));
    dial(&mut client, &mut server, addr.clone(), server_id).await?;
    let mut gate = wire::Gate::default();
    let mut sequence = 0;
    let mut reports = Vec::new();
    for size in [1024, 16384, 65536] {
        let mut elapsed = Vec::new();
        for sample in 0..33 {
            sequence += 1;
            let request = wire::request(sequence, size);
            let start = Instant::now();
            let response = exchange(
                &mut client,
                &mut server,
                allowed,
                server_id,
                &mut gate,
                request.clone(),
            )
            .await?;
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
    let replay = exchange(
        &mut client,
        &mut server,
        allowed,
        server_id,
        &mut gate,
        wire::request(sequence, 1024),
    )
    .await?;
    ensure!(replay[0] == wire::REPLAY, "replay accepted");
    let mut intruder = swarm()?;
    dial(&mut intruder, &mut server, addr, server_id).await?;
    let unauthorized = exchange(
        &mut intruder,
        &mut server,
        allowed,
        server_id,
        &mut gate,
        wire::request(sequence + 1, 1024),
    )
    .await?;
    ensure!(
        unauthorized[0] == wire::UNAUTHORIZED,
        "unauthorized peer accepted"
    );
    let mut wrong = swarm()?;
    let wrong_id = *intruder.local_peer_id();
    let wrong_addr = bare.with(libp2p::multiaddr::Protocol::P2p(wrong_id));
    ensure!(
        dial(&mut wrong, &mut server, wrong_addr, wrong_id)
            .await
            .is_err(),
        "wrong server identity accepted"
    );
    ensure!(
        exchange(
            &mut client,
            &mut server,
            allowed,
            server_id,
            &mut gate,
            wire::request(sequence + 1, wire::MAX_PAYLOAD + 1)
        )
        .await
        .is_err(),
        "oversized frame accepted"
    );
    sequence += 1;
    let request = wire::request(sequence, 1024);
    let response = exchange(
        &mut client,
        &mut server,
        allowed,
        server_id,
        &mut gate,
        request.clone(),
    )
    .await?;
    ensure!(wire::verified(&response, &request), "failed recovery");
    Ok(TransportReport {
        transport: "libp2p-0.57.0/QUIC",
        physical_hosts: 1,
        samples_by_size: reports,
        replay_rejected: true,
        unauthorized_peer_rejected: true,
        wrong_server_identity_rejected: true,
        oversized_request_rejected: true,
        cancellation_read_error_observed: None,
        request_after_negative_checks_passed: true,
    })
}
