# English technical handbook

This handbook explains the intended cooperative network and the choices behind its private implementation. **Models above 27B parameters are the recommended focus**, with smaller profiles retained for accessible participation and controlled experiments.

The chapters are a September 14, 2026 English editorial edition. They include findings after the original planning cut. They are not a new economic-policy approval or a claim that all planned features exist. Original Portuguese drafts remain in the [immutable sources](../publication/README.md), including their complete historical detail and hashes.

## Chapters

| Chapter | Main question |
|---|---|
| [00: Executive summary](00_EXECUTIVE_SUMMARY.md) | What is being built, and what is ready? |
| [01: Product vision](01_PRODUCT_VISION.md) | Who participates and what do they receive? |
| [02: Research and comparison](02_RESEARCH_AND_COMPARISON.md) | Which existing systems inform the design? |
| [03: Architecture](03_ARCHITECTURE.md) | How do control, inference, artifacts, and accounting fit together? |
| [04: Technology decisions](04_TECH_STACK_AND_ADRS.md) | Why these components and where are their limits? |
| [05: Models and distribution](05_MODELS_AND_DISTRIBUTION.md) | How does an exact model become an executable route? |
| [06: Node protocol and scheduler](06_NODE_PROTOCOL_AND_SCHEDULER.md) | How are resources admitted and failures handled? |
| [07: Credits and ledger](07_CREDITS_AND_LEDGER.md) | How are promises, balances, and consumption recorded? |
| [08: Security and trust](08_SECURITY_AND_TRUST.md) | What can a participant or operator falsify? |
| [09: Data and APIs](09_DATA_MODEL_AND_APIS.md) | Which contracts connect the components? |
| [10: Benchmarks and capacity](10_BENCHMARKS_AND_CAPACITY.md) | What evidence qualifies a service? |
| [11: Operations and economics](11_OPERATIONS_AND_ECONOMICS.md) | Who pays the complete operating cost? |
| [12: Roadmap and backlog](12_ROADMAP_AND_BACKLOG.md) | Which deliverables and acceptance criteria come next? |
| [13: Sources and evidence](13_REFERENCES_AND_EVIDENCE.md) | Which claims are upstream, measured, simulated, or hypothetical? |
| [14: Requirements and review](14_REQUIREMENTS_AND_REVIEW.md) | How does each requirement map to evidence? |
| [15: Heterogeneous hardware](15_HETEROGENEOUS_HARDWARE_AND_CATALOG.md) | How do different GPUs contribute fairly? |
| [16: Usage-token distribution](16_TOKEN_ECONOMY_AND_FAIR_DISTRIBUTION.md) | How do contribution, spending, and opportunity interact? |
| [17: Early token calculations](17_TOKEN_POLICY_SIMULATIONS.md) | What did the first arithmetic examples establish? |
| [18: Open network and market](18_OPEN_NETWORK_AND_COMPUTE_MARKET.md) | How could independent offers and paid API service work? |
| [19: Market calculations](19_OPEN_MARKET_SIMULATIONS.md) | What do the historical payment examples cover? |
| [20: Cooperation and elastic limits](20_COOPERATIVE_ECONOMY_AND_ELASTIC_LIMITS.md) | What changes when compatible demand falls or rises? |
| [21: Cooperative examples](21_COOPERATIVE_SIMULATIONS.md) | Which controller calculations remain partial? |
| [22: Continuity and governance](22_POLICY_CLOSURE_AND_CONTINUITY.md) | What happens during funding, hardware, or quorum failures? |
| [23: Earlier integrated study](23_INTEGRATED_ECONOMY_SIMULATIONS.md) | Why was the historical v4 configuration rejected? |
| [24: Candidate v6 and launch gates](24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md) | Which rules and evidence govern advancement? |

For a first reading, use [the article](../ARTICLE.md), [model scaling](../MODEL_SCALING.md), and chapters 03, 16, and 24. For the software's actual current behavior, use [implementation contracts](../implementation/README.md). For observed outcomes, use [F0 results](../execution/README.md).
