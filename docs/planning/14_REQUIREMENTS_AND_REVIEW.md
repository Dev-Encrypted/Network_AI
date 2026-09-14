# 14. Requirements and review coverage

This matrix connects the product requirements to the maintained English explanation and current evidence. It is a review map, not a declaration that every requirement has been implemented.

| Requirement | Design reference | Current status and acceptance gap |
|---|---|---|
| Large models remain central | [Scaling](../MODEL_SCALING.md), [models](05_MODELS_AND_DISTRIBUTION.md) | Focus is above 27B; integrated large-model distributed qualification is pending |
| Different GPUs can contribute | [Hardware](15_HETEROGENEOUS_HARDWARE_AND_CATALOG.md) | Private domain limits work locally; other hardware and complete routes need measurement |
| Community model proposals | [Product](01_PRODUCT_VISION.md), [data](09_DATA_MODEL_AND_APIS.md) | Immutable text candidates and local qualification implemented; arbitrary adapters are not |
| Chat and API | [Private API](../implementation/API.md) | Real text inference implemented; tools and multimodality are outside the private contract |
| Contributor identities and controls | [Protocol](06_NODE_PROTOCOL_AND_SCHEDULER.md) | Signed enrollment, heartbeat, pause and epoch fencing implemented privately |
| Cooperative credits | [Ledger](07_CREDITS_AND_LEDGER.md), [policy](24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md) | LAB_TU accounting exists; cooperative readiness issuance is a candidate |
| Fair and usable exchange | [Distribution](16_TOKEN_ECONOMY_AND_FAIR_DISTRIBUTION.md) | Current economic configuration failed; cohort circulation must be revised |
| More access during low demand | [Elastic limits](20_COOPERATIVE_ECONOMY_AND_ELASTIC_LIMITS.md) | Candidate 1/2/4 limits; not implemented in the product or full F0 study |
| Operation without cash buyers | [Operations](11_OPERATIONS_AND_ECONOMICS.md) | Design separates cooperation and external costs; recurring coverage needs proof |
| Optional cheaper paid API | [Market](18_OPEN_NETWORK_AND_COMPUTE_MARKET.md) | No payments or qualified price advantage yet |
| Decentralized participation and continuity | [Continuity](22_POLICY_CLOSURE_AND_CONTINUITY.md) | Single private coordinator; independent operators and federation pending |
| Honest public evidence | [Sources](13_REFERENCES_AND_EVIDENCE.md), [publication](../publication/README.md) | Original records and failed studies preserved; English explanations state scope |
| Author credit and reuse rights | [Licensing](../LICENSING.md) | Dev-Encrypted attribution; Apache 2.0 code and CC BY 4.0 prose |

## Review procedure

For each proposed change, identify the requirement it affects, the executable contract, and the evidence needed to accept it. Distinguish a document correction from a runtime capability. Translating the model roadmap into English does not enable a distributed runtime; adding a catalog row does not qualify its engine.

Check contradictions across consumer promises, operator commitments, accounting and failure behavior. For example, a model can have many registered contributors but no complete route; a consumer can have credits but no compatible funded service; a receipt can be correctly signed but report unverified work.

## Completion language

Use 'implemented in the private profile' for verified local behavior, 'measured on one physical host' for the current campaign, and 'candidate' for unapproved economic rules. Reserve a public-launch claim for all applicable gates with the required independent operational evidence.

The [roadmap](12_ROADMAP_AND_BACKLOG.md) identifies work packages. The [gate register](../execution/GATES.md) records what still prevents opening a public cooperative or commercial service.

