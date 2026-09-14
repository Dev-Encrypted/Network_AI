# 15. Heterogeneous hardware and useful contributions

## Different devices need different profiles

A network may include small and large GPUs, multi-GPU hosts, different operating systems, shared memory devices, and CPU-only resources. Their advertised capacity is not interchangeable. A profile must identify supported kernels, usable memory, model format, context, concurrency, connectivity, and observed performance.

The recommended focus above 27B increases the importance of coordinating contributions, but it does not exclude less powerful machines. A smaller device may serve a complete smaller model, a supported stage, or another explicitly qualified role. It must not be promised payment for a role the engine cannot execute.

## Inventory and qualification

| Dimension | Record | Reason |
|---|---|---|
| Physical resources | Devices, memory, CPU, RAM, storage, shared capacity | Prevents unsupported placement and double commitments |
| Runtime | OS, drivers, engine/build, kernels, precision | Determines whether the artifact can execute |
| Workload | Context, output, concurrency, cache policy | Determines session and temporary memory |
| Network | Location/topology, latency, bandwidth, relay and stability | Determines whether stages can cooperate usefully |
| Availability | Contracted windows, interruption policy, recovery | Prevents treating an occasional contributor as permanent coverage |
| Evidence | Memory peaks, quality/parity, latency, completions and failures | Supports a bounded service promise |

The private profile uses administrator-defined physical domains and one configured backend model per agent. Multiple agents can share a domain limit. It does not discover a fraudulent operator registering the same GPU under several false domains.

## Placement is a complete-route problem

A 70B route needing more weight memory than one device provides can be split only if the engine supports a partition that fits every destination. A mixture of 8 GiB and 48 GiB devices does not automatically behave like one 56 GiB device. Some components may be indivisible, some buffers replicated, and some links unsuitable.

One route's slowest required stage can limit service. A device with less memory may also have less bandwidth or compute. Partition size should therefore follow measured memory and latency budgets, not an equal number of layers assigned to every participant.

The [scaling guide](../MODEL_SCALING.md) separates weight sizing, session memory, minimum device counts, replicas and redundancy. Its hypothetical counts are not a supported-hardware shopping list.

## Fairness and visibility

Publish selection frequency, accepted contribution time, effective earnings, waiting time and consumption opportunities by profile and cohort. Equivalent qualified offers should have an auditable selection policy. A high advertised GPU count or additional node identities must not buy priority by itself.

Fairness does not require identical rates for unequal useful service, nor can it guarantee work for every idle device simultaneously. It does require transparent eligibility, reasons for rejection, bounded newcomer opportunities, and measurements showing whether different contributors can spend what they earn.

## Catalog behavior

Expose exact configuration and current availability separately. If a route is unavailable, report missing compatibility, qualification, readiness or capacity rather than returning another model without consent. A new architecture should enter through a proposed adapter and qualification campaign. See [model lifecycle](05_MODELS_AND_DISTRIBUTION.md) and [fair distribution](16_TOKEN_ECONOMY_AND_FAIR_DISTRIBUTION.md).
