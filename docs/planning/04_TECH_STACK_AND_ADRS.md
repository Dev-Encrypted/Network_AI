# 04. Technology choices and decision records

## Current implementation choices

| Decision | Reason | Limit and revisit condition |
|---|---|---|
| Rust gateway and node daemon | Typed protocol handling, process lifecycle, streaming and bounded resources | Reuse engines for numerical work; do not grow a second model framework without evidence |
| NestJS/Fastify control service | Modular identity, catalog, admission and accounting in one application | Split services only when independent scale or ownership justifies the operational cost |
| PostgreSQL | Durable transactions, constraints, account projection and migration checksums | One trusted database owner remains; this is not independent-operator consensus |
| Next.js and React interface | Integrated chat, catalog, sessions and operator administration | Current UI is PT-BR; public documentation is English |
| Shared TypeScript schemas | Explicit request, model and amount validation | Cross-language protocol behavior still needs Rust and integration tests |
| Existing inference backend | Exercise end-to-end behavior with a real model already available | Backend-reported usage and inventory require qualification under the chosen trust policy |
| Loopback private integration | Test the product's contracts on available hardware | Does not qualify Internet exposure or distributed execution |

The lockfiles and runtime configuration identify actual dependency versions. Consult [operations](../implementation/OPERATIONS.md) for the supported private setup rather than installing arbitrary latest versions.

## Target components evaluated separately

The original plan evaluates vLLM/SGLang, a format-specific llama.cpp path, and other engines for qualified models. A model above 27B needs an explicit engine, precision, device and topology combination. API compatibility does not imply support for every numerical architecture.

Protobuf/gRPC and QUIC are target protocol options. libp2p and Iroh have isolated F0 experiments; neither is an automatic solution for discovery, residential NAT, adversarial nodes, latency, or economic verification. Choose transport from measured requirements and preserve the application authorization contract.

Redis may serve disposable presence or cache data after demonstrated need. It must not become the only source of balance or accepted obligations. S3-compatible storage and content-addressed distribution are artifact-plane candidates, not integrated public services today.

A Tauri contributor application, OpenTelemetry/Prometheus/Grafana deployment, and more advanced orchestration remain future integration work. Do not describe planned tools as installed product capabilities.

## Conditions for a new decision

Each proposed change should record the problem, alternatives, selected behavior, failure boundary, evidence, migration path, and rollback. Examples include an engine that cannot expose required cancellation, a model partition too large for a supported device, or a single service whose measured load requires separation.

Do not add Kubernetes, a message broker, another database, a blockchain, or a new language simply because the network may eventually grow. The first acceptance criterion is a reproducible improvement without weakening identity, admission, accounting, or observability.

## Reproducibility and updates

Pin model revisions and engine dependencies. Qualify upgrades using the same workload and new output directories. Preserve failures and earlier hashes. A dependency update may alter tokenization, kernels, memory, throughput, or receipt semantics even if the HTTP endpoint remains unchanged.

The [contribution guide](../../CONTRIBUTING.md) gives scoped validation commands. The [private design record](../implementation/PRIVATE_PREVIEW.md) explains why the current integration is deliberately limited to the measured local profile.
