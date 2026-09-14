# 09. Data model and API boundaries

## Contract authority

The executable private contract is defined by [shared schemas](../../packages/contracts/src/index.ts), [control API](../../apps/control-api/src/controller.ts), [database migrations](../../infra/migrations/), and the [API manual](../implementation/API.md). This chapter explains the entities and target evolution. It does not declare unimplemented routes available.

## Core entities

| Entity | Purpose | Invariant |
|---|---|---|
| Account and API key | Identify and authorize a consumer or operator | Access is account-scoped; revoked keys cannot start new authenticated work |
| Model manifest | Fix artifact identity, profile and price fields | Reusing an ID cannot silently replace the model |
| Qualification | Record review and service eligibility | Approval has a scope and evidence; it is separate from current presence |
| Physical domain | Group shared capacity in the private lab | Agents sharing a resource cannot multiply its admission slots |
| Node and epoch | Bind an operator, model, endpoint and runtime generation | Old attempts cannot settle as a new generation |
| Quote | Freeze the authorized price and request envelope | Expired or mismatched quotes cannot authorize new work |
| Session and attempt | Track logical use and the authorized execution | Stable identity prevents duplicate effects |
| Hold | Reserve maximum consumer exposure | Held funds are unavailable to competing sessions |
| Receipt | Describe signed usage and execution outcome | Duplicate identical delivery is harmless; conflicting delivery is rejected |
| Journal and lines | Record balanced accounting changes | Committed application entries cannot be rewritten or extended |
| Event | Explain a state transition | Audit metadata is append-only for the runtime role |

The future cooperative system additionally needs offers, readiness leases, route components, verifier decisions, issuance commitments, reversal sources, and governance versions. The commercial path adds seller contracts and cash liabilities in a separate accounting domain.

## Separation of content and metadata

Control requests carry model identifiers, limits, digests, amounts, and state transitions. Prompt and answer traffic stays on the inference path. Model content must not be placed in a financial journal or routine diagnostic event.

Amounts use integer micro-units, transmitted as strings where JavaScript number precision would be unsafe. Tokens and byte counts are independently bounded. The exact serialization used for signatures and hashes is part of the protocol; semantically similar JSON bytes are not necessarily the same request digest.

## Public-facing private endpoints

The local control API covers authentication, models, quotes, wallet, sessions, keys, nodes, and administrator provisioning. The Rust gateway exposes a text subset of `/v1/models` and `/v1/chat/completions`. It rejects unsupported tools, images, files, extra choices, and unknown fields.

An idempotency key belongs to the account, including across its API keys. Reusing it returns HTTP 409 and the original session identity rather than executing again. Because answer bodies are not retained, this is not cached response replay.

## Distributed-route extensions

A route above 27B may need several stage assignments, each with a pinned component, resource hold, generation, and deadline. A route record must distinguish planned, partially prepared, committed, executing, draining, and terminal states. A partial set cannot authorize a complete-model availability claim.

Versioned APIs should preserve older accepted terms through completion. New protocol versions need migration, compatibility, rejection, and recovery tests. Database migrations must retain evidence and accepted obligations, not reinterpret earlier receipts with a new tariff. See [protocol](06_NODE_PROTOCOL_AND_SCHEDULER.md) and [continuity](22_POLICY_CLOSURE_AND_CONTINUITY.md).
