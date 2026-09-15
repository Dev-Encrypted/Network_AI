# NETWORK AI documentation

The maintained documentation is in English. It explains both the long-term cooperative network and the private software that can run today. Begin with the guide matching your experience, then follow the technical references.

The [cooperative fund guide](implementation/COOPERATIVE_FUNDS.md) explains the implemented credit cycle. The [v0.7 bounded-renewal guide](implementation/BOUNDED_RENEWALS.md) adds automatic continuation with separate spending limits and provider consent, including actual one-computer 32B evidence.

## Reading paths

| Reader | Start here | Continue with |
|---|---|---|
| New to AI infrastructure | [Beginner guide](GETTING_STARTED.md) | [Glossary](GLOSSARY.md), [full article](ARTICLE.md) |
| Interested in models above 27B | [Model scaling](MODEL_SCALING.md) | [Model integration](planning/05_MODELS_AND_DISTRIBUTION.md), [hardware profiles](planning/15_HETEROGENEOUS_HARDWARE_AND_CATALOG.md) |
| Running a private deployment | [Application overview](implementation/README.md) | [Operations](implementation/OPERATIONS.md), [API](implementation/API.md) |
| Studying credits and fairness | [Fair distribution](planning/16_TOKEN_ECONOMY_AND_FAIR_DISTRIBUTION.md) | [Candidate v6 policy](planning/24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md), [failed economic study](execution/ECONOMY_V1_RESULTS.md) |
| Developing the system | [Technical handbook](planning/README.md) | [Implementation status](implementation/STATUS.md), [contribution guide](../CONTRIBUTING.md) |
| Checking evidence | [F0 results](execution/README.md) | [Reproduction](execution/REPRODUCE.md), [archive provenance](publication/README.md) |

## How to read a claim

**Implemented** means the linked source provides the behavior in the stated private profile. **Measured** means a named experiment exercised it under recorded conditions. **Simulated** means a program evaluated explicit assumptions. **Planned** means implementation or qualification is still required. Arithmetic estimates are labeled separately.

The product targets models above 27B. Version 0.3 executed an official 32.8B Q4_K_M model locally and across two trusted CPU worker processes, then completed and settled a request through the application and private QUIC bridge. All of this evidence comes from one physical host. Read the [measured allocations, numerical comparison and boundaries](implementation/MODEL_ARTIFACTS.md) before treating the experiment as evidence for independent contributors or WAN operation.

Version 0.4 adds [complete routes and participant settlement](implementation/COMPLETE_ROUTES.md): signed stage claims, all-domain reservations, provider consent, real guarded 32B computation and refund after stage loss. Its evidence still uses one computer and one operator account.

Version 0.5 adds [one funded readiness window for a complete route](implementation/ROUTE_AVAILABILITY.md), including every-provider acceptance, component entitlements during a peer failure, shared physical-domain exclusion and exact refunds. Actual agents exercised this on the same installed 32B route. Readiness compensation remains additional to inference payment; cooperative treasury circulation and economic viability are not established by this contract test.

## Documentation map

- [Article](ARTICLE.md): motivation, architecture, participation, economics, limitations, and results.
- [Technical handbook, chapters 00–24](planning/README.md): design decisions and acceptance criteria.
- [Private implementation](implementation/README.md): executable contracts, operations, accounting, and validation.
- [Research execution](execution/README.md): measurements, simulations, reproduction, and open gates.
- [Publication](publication/README.md): English edition provenance and immutable original archives.
- [Licensing](LICENSING.md): Apache 2.0 code, CC BY 4.0 prose, and Dev-Encrypted attribution.
- [Language policy](LANGUAGE.md): maintained English material and explicitly preserved historical data.

Original Portuguese planning documents remain available in the immutable Git history and research release archives. Current English chapters are revised explanations that include later findings. The source manifest binds the original document hashes without relabeling English prose as historical evidence.
