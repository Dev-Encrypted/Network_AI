# 05. Model qualification, memory, and artifact distribution

## An exact configuration is the unit of support

The network's recommended focus is models above 27B parameters. Support belongs to an exact model configuration, not to a family name or parameter count. A profile combines pinned revision, artifact hashes, architecture, quantization, tokenizer/template, engine, devices, context, concurrency, and trust policy.

A larger model generally requires more weight memory at a fixed precision and may need more contributing devices or participants. Quantization, session state, and topology change the count. Use [the sizing guide](../MODEL_SCALING.md) before making a capacity claim.

## Manifest responsibilities

The target artifact manifest should identify the publisher, original source and license, files and byte sizes, content hashes, executable components and dependencies, required precision/kernels, and supported runtime versions. A signature authenticates the publisher; hashes only establish integrity relative to the manifest.

The current private text manifest is smaller and executable through [shared schemas](../../packages/contracts/src/index.ts). It fixes the model ID, backend ID, revision, one artifact fingerprint, source URL, license, context/output/input-byte limits, rates, and `private_lab` trust policy. It does not download weights or prove that the configured backend holds those exact bytes.

## Qualification stages

| Stage | Required evidence | What it permits |
|---|---|---|
| Proposed | Source, license and declared configuration | Review and discussion |
| Artifact checked | Authorized access and verified content identity | Preparing a runtime |
| Engine compatible | Supported architecture, format and kernels | Bounded experimental execution |
| Profile measured | Memory, quality, performance and failure results | A defined service envelope |
| Route available | Every required component ready within that envelope | Admission of matching requests |

The private implementation uses `CANDIDATE` and administrator-qualified `LOCAL_PREVIEW`, with ready-node eligibility. These states do not imply full public qualification.

## Files versus executable parts

A weight-file shard may contain tensors from several layers. A layer may span several files. The smallest downloadable range and the smallest executable unit are therefore different concepts. Determine the mapping from a pinned index and engine requirements before promising that each contributor downloads only its assigned block.

Future component packages should be content-addressed, resumable, bounded by disk and network budgets, and verified before activation. Cache eviction must preserve files in use. Repackaging needs an allowed license and a derivation record connecting the new package to its source. Gzip compression of a JSON index does not quantize weights.

## Dense, MoE, and mixed devices

For dense models, placement may use supported layer or tensor partitions. For MoE, total stored parameters and active per-token parameters must be recorded separately. Expert routing is not ordinary API routing. Partial expert loading alone does not establish valid arithmetic or full-model inference.

A device must support the assigned kernels and fit weights plus peak execution state. CPU RAM, GPU VRAM, and SSD capacity are separate budgets. Offloading can change the execution profile and latency; it is not free additional VRAM.

## Recorded candidates and results

The community `Qwen3.8-27B / Q4` profile executed locally. Official Qwen3-8B artifacts and token fixtures were prepared, but the recorded BF16 campaign did not run. BLOOM-560m supplied a small CPU parity reference. Kimi K3 evidence covers partial headers and tensors, without expert forward or complete inference.

These observations are [F0 results](../execution/README.md), not a catalog promise. A next profile above 27B must publish its exact artifacts, route, measured service envelope, and real host count before it is offered as supported distributed inference.
