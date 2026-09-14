# 10. Benchmarking and capacity qualification

## A benchmark qualifies a profile

A useful capacity claim names the exact model revision, precision, engine, hardware, context, output, concurrency, topology, and trust conditions. A single token-per-second number without these fields is not enough to admit requests or price contributed service.

Models above 27B are the recommended target. Small controlled models remain useful for debugging transport and parity, but their results cannot be extrapolated as proof of large-model performance.

## Measure the complete request

| Metric | Why it matters |
|---|---|
| Peak weights, session state and temporary memory | Prevents admission based on an incomplete memory budget |
| Time to first visible token | Captures queue, prefill and startup delay experienced by the consumer |
| Inter-token latency | Shows whether an accepted interactive stream remains usable |
| Completed requests within limits | Measures useful service instead of only generated intermediate work |
| Rejections, timeouts and funded requests without a route | Prevents selective denominators that hide unavailable service |
| Cancellation and resource release | Checks whether rejected or abandoned work continues consuming capacity |
| Failure and recovery time | Qualifies replacements, state handling and accounting under interruption |
| Energy, transfer and verification cost | Supports defensible contribution and API economics |

Report warmups separately from measured samples. Distinguish reasoning from visible output, cache hits from uncached work, and synthetic prompts from semantic evaluations.

## Recommended experiment sequence

1. Verify exact artifacts and run a single-device reference where feasible.
2. Measure a bounded workload with known input/output lengths and one session.
3. Sweep context and concurrency while recording peak memory and completion.
4. Compare a supported split route against an appropriate numerical reference.
5. Repeat on distinct physical hosts with a documented LAN/WAN topology.
6. Inject stage loss, delayed receipts, node restart, cancellation and coordinator interruption.
7. Repeat across device classes and record unsupported combinations explicitly.

For large profiles, test both whether the model fits and whether the service remains useful. A route that can generate one token after a very long delay may be a valid research result but fail an interactive service objective.

## Evidence levels

File inspection proves a limited statement about the inspected bytes. A successful forward proves a limited numerical operation. Complete generation on one host proves that configuration. Two processes on one host do not prove independent hosts, and a simulated network does not prove real NAT or relay behavior.

The repository preserves [actual F0 results](../execution/README.md): local community 27B inference, small CPU split-model parity, loopback transport, official-model preparation, partial Kimi inspection, and fictional economic simulations. Each report includes its boundary.

## Reproducible records

Use new run directories and retain the old ones, including failures. Record commands, source hashes, environment, sample counts, raw data references, and limitations. Recheck engine updates against the same profile before changing production claims.

A larger-model publication should let another operator reconstruct the artifact, partition, workload, topology, and analysis without access to private credentials. [Reproduction guide](../execution/REPRODUCE.md), [qualification checklist](../MODEL_SCALING.md), [launch gates](../execution/GATES.md).
