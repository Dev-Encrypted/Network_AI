# Models above 27B: memory, participants, and usable capacity

NETWORK AI recommends models **above 27 billion total parameters** as its principal area of focus. The purpose is to make demanding inference profiles accessible through contributed resources. This is a product direction, not a universal technical cutoff. Smaller models remain useful wherever a compatible profile is qualified.

This guide explains how to estimate the contribution needed for a model. Its numerical examples are arithmetic with explicit assumptions, not measurements of NETWORK AI's distributed runtime. That runtime is not yet integrated into the private product.

## 1. Count resources before counting people

A **participant** is a person or organization offering resources. A **node** is an agent process operated by that participant. A **device** is physical hardware such as a GPU. A participant can own several devices and run several nodes. Conversely, several node processes can share one device.

The scheduler must avoid counting physical capacity twice. In the private preview, administrators assign shared physical domains, and PostgreSQL limits admissions across agents in the same domain. This works within the trusted lab; it does not prove device uniqueness against an unknown operator.

More parameters at the same precision generally require more weight memory. If each participant contributes a similar amount of usable memory, the number of contributing participants tends to increase. A large-memory device, different quantization, or different execution strategy changes that relationship.

Use this order:

1. Identify the exact model artifact and execution profile.
2. Measure the memory and compute required by every executable part.
3. Identify compatible devices and their available budgets.
4. Find a complete route that meets communication and reliability requirements.
5. Count the participants needed to provide that route, its service capacity, and its redundancy.

## 2. Estimate weight memory

For a simplified model in which every parameter uses the same storage precision:

```text
weight_bytes = total_parameters × bits_per_parameter / 8
weight_GiB = weight_bytes / 1,073,741,824
```

`27B` means 27,000,000,000 parameters. `GB` is decimal; `GiB` is binary. The table uses GiB consistently.

| Parameters | 16-bit weights | 8-bit weights | 4-bit weights |
|---|---:|---:|---:|
| 27B | 50.29 GiB | 25.15 GiB | 12.57 GiB |
| 32B | 59.60 GiB | 29.80 GiB | 14.90 GiB |
| 70B | 130.39 GiB | 65.19 GiB | 32.60 GiB |
| 120B | 223.52 GiB | 111.76 GiB | 55.88 GiB |
| 235B | 437.72 GiB | 218.86 GiB | 109.43 GiB |
| 405B | 754.37 GiB | 377.19 GiB | 188.59 GiB |

