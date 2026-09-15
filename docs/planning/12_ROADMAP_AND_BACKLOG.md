# 12. Roadmap and acceptance backlog

## Advancement follows evidence

The goal remains cooperative decentralized inference, with **models above 27B parameters as the recommended focus**. The private preview is an implementation increment, not completion of the full network. There is no fixed delivery date without a team, confirmed hardware, budget, and experimental results.

The original 58-item backlog and its detailed historical decomposition remain in the [original planning source](../publication/README.md). The table below is the current English delivery map, including later evidence. Its work packages do not relabel unfinished historical requirements as completed.

| Package | Deliverable and acceptance | State |
|---|---|---|
| R01: artifact provenance | Pinned model, license, verified weights, tokenizer/template and engine record | Partial F0 evidence; qualify each offer |
| R02: private identity | Account isolation, revocable keys, invitations, node signatures and epochs | Implemented and locally tested |
| R03: private inference | Browser/API request reaches a real model, streams, cancels and reports usage | Implemented in one-host local profile |
| R04: transactional accounting | Integer holds, balanced journal, idempotent settlement and protected projections | Implemented for LAB_TU |
| R05: shared capacity | Two real agents sharing one domain cannot overlap its single slot | Demonstrated on one physical host |
| R06: private recovery | Node restart fences stale work; receipts survive brief control outage; backup restores consistently | Local campaign passed |
| R07: model above 27B | Complete inference on a pinned, licensed larger-model configuration with measured memory and quality | Official 32.8B Q4_K_M executed; buffers and short token comparisons measured; broader quality/context qualification remains |
| R08: nearby multi-device route | Supported partition, per-device budget, parity and concurrency evidence | Two CPU worker processes on one host demonstrated; distinct GPUs/devices remain |
| R09: distinct physical hosts | LAN and WAN profiles with measured links, NAT/relay behavior and independent failure injection | Private node-control QUIC and guarded 32B model-data QUIC implemented on one host; worker-local cross-host supervision/readiness, distinct-host and relay qualification remain |
| R10: integrated distributed model | Gateway admission covers every stage; cancellation, receipts and recovery work for the whole route | Real 32B root plus two signed stages, route-bound RPC over QUIC, all-domain reservations, receipts and post-link-loss reload demonstrated on one host; distinct devices, WAN and adversarial verification remain |
| R11: heterogeneous profiles | Qualified hardware classes with transparent contribution-to-consumption comparisons | Required beyond the current host |
| R12: useful readiness contracts | Funded bounded leases, verified READY periods, no duplicate physical commitments | Private standalone/complete-route escrow, common-fund recycling, bounded automatic renewal and demand-backed expansion implemented; independent verification, public evidence/correction policy and approved issuance remain |
| R13: full economic study | Updated parameters, fresh holdout, full elastic/recovery predicates and mature-phase/cohort acceptance | Tested F0 configuration rejected |
| R14: public trust | Work/resource verification, bounded newcomer exposure, adversarial and collusion tests | Required |
| R15: independent continuity | Named operators, quorum, partition, restoration, key rotation and replacement gateway | Required |
| R16: operational pilot | Confirmed costs and responsible operators; actual 7/30-day pilot evidence | Required |
| R17: optional commercial service | Seller responsibility, capped funding, settlement, disputes, payouts and exit tested end to end | Separate path; disabled |
| R18: broader product | Desktop contributor, localization, model adapters, multimodality and locally bounded coding agent | Incremental work after compatible contracts |

Through v0.8, private circulation and expansion are executable mechanisms. A live one-account 32B cycle demonstrates recycling and honest expansion refusals; separate isolated fixtures demonstrate the positive expansion transaction, rollback and restoration. Neither is a real 24-hour recovery observation, independent-provider economy or successful mature study. [Current validation and remaining work](../implementation/STATUS.md).

## Order of work

First preserve the executable private contracts and complete larger-model artifact and memory qualification. Start the difficult large-model research early; do not defer it until every interface feature is finished. Keep a smaller controlled baseline to isolate numerical and transport errors.

Capacity measurements and economic modeling can progress independently, then feed each other through observed costs and service envelopes. A simulation must not assign throughput to a route that has not been demonstrated. An engine integration must not claim a sustainable tariff merely because an accounting test passes.

Once routes and contracts are stable, validate adversarial participants, independent operators and continuity. Only then can a funded public pilot establish operational claims. Commercial integration has an additional gate and does not block a healthy cooperative experiment.

## Required evidence per package

A completed package identifies commit, environment, commands, raw evidence, accepted criteria, failures, and limits. A hardware claim records physical host count. A price claim records costs and the date of measurement. A simulation lists fictional inputs and unused holdout seeds before evaluation.

If a criterion fails, revise scope or implementation and produce a new run. Preserve the old result. Do not weaken the denominator after observing failures or move a historical release tag to make a new result appear original.

The launch decision is tracked in [FC01–FC06](../execution/GATES.md), with the candidate policy in [chapter 24](24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md).
