# 19. Historical market calculations

## What is included

The original market package contains eight deterministic payment examples using fictional units and assumptions. It is separate from cooperative TU accounting and does not execute a financial transfer.

- [Historical market policy](evidence/open-market-policy.json)
- [Reference calculator](evidence/simulate_open_market.py)
- [Recorded calculations](evidence/open-market-simulations.json)

The original policy uses a fictional payment unit. Its numbers are not a live token, exchange rate, provider price, or guaranteed margin.

## Purpose

These examples make cash-flow boundaries reviewable. A buyer's authorized maximum, the amount charged for accepted service, fees, provider payables and refunds must reconcile without double counting. A seller cannot treat the same customer deposit as both a withdrawable liability and free operating revenue.

For a distributed model, a route seller also needs funded commitments to required components. A component's accepted readiness obligation cannot disappear merely because a different stage failed. The responsible party and loss budget must be defined in the offer.

## Limits

Arithmetic consistency does not prove payment finality, custody safety, dispute resolution, legal eligibility, withdrawal during gateway failure, or sustainable demand. It also does not prove that a proposed model route can execute. Those require separate integration, operational and capacity evidence.

Do not infer a universal revenue split from these fictional cases or from the private preview's 80/20 LAB_TU experiment. The commercial cost model must use the qualified profile's complete measured costs and explicit provisions.

## Next validation

Keep new adapter experiments in separate versions with exact test contracts and capped test funding. Exercise concurrent authorizations, replay, process restart, partial delivery, refunds, dispute funding and exit. A successful payment test still needs a qualified inference route before an offer becomes usable.

See [market architecture](18_OPEN_NETWORK_AND_COMPUTE_MARKET.md), [operating costs](11_OPERATIONS_AND_ECONOMICS.md), and [FC04](../execution/GATES.md). Commercial integration remains optional and disabled in the current private application.
