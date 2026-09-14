# Historical public evidence and derived calculations

Collected September 13, 2026. This directory contains model metadata, configurations, indexes, research checks and fictional-policy calculations. It does not contain complete model weights, private credentials, or proof that every cataloged model executed.

The machine-readable files and hash-bound scripts remain in their original form. Some labels are Portuguese. The English chapters explain them; changing the data to translate labels would change historical evidence. Original Markdown and the complete original source register remain in the [source archive](../../publication/README.md).

## Inventory

| File or family | Meaning |
|---|---|
| `{namespace}--{model}.json` | Selected public Hugging Face API snapshot: source, collection time, revision, license, gating, file sizes and publisher hashes |
| `*.config.json` | Upstream configuration at the recorded revision |
| `*.index.json.gz` | Losslessly compressed weight index; contains tensor mapping, not weights |
| `*.summary.json` | Derived architecture, layer and file-layout analysis |
| [repository-status.json](repository-status.json) | Historical repository API observations, including failed lookups |
| [engine-commits.jsonl](engine-commits.jsonl) | Research pins for engines; not approved runtime builds |
| [compression-index.json](compression-index.json) | Sizes and hashes connecting original JSON indexes to their gzip forms |
| [calculated-projections.json](calculated-projections.json) | Arithmetic for bytes/GiB, capacity, availability and fictional costs |
| [validation-report.json](validation-report.json) | Historical document checks, not product tests |
| [verify_planning.py](verify_planning.py) | Verifier for the original archived planning tree |
| [token-economy-policy.json](token-economy-policy.json), [token-economy-simulations.json](token-economy-simulations.json) | First candidate policy and 18 deterministic examples |
| [simulate_token_economy.py](simulate_token_economy.py) | Calculator behind those early examples |
| [open-market-policy.json](open-market-policy.json), [open-market-simulations.json](open-market-simulations.json) | Fictional commercial policy and eight calculations |
| [simulate_open_market.py](simulate_open_market.py) | Reference market calculator; no financial execution |
| [cooperative-elastic-policy.json](cooperative-elastic-policy.json), [cooperative-elastic-simulations.json](cooperative-elastic-simulations.json) | Earlier partial cooperative policy and 20 examples |
| [simulate_cooperative_elastic.py](simulate_cooperative_elastic.py) | Cooperative arithmetic/controller reference |
| [integrated-economy-policy.json](integrated-economy-policy.json), [integrated-economy-simulations.json](integrated-economy-simulations.json) | Historical v4 study, with 54 simulated 90-day runs and seven boundary references |
| [simulate_integrated_economy.py](simulate_integrated_economy.py) | Earlier integrated economic simulator |
| [closure-register.json](closure-register.json) | Historical v6 decisions, dependencies and unapproved gates |
| [operating-policy-v6.json](operating-policy-v6.json) | Structured candidate specification; not a runtime configuration |
| [verify_v6_policy_reference.py](verify_v6_policy_reference.py), [v6-policy-reference-checks.json](v6-policy-reference-checks.json) | Nineteen narrow v6 reference checks and explicit limitations |
| [rejected-draft/integrated-economy-simulations.json](rejected-draft/integrated-economy-simulations.json) | Earlier rejected draft, preserved with its source inputs |
| [mermaid-validation.json](mermaid-validation.json) | Syntax check for the original archived diagrams |
| [SHA256SUMS.txt](SHA256SUMS.txt) | Original snapshot integrity list; current English prose has different bytes |

## Interpret provenance correctly

Model API snapshots record a publisher's revision and claims. A weight index describes tensor names and file mapping, not verified model execution. Upstream sizes and LFS hashes remain publisher claims until downloaded through authorized access and checked.

Some gated model artifacts were unavailable; the record does not bypass access requirements. A GitHub license detector returning null or NOASSERTION does not establish that no license exists.

The seven original indexes occupied roughly 134 MB in decimal units. Gzip preserves their decompressed bytes and reduces repository size. This is metadata compression, not model quantization.

To inspect layout, read the pinned config, decompress the index, map tensor names to layers, and compare referenced file sizes. File sizes include headers, whereas index tensor totals describe their payload convention. Preserve units and source revisions.

## Reproduce the right version

Legacy planning scripts and SHA256SUMS target the archived planning tree and can expect the original prose or an implementation-free layout. Use an isolated copy of the original archive for exact historical checks. They are not current-product validators.

For the maintained checkout use [repository and F0 reproduction instructions](../../execution/REPRODUCE.md). The current execution verifier validates original Markdown against its [source manifest](../../publication/planning-source-manifest.json) inside the immutable archive and verifies non-Markdown planning evidence unchanged. A local hash is not an independent signature or a trusted timestamp.
