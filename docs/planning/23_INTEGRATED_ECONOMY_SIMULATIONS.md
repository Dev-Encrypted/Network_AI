# 23. Earlier integrated economic study

## Original v4 record

The original integrated package contains 54 simulations of 90 days and seven boundary references. It combines stock, circulation, supply, demand, participant cohorts, optional commerce, external costs, failures and provider exit under fictional inputs.

- [Original v4 policy](evidence/integrated-economy-policy.json)
- [Original simulator](evidence/simulate_integrated_economy.py)
- [Recorded outcomes](evidence/integrated-economy-simulations.json)
- [Earlier rejected draft](evidence/rejected-draft/integrated-economy-simulations.json)

The tested fictional economic configuration was rejected. These records remain unchanged. A corrected later policy does not retroactively approve them.

## Why integrate the rules

Isolated calculations can preserve a balance equation while omitting when providers are paid, when consumers can spend, how funds return to operation, and which cohorts obtain access. An integrated study exposes feedback between these variables.

A large-model route may need simultaneous payment for several providers. Its earnings can concentrate in a different cohort from demand. Global TU totals can therefore look adequate while one group cannot afford service and the working fund cannot renew coverage.

## Limits of the historical model

The v4 simulation is an earlier model with its own timing and simplifications. Do not relabel it as a run containing v6 essential-floor priority, the later detailed receipt lifecycle, or the F0 mature phase without ordinary issuance.

It is neither hardware evidence nor a demonstration of real user behavior, consensus, fraud detection, payment finality or profit. Its role is to reject or compare specified fictional configurations and identify the next experiments.

## Relation to F0

The later event study reconstructs five policy variants in a common experiment with 16 scenarios, 20 calibration seeds and 50 separate holdout seeds. Its 5,600 runs are distinct from these 54 historical runs. They are not an identical rerun of the old hourly program.

F0 again preserved its accounting invariants but rejected every case against the implemented economic acceptance gates. The current candidate therefore still needs new calibration, full lifecycle coverage, and fresh holdout data. [F0 analysis](../execution/ECONOMY_V1_RESULTS.md).

## Preserve the record

Compare revisions with explicit manifests, common workloads where appropriate, and separate output paths. Do not select only the best seed, remove capacity failures from the denominator, or tune a policy to observed holdout outcomes and call the same seeds independent validation.

The [v6 policy chapter](24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md) explains the revised order and pending acceptance criteria. The [source archive](../publication/README.md) preserves the original detailed interpretation.
