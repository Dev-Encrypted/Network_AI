# 13. References, dates, and evidence types

## What each source can establish

| Evidence type | Supports | Does not establish |
|---|---|---|
| Upstream documentation/model card | Publisher-described architecture, interfaces and requirements at a consulted version | NETWORK AI compatibility or achieved performance |
| Pinned metadata/config/index | Identity and declared layout of an artifact snapshot | Full weight integrity before download or successful inference |
| Arithmetic | A result implied by stated assumptions | Hardware performance, real behavior or economic sustainability |
| Simulation | Outcomes of implemented rules and fictional inputs | Human behavior, real consensus or market prices |
| Local measurement | Observed behavior in the named environment | Other GPUs, other hosts, WAN or production reliability |
| Operational pilot | Behavior over its actual scope and duration | Universal performance or future availability |

## Primary references for the English scaling explanation

The following pages were consulted for the September 14, 2026 English edition. Pin an actual release for execution rather than relying on a moving documentation URL.

| Source | Use in this edition |
|---|---|
| [vLLM parallelism and scaling](https://docs.vllm.ai/en/latest/serving/parallelism_scaling/) | Distinguishes single-device, multi-GPU and multi-host execution strategies |
| [Transformers bitsandbytes documentation](https://huggingface.co/docs/transformers/main/quantization/bitsandbytes) | Explains reduced-precision model storage and runtime-specific quantization |
| [Transformers cache strategies](https://huggingface.co/docs/transformers/main/kv_cache) | Explains additional session memory and cache tradeoffs |
| [Petals research paper](https://arxiv.org/abs/2312.08361) | Authors' research on inference with heterogeneous participants and Internet links |
| [Official Qwen3-235B-A22B-Instruct-2507 card](https://huggingface.co/Qwen/Qwen3-235B-A22B-Instruct-2507) | Concrete distinction between total and activated MoE parameters |

The model-memory table is independently calculated from parameter count and bits per parameter. The 20 GiB/device example is hypothetical. Neither uses upstream performance numbers as NETWORK AI measurements. [Full derivation](../MODEL_SCALING.md).

## Historical research record

The original September 13 research includes repository metadata, model API snapshots, configs, compressed indexes, engine revisions, comparisons, and policy examples. The [evidence index](evidence/README.md) describes those files. The original complete source register is preserved in the [historical Git commit and ZIP](../publication/README.md).

A repository timestamp is not a maintenance guarantee. A missing automated license detection result is not proof that a project has no license. Upstream-reported file hashes are publisher claims until the content has been obtained through authorized access and verified.

## Project observations

Use [F0 results](../execution/README.md) for actual model, transport and simulation evidence. Use [private validation](../implementation/STATUS.md) for the later integrated product. Source hashes bind reports to their harness versions; they do not provide independent attestation or a trusted timestamp.

The historical economic studies remain rejected where their outputs say so. A later implementation or documentation edit does not change that decision. Original raw records stay byte-for-byte preserved even when they include Portuguese fixture text or historical paths.

## Citation and attribution

Attribute the project and original article to **Dev-Encrypted**, and state the version or commit consulted. Use [CITATION.cff](../../CITATION.cff). Credit engines, libraries and models to their own authors under [third-party notices](../../THIRD_PARTY_NOTICES.md). The project's licenses do not replace upstream terms.
