# Contributing to NETWORK AI

NETWORK AI includes F0 research and an executable private inference application. The recommended focus is models above 27B parameters, with qualified smaller profiles supporting participation and controlled experiments. Start with [implementation status](docs/implementation/STATUS.md), [research results](docs/execution/README.md), and [open gates](docs/execution/GATES.md).

## Contribution workflow

1. Describe the problem, hypothesis, affected contract and measurable acceptance criterion in an issue or pull request.
2. Keep the change scoped. Use a new directory and version for a new experiment.
3. Run checks appropriate to the change and record environment, commands, outcomes and limitations.
4. Explain effects on compatibility, resource usage, accounting, failure handling and user behavior.

Use English for maintained documentation, public contribution descriptions and release notes. Define technical terms for new readers. Preserve exact protocol identifiers and historical evidence rather than translating hash-bound fixtures. [Language policy](docs/LANGUAGE.md).

## Validation by change type

| Change | Relevant checks |
|---|---|
| Documentation | `python benchmarks/scripts/verify_repository.py`; inspect links, formulas, code fences and evidence scope |
| Python bench | `python -m unittest discover -s benchmarks/tests -v` |
| Rust | `cargo fmt --all -- --check`, `cargo test --locked`, `cargo clippy --locked --all-targets -- -D warnings` |
| Private application | `pnpm typecheck`, build with managed services stopped, PostgreSQL integration and affected browser journeys |
| Real inference or recovery | The relevant live acceptance script on a qualified backend, with no unrelated active sessions |
| Historical consistency | Restore assets, then `python benchmarks/scripts/verify_execution.py --check` |

A GPU-free CI run does not qualify GPUs, WAN, malicious operators or the economics. The [operator guide](docs/implementation/OPERATIONS.md) explains which tests restart services and which require the actual model.

## Evidence standards

Separate measurement, arithmetic, simulation and projection. Record model revision, engine, driver, precision, context, concurrency, topology and physical host count. A corrected error needs a new run; do not overwrite an earlier failure to make it appear successful.

A larger model or additional contributors require measured complete-route capacity. Do not use an idealized memory lower bound as proof that an engine supports a partition or that residential links meet the intended latency.

Preserve the rejected F0 economic outcome. Policies adjusted after observing holdout results need new validation seeds. Keep compatible capacity refusals in the service denominator and expose cohort liquidity, held balances, future commitments and recurring funding sources.

Do not commit credentials, third-party private prompts, personal data, model weights or installed runtime environments. Large research artifacts belong in versioned releases with hashes.

## Contribution rights

Submit only material you have the right to license. Original code uses Apache 2.0; original prose uses CC BY 4.0. Preserve third-party notices and describe provenance. A contribution offered for inclusion is provided under the applicable project license without automatically assigning ownership to the maintainer.

Project direction and attribution remain with [Dev-Encrypted](AUTHORS.md). Security reports follow [SECURITY.md](SECURITY.md).
