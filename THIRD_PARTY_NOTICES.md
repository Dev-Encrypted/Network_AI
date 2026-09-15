# Third-party components and evidence

NETWORK AI does not claim authorship of the engines, libraries or models below. Its original-code license does not replace their terms. Model weights and installed engine environments are not distributed in this repository or the F0 packages.

| Reference | Use | Provenance |
|---|---|---|
| libp2p | F0 QUIC transport | [rust-libp2p](https://github.com/libp2p/rust-libp2p); versions in Cargo.lock |
| Iroh | F0 QUIC transport | [Iroh](https://github.com/n0-computer/iroh); versions in Cargo.lock |
| Petals and Hivemind | Private CPU block reference | [Petals](https://github.com/bigscience-workshop/petals), [Hivemind](https://github.com/learning-at-home/hivemind); pinned reference environment |
| vLLM, PyTorch, Transformers | Serving preparation, numerical operations and tokenization | [vLLM](https://github.com/vllm-project/vllm), [PyTorch](https://github.com/pytorch/pytorch), [Transformers](https://github.com/huggingface/transformers) |
| Qwen3-8B | Official artifact and workload preparation | [Qwen model](https://huggingface.co/Qwen/Qwen3-8B); revision in reports |
| BLOOM-560m | Executed Petals reference | [BigScience model](https://huggingface.co/bigscience/bloom-560m); upstream BLOOM RAIL 1.0 |
| Kimi K3 and other researched models | Configurations, indexes and partial inspection | Upstream origins and pinned revisions in the historical evidence |
| LM Studio and existing community model | First local inference endpoint | Identifiers/fingerprints in reports; not distributed |
| NestJS, Fastify, Next.js and React | Private control service and interface | Package versions and terms in pnpm-lock.yaml and installed packages |
| PostgreSQL | Persistence and journal | Official image pinned by digest in Compose; PostgreSQL license |
| Axum, Tokio, Reqwest and ed25519-dalek | Gateway, node and signatures | Cargo.lock and the respective crate licenses |
| IBM Plex Sans / Mono | Locally served interface fonts | IBM; SIL Open Font License; Fontsource packages in pnpm-lock.yaml |
| Lucide | Interface icons | ISC license; pinned package |
| Playwright and axe-core | Browser and accessibility verification | Development tools with their own licenses and notices |
| Zod 4.6.5 | Contributor profile and protocol validation; bundled in the standalone source archive | MIT license retained in the bundled package's LICENSE; exact version in pnpm-lock.yaml |
| llama.cpp b10964 | Pinned CPU RPC worker; source package distributes only file hashes | Upstream engine and model remain separate prerequisites with their original terms |

[Historical planning evidence](docs/planning/evidence/README.md) includes metadata, indexes and configurations from public upstream APIs. Safetensors headers under `docs/execution/evidence/kimi-k3/` are upstream reference material. These are not presented as original Dev-Encrypted works or assigned replacement licenses.

Lockfiles identify versions; they are not a complete redistribution-rights audit. Before shipping engines, model weights or derived binaries, check the exact version's terms and required notices. An open model proposal does not override a model's access or use conditions.

See [original license scope](docs/LICENSING.md), [NOTICE](NOTICE), and [sources](docs/planning/13_REFERENCES_AND_EVIDENCE.md).
