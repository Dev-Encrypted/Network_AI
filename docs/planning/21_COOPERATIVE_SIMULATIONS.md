# 21. Historical cooperative controller examples

The cooperative-elastic reference contains 20 deterministic examples for selected capacity, allowance and accounting calculations. It represents a partial earlier revision, before the full continuity and working-floor rules were consolidated.

- [Historical cooperative policy](evidence/cooperative-elastic-policy.json)
- [Calculator](evidence/simulate_cooperative_elastic.py)
- [Recorded examples](evidence/cooperative-elastic-simulations.json)

## Read them as bounded examples

Each example has explicit inputs and a narrow claim. It can show how a selected arithmetic rule reacts to a fictional amount of headroom or demand. It does not establish real GPU capacity, human fairness, funding, operator independence or public availability.

An idle-route example is only meaningful for compatible usable resources. Extra capacity serving another architecture does not increase availability for a model above 27B unless it can be integrated into that model's qualified route.

## What remained missing

The historical examples do not combine all lease, receipt-review, cancellation, failure, refund, circulation and recovery transitions into one live system. Later revisions distinguish working funds, protected reserves and future issuance commitments. Candidate v6 also prioritizes the essential renewal floor.

The F0 event simulator is a separate, broader study. Its current implementation still lacks full 1/2/4 allowance behavior and the complete evaluator that starts recovery timing only when every required condition returns. Passing these 20 examples does not close those omissions.

## Reproduction discipline

Read original policy and source hashes with the recorded output. Preserve original files and write revised calculations to a new experiment directory. Legacy verifier outputs describe their archived source tree; they do not validate the newer private product.

For current interpretation, read [elastic limits](20_COOPERATIVE_ECONOMY_AND_ELASTIC_LIMITS.md), [continuity](22_POLICY_CLOSURE_AND_CONTINUITY.md), [candidate v6](24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md), and [F0 economic results](../execution/ECONOMY_V1_RESULTS.md).
