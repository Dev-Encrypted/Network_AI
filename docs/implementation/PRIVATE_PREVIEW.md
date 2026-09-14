# Private implementation decisions after F0

The v0.2 implementation follows the `v0.1.0-f0` research publication. Historical snapshots and rejected economic results retain their original meaning.

## Implemented boundaries

The NestJS/Fastify service and dedicated PostgreSQL own identity, model metadata, authorization, quotes, holds, sessions and journals. Rust gateway and node carry request content and streaming through the inference path. The Next.js interface provides chat, catalog, sessions, laboratory credits, API keys and administration.

The private protocol binds Ed25519 node identities, persistent nonces, node epochs, prepare/execute capabilities, a single-use claim and request digests. Several agents in the same physical domain share a transactionally enforced capacity limit; registering extra processes does not create extra slots.

`LAB_TU` belongs exclusively to this private environment. Explicit grants do not authorize public cooperative issuance. Its completed-work split and full failure refund are deliberately documented as test policies, including their abuse limitations.

## Why a local integration first

The available hardware and loaded model allowed an end-to-end implementation of identity, admission, inference, accounting and recovery. The default artifact fingerprint remains the actual observed one. It is not promoted to official Qwen3-8B BF16 qualification or a model-above-27B distributed result.

Bounded loopback HTTP connects the current components with application-level identity and capability checks. The F0 QUIC module remains an independent bench. Cross-host service needs its own transport, trust and operational qualification; changing listeners to a public address does not provide it.

## What acceptance demonstrated

The local campaign exercised real login/authorization, ready-node availability, model inference through the gateway, signed usage settlement, retries, cancellation, node restart fencing, receipt outbox recovery and database restoration. Two real agents sharing one domain served concurrent requests without exceeding the single slot.

All these results occurred on one physical host. They do not prove WAN performance, independent operators, cooperative sustainability or public fraud resistance. The [status matrix](STATUS.md) and [public report](validation.json) retain that scope.

## How this supports the larger objective

Models above 27B remain a primary goal. The current contracts provide a starting point for qualified engine adapters and complete-route admission, but the model partition, per-stage state, multi-host transport and recovery mechanism still need implementation and tests.

The private software is usable for development while those experiments proceed. Its existence does not convert an untested design assumption into a released public capability.
