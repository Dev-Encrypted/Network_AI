# Current advancement and launch gates

Status reflects the September 14, 2026 F0 evidence and private v0.2 implementation. A gate requires the stated evidence; a document, passing unit test or public repository is not enough.

| Gate | Current evidence | Still required |
|---|---|---|
| FC01: contract coherence | Candidate v6 preserved; private persistent admission/accounting implemented and tested | Full target cooperative/distributed contracts and lifecycle consistency |
| FC02: economics and liquidity | Event study completed; fictional parameters rejected | New calibration, observed costs/behavior, fresh holdout, full elastic/recovery evaluation |
| FC03: capacity and exchange | Local inference, small CPU partition and two-agent shared-domain evidence | Model above 27B on qualified multi-device routes, distinct physical hosts, other hardware and measured exchange ratios |
| FC04: optional commerce | Historical adapter reference only | Responsible seller, bounded payments, finality, payouts, disputes and exit |
| FC05: trust and continuity | Local transport controls, node epochs, receipt outbox and database restore | Independent operators, quorum, adversarial verification, partitions and replacement gateway recovery |
| FC06: funded pilot and opening | Private application available for further work | Confirmed operating/closure resources, named responsibilities and actual 7/30-day pilots |

## Concrete capacity gaps

The official Qwen3-8B launcher is prepared and its parser was checked against the installed vLLM. Its preflight requires at least 21,504 MiB free on GPU 0. The historical observation had about 1.9 GiB free because another model was loaded. Prepared artifacts do not mean that BF16 benchmark ran.

No second physical host was used in the reported experiments. Loopback, WSL and multiple processes cannot satisfy a real-host requirement. There is also no qualified complete Kimi K3 route; partial tensor loading is narrower evidence.

The recommended product focus is models above 27B. The next capacity campaign must explicitly qualify such a profile, with exact model identity, per-device memory, complete inference, quality/parity, links, concurrency and recovery. Small controlled baselines remain useful without being promoted to proof of the larger target.

## Economic and public-operation boundaries

Do not apply rejected fictional tariffs or issuance settings to public balances, copy simulated starting funds into a real genesis, or promise contributor income from unqualified capacity. The private LAB_TU grant is a clearly separate test mechanism.

An open catalog does not certify every GPU/model combination. License, architecture, engine, physical route, trust and funding are separate checks. Paid service needs FC04 in addition to applicable common gates; no payments or withdrawals are enabled today.

Economic failure does not prevent further private inference engineering. It prevents describing the tested settings as a sustainable public policy. See [the candidate rules](../planning/24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md) and [implementation coverage](../implementation/STATUS.md).