These are idealized weight payloads. Quantized formats can add scales, grouping metadata, padding, and tensors stored at higher precision. A format named `Q4` does not guarantee that the complete artifact uses exactly four bits for every parameter. Exact artifact sizes and measured loaded footprints take precedence. Reduced-precision storage also depends on supported kernels and may affect quality. [Transformers quantization documentation](https://huggingface.co/docs/transformers/main/quantization/bitsandbytes).

Reproduce the table without a model download:

```python
for billions in (27, 32, 70, 120, 235, 405):
    gib = [billions * 10**9 * bits / 8 / 2**30 for bits in (16, 8, 4)]
    print(billions, *(f"{value:.2f}" for value in gib))
```

## 3. Leave room to execute requests

Weights are one memory category. A route also needs session state, activations, temporary kernels, communication buffers, runtime allocations, and a safety margin. Other applications may already occupy part of the device.

```text
usable_device_memory = measured_available_memory - operator_reserved_memory

required_device_memory = assigned_weights
                       + assigned_session_state
                       + peak_temporary_buffers
                       + runtime_and_communication_memory
                       + safety_margin
```

Use measurements with a defined workload. Do not subtract an application's allocation twice if it is already excluded from measured available memory.

The **KV cache** stores attention information from earlier tokens so the model can reuse it during generation. Its footprint depends on architecture, context, cache precision, and active sessions. Some architectures have sliding windows or different state layouts; a single per-parameter multiplier does not cover all of them. [Transformers cache strategies](https://huggingface.co/docs/transformers/main/kv_cache).

For a conventional full-attention transformer without cache sharing or compression, a starting approximation is:

```text
KV_bytes ≈ 2 × layers × KV_heads × head_dimension
             × cached_tokens_per_session × bytes_per_cache_element
             × concurrent_sessions
```

This is an architectural estimate, not a universal runtime formula. Derive layer and head counts from the pinned configuration, account for the engine's actual partitioning, and measure peak usage. Never infer KV memory from parameter count alone.

For illustration, 80 layers, 8 KV heads, head dimension 128, an 8,192-token cache, and two bytes per cache element produce 2.5 GiB of KV payload for one session. Four independent sessions produce 10 GiB under these assumptions. This example does not describe a qualified NETWORK AI profile.

## 4. Derive a conditional minimum device count

Suppose every candidate device has **20 GiB left for weights after its other requirements have been covered**. An idealized lower bound is:

```text
minimum_devices_by_weight_memory = ceil(weight_GiB / 20)
```

| Parameters | Devices at 16 bits | Devices at 4 bits |
|---|---:|---:|
| 27B | 3 | 1 |
| 32B | 3 | 1 |
| 70B | 7 | 2 |
| 120B | 12 | 3 |
| 235B | 22 | 6 |
| 405B | 38 | 10 |

If each person supplies exactly one such device, these would also be lower bounds on contributing people. Ten compatible devices owned by one operator might instead mean one participant. The table makes no assumption about redundancy or service-level objectives.

Even under its memory assumptions, the bound may be unattainable. An indivisible layer might not fit on any device; the engine might require equal partitions; some tensors may be replicated; or communication may be too slow. Extra devices may be required, or the route may be invalid altogether.

For heterogeneous devices, `sum(usable_weight_budgets) >= weight_GiB` is only an initial necessary check for a fully resident route. Every assigned part must fit its destination, and the complete assignment must be supported. CPU offloading or dynamic expert loading introduces a different profile with transfer costs that require separate measurement.

## 5. Distinguish three kinds of scaling

| Goal | What you add | What it changes |
|---|---|---|
| Fit a larger model | Compatible memory and execution stages in one route | Whether a complete model can execute |
| Serve more requests | Qualified replicas or measured concurrency | Aggregate throughput and queue time |
| Survive failures | Independent spare stages or complete standby routes | Recovery and availability |

Replicas of a 32B model do not become a 70B model. Ten nodes in a split route do not guarantee ten times the token rate. Faster generation, more concurrent users, and larger resident models are separate outcomes.

Tensor parallelism splits numerical operations among devices; pipeline parallelism places groups of layers on different stages. They have different communication needs. vLLM documents single-device, single-host multi-GPU, and combined multi-host approaches. Those examples are engine deployment strategies, not evidence of volunteer WAN support in NETWORK AI. [vLLM parallelism and scaling](https://docs.vllm.ai/en/latest/serving/parallelism_scaling/).

## 6. Account for the network between stages

A distributed request transports intermediate data between parts of the model. Latency is paid along the dependency path; bandwidth limits how quickly activations or state can move. Congestion, relay hops, packet loss, and the slowest stage can affect completion.

A rough diagnostic for sequential stages is:

```text
step_latency ≈ sum(stage_compute_times) + sum(boundary_transfer_times)
```

Pipelining, batching, collectives, and overlap change this relationship. Measure time to first visible token, inter-token latency, completed requests, and failure recovery at the intended context and concurrency.

Prefer nearby compatible GPUs where communication is intensive. Cross-participant layer pipelines remain a research path for larger models, but require qualification on real links. Petals' authors report experiments with uneven devices and Internet connections. Their results support investigating the approach; they are not NETWORK AI measurements. [Petals research paper](https://arxiv.org/abs/2312.08361).

## 7. Treat mixture-of-experts models carefully

A mixture-of-experts model, or **MoE**, selects some expert networks for each token. Its active parameter count can be much smaller than its total count. For example, the publisher lists Qwen3-235B-A22B-Instruct-2507 as 235B total parameters and 22B activated parameters. [Official model card](https://huggingface.co/Qwen/Qwen3-235B-A22B-Instruct-2507).

For a fully resident deployment, the model still needs access to its required weights, including experts not selected for the current token. Active parameters are not a substitute for total weight sizing. Expert offloading and on-demand loading are separate design choices whose engine support and transfer costs need measurement.

Routing an API request to a node and routing a token to an expert inside a model are different operations. The current coordinator performs the former. It does not implement arbitrary numerical expert routing.

## 8. Qualify a route before advertising it

Publish a qualification record containing:

1. Model ID, pinned revision, hashes, license, architecture, quantization, and tokenizer/template.
2. Engine, build, drivers, supported devices, and exact partition map.
3. Physical devices and operators, usable memory, per-stage peaks, and shared-resource limits.
4. Context, maximum output, concurrency, quality/parity procedure, and full-request results.
5. Link topology, latency/bandwidth measurements, relay use, and actual host count.
6. First-token/inter-token latency, completed-request throughput, rejected requests, and uncertainty.
7. Failure, cancellation, replacement, state recovery, and accounting outcomes.
8. Operating costs and the source funding the contribution contract.

Only then should a route move from proposal to available service. A parameter count, download, loaded tensor, heartbeat, or sum of GPU memory is insufficient on its own.

## 9. What the repository demonstrates today

The private product has executed a community model identified as `Qwen3.8-27B / Q4` on one shared GPU. The F0 split-model experiment used BLOOM-560m on two CPU processes on the same host. Neither demonstrates a distributed model above 27B in the integrated product.

The next large-model milestone should qualify a pinned model above 27B, first on a supported nearby multi-device route and then across physical hosts with measured links. Smaller controlled baselines remain useful for isolating numerical or transport regressions. See the [roadmap](planning/12_ROADMAP_AND_BACKLOG.md) and [launch gates](execution/GATES.md).
