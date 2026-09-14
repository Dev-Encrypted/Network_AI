# 20. Cooperation without cash buyers and elastic usage limits

## Distinguish the demand states

| Situation | Interpretation | Proposed response |
|---|---|---|
| No cash buyers, useful cooperative demand | Members still exchange contribution and inference | Maintain qualified coverage funded by cooperative circulation and explicit external support |
| Low compatible demand, ready funded capacity | Accepted resources have spare service headroom | Increase temporary new-request allowances within that profile |
| High compatible demand | The queue competes for finite capacity | Withdraw new extras, enforce bounded admission and consider funded expansion |
| No complete route for a requested model | Idle hardware elsewhere is not yet useful for it | Report unavailability; qualify and fund missing compatible stages |
| No useful demand | Continuous readiness lacks a demonstrated replenishing flow | Reduce future coverage, schedule demand-backed windows or hibernate affected promises |

The absence of buyers is not the absence of costs. External operation still needs money or a defined in-kind contribution.

## Candidate 1×/2×/4× allowances

The historical candidate permits temporary concurrency allowances per configuration as recent usable headroom increases. Begin from the base allowance, promote gradually, and require fresh healthy capacity, acceptable queue/latency signals, available spending balance, and funded resources.

The multiplier is an admission allowance. It does not multiply throughput, expand the context window, change the tariff, issue permanent TU, or turn a protected standby into free capacity. It is not currently implemented in the private preview, and the F0 event study does not fully evaluate it.

For example, allowing an eligible account two simultaneous requests instead of one can make sense when its qualified route has spare funded slots. It does not mean a 70B model becomes twice as fast, or that a route can safely double its KV cache allocation without measurement.

## Demand returns

When the queue or service metrics deteriorate, stop granting additional extras before affecting already accepted sessions. Use bounded queues, deadlines, backpressure, and retry budgets. Do not keep admitting work just because an old idle-capacity observation looked healthy.

The implementation must distinguish the time a limit changes from the terms attached to an accepted request. An update should affect new admission without retroactively changing a settled price or deleting an earned balance.

## Coverage for less popular large models

Above-27B models may require several contributors to stay ready at once. If demand is intermittent, scheduled windows or requester-funded readiness can be more appropriate than permanent shared coverage. The exact choice needs measured loading time, expected funded requests, and contributor commitments.

Model popularity must not silently force every participant to subsidize a route indefinitely. Publish its availability policy and funding source. A catalog entry remains discoverable even when no route is presently funded or ready.

## Acceptance criteria

A complete controller test must include demand transitions, stale heartbeats, route loss, concurrent requests, queued work, anti-Sybil limits, paid/cooperative contention, and recovery after resources return. Count compatible requests refused for capacity in service metrics.

The next economic study must integrate these transitions with lease timing, receipts, liquidity and the 24-hour recovery predicate. The existing arithmetic examples are useful checks, but not complete policy proof. [Examples](21_COOPERATIVE_SIMULATIONS.md), [v6 rules](24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md), [F0 result](../execution/ECONOMY_V1_RESULTS.md).
