# 16. Usage-token economy and fair distribution

## What fairness must accomplish

The cooperative economy should let participants turn useful accepted contribution into access to models they need. It must account for different devices and profiles, avoid unsupported issuance, and expose unequal opportunities or liquidity shortages.

The recommended focus on models above 27B makes this a network problem. A large-model route may require several contributors, while a smaller route may be served by one. Payment must fund the complete useful route without multiplying rewards for arbitrary fragmentation. Parameter count alone is not a tariff.

## Separate contribution, consumption, and access

| Activity | Candidate cooperative rule | Private preview |
|---|---|---|
| Offer a device | Publish a bounded, qualified offer | Administrator-provisioned domain and invitation |
| Earn credits | Accepted useful READY time at the contracted rate | Share of completed LAB_TU inference charges |
| Consume service | Quote, hold, measured usage and settlement | Implemented for a text subset |
| Receive temporary extra concurrency | Recent compatible headroom and funded capacity | Not implemented |
| Receive an initial grant | Explicit bounded source with exposure accounting | Explicit lab issuer; new users start at zero |
| Sell capacity for money | Separate qualified seller and payment contract | Disabled |

Do not describe the private completed-work rule as if it implements cooperative readiness compensation.

## Price useful profiles

The intended consumer tariff distinguishes input, output and other workload units where appropriate. A quote fixes profile and terms before execution. Reference prices for capacity accounting are not changed simply to manufacture a larger issuance budget.

For contributors, measure the useful capacity accepted, its availability window, and the cost of delivering the required service. Equivalent offers should receive auditable opportunities. Larger devices can provide more useful work, but additional identities representing the same device cannot create additional capacity.

## Distribution policy

Prioritize a justified essential coverage set, then expansion backed by independent compatible demand, then bounded experiments. Contract only capacity with a funded source and an explicit duration. A model proposal does not obligate the common fund to pay permanent coverage.

Keep newcomer exposure bounded and publish selection rates, waiting time, rejection reasons, verified readiness, and earnings by profile. Review anti-Sybil and collusion controls before open enrollment. A simple account cap cannot establish person-level fairness.

## Make the exchange understandable

For each qualified profile, publish how many reference requests one accepted contribution hour can buy. Fix model, precision, context, output, tokenizer and workload. Report the distribution across participants, not just a global average.

Track participants who want to use the network but lack balance, those with balance but no compatible route, and those who cannot obtain accepted contribution opportunities. A nominally equal rule can still produce an unusable economy when demand and earnings fall into different cohorts.

## Prevent hidden subsidies and liabilities

Existing balances, accepted contracts, working liquidity, protected reserves and future issuance commitments need distinct records. Additional grant or issuance authority cannot be inferred from spare GPU advertisements. A temporary allowance is not permanent issued stock.

The candidate v6 policy bounds issuance and requires a mature phase without ordinary new issuance to test recurring coverage. It also checks whether participant cohorts retain access. [Candidate policy](24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md).

## What must change after F0

The tested setup paid large-model providers more of the flow while many compact-model participants lacked spending liquidity. Working funds could not sustain the fictional coverage during maturity. All runs retained accounting invariants, yet none passed every economic gate.

Recalibrate coverage windows, actual funded demand, useful contribution opportunities and cohort exchange rates together. Preserve existing rights in any real system; do not fix a simulation by retroactively deleting balances. Use fresh holdout seeds after observing the original failure. [Results](../execution/ECONOMY_V1_RESULTS.md).
