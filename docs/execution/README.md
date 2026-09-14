# F0 research execution and observed results

The F0 campaign began on September 14, 2026. It covers artifact preparation, local inference, economic simulation and authenticated transport experiments. The later [private v0.2 application](../implementation/README.md) is a separate implementation increment.

The observed host had an RTX 4090 with about 24 GiB of VRAM, an Intel i9-14900K, roughly 128 GiB of RAM, Windows and Ubuntu/WSL2. The GPU was shared with an existing LM Studio model. Two local processes or WSL environments do not constitute two physical hosts.

## Results and limits

| Workstream | Observed result | Boundary |
|---|---|---|
| Existing local inference | 30/30 expected visible answers; visible TTFT p50 1.09 s, p95 1.87 s | Community `Qwen3.8-27B / Q4` in LM Studio; shared GPU; not official Qwen3-8B BF16 |
| Official Qwen3-8B | Fourteen files verified; 16.38 GB of weights; vLLM 0.29.0 prepared with CUDA/BF16 recognized | GPU launch not executed in the recorded campaign |
| E01 workloads | Sixty-six exact-token fixtures, including warmups, at 2,048 and 7,168 input tokens | Prepared workloads, not completed BF16 inference |
| Transport | libp2p 0.57.0 and Iroh 1.2.0 exercised in release builds | Loopback; physical-host, NAT and relay matrix remains pending |
| Petals blocks | BLOOM-560m on two CPU servers, matching logits/generation, failure and restart exercised | Two processes on one host; no Kimi or WAN qualification |
| Kimi K3 inspection | Six shard headers and six expert tensors loaded into CPU memory, 17,547,264 payload bytes | No dequantization, expert forward, GPU kernel or full inference |
| Economy | 5,600 simulated 90-day cases, with 20 calibration and 50 holdout seeds | Fictional settings rejected; no real credit or payment issued |

The project's recommended focus is **models above 27B**. These experiments are development references and partial evidence toward that goal, not a completed distributed larger-model service.

## Economic outcome

Accounting consistency did not sustain the tested service. In the baseline, candidate v6 completed 15.75% of compatible funded demand during maturity, below the 95% target. Contracted coverage and cohort consumption did not keep enough TU circulating. No run passed every implemented economic gate. [Results and causes](ECONOMY_V1_RESULTS.md).

The F0 automated bench includes 21 Python tests and two Rust tests. Some checks cover inconsistent HTTP usage, incomplete streams and unavailable fixture models. Their passing scope is code behavior and stated invariants, not public fraud, privacy or operational qualification.

## Evidence links

- [Corrected LM Studio run](../../benchmarks/runs/2026-09-14-lmstudio-visible-256/report.json) and [artifact/backend fingerprints](evidence/lmstudio-fingerprints.json).
- [Official Qwen artifacts](evidence/qwen3-8b-artifacts.json), [E01 fixture manifest](evidence/e01-fixtures.json), [physical inventory](evidence/hardware-inventory.json).
- [Release transport report](../../benchmarks/runs/2026-09-14-transport-loopback-release/report.json).
- [Petals failure and recovery](../../benchmarks/runs/2026-09-14-petals-private-cpu-v5-recovery/report.json).
- [Kimi inspection](evidence/kimi-k3/inspection.json) and [partial CPU load](evidence/kimi-k3/cpu-unit-load.json).
- [Economic summary and 5,600-run verification](evidence/economy-v1-summary.json).
- [Historical consistency report](evidence/execution-validation.json) and [GPU preflight](evidence/vllm-preflight.json).
- [Reproduction](REPRODUCE.md), [open gates](GATES.md), and [release artifacts](../publication/README.md).

## Failed attempts remain visible

The first LM Studio smoke used a 64-token output limit and truncated ten answers during reasoning. Its timing also mixed reasoning with visible content. Do not present that run's timing as visible-answer TTFT. The corrected 256-token run separates these fields.

Initial Petals integration attempts and their API errors remain preserved. Later v4/v5 runs demonstrate the corrected result. The reference environment also exposed an always-true recovery assertion in upstream code and an absent optimizer symbol in the CPU bitsandbytes library. The experiment did not use training/quantization or qualify arbitrary recovery metadata.

## Reproducibility boundary

The immutable F0 ZIP includes sources, fixtures, tests, reports, raw economic results and six planning archives. It excludes weights, installed environments and build caches. The old aggregate runtime installer was not fully exercised on a clean machine in the original campaign.

Public GitHub publication does not open the inference network. Historical records keep their original bytes and language; maintained English explanations identify what they support. [Publication and provenance](../publication/README.md).
