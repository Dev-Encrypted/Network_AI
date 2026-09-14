# 01. Product vision and participant journeys

## The service people should receive

NETWORK AI should make qualified inference available through a chat interface and a documented API. People contribute useful resources, understand the terms they accept, and spend usage credits on available models. The recommended focus is models above 27B parameters, while retaining compatible smaller profiles.

A participant should be able to answer three questions before contributing: what will run on my hardware, how much resource will it reserve, and what can the resulting credits buy? A consumer should know the exact model profile, maximum charge, likely waiting conditions, and trust boundary before submitting data.

## Roles

| Role | Responsibility | Expected control |
|---|---|---|
| Consumer | Requests inference and funds its reservation | Model/profile choice, output limit, cancellation, usage history |
| Contributor | Offers capacity for an accepted interval | Device budget, availability, assigned model, pause/drain, receipt history |
| Model publisher | Proposes an exact artifact and supported profile | Revision, origin, license, hashes, compatibility evidence |
| Route operator | Coordinates a complete execution route | Stage capacity, service terms, recovery, funded component contracts |
| Gateway operator | Provides access and admission | Protocol compatibility, request limits, availability, accountable routing |
| Ledger operator | Confirms authorized accounting transitions | Defined governance, independent operation, audit and recovery duties |

One person may hold several roles. Their authority and funds still need separate boundaries.

## Consumer journey

The consumer chooses an available profile and receives a quote. The system reserves the maximum authorized charge, admits the request against a complete route, streams the answer, and settles accepted usage. A failure has a terminal reason and a documented accounting outcome. A retry cannot charge for the same operation twice.

The private preview implements this journey for text requests and `LAB_TU`. It retains metadata rather than past answer bodies. Tools, attachments, multimodality, and a coding agent are future profiles, not implied by Chat Completions compatibility.

## Contributor journey

The intended contributor flow inventories resources, proposes a bounded offer, qualifies the exact runtime, and accepts assignments. Operators need transparent earning rules and a way to stop new admissions while accepted work drains. They must not be paid merely for declaring a GPU that is unavailable or already promised elsewhere.

Today, a private administrator provisions a physical domain and an invitation. The Rust node registers a persistent identity and serves its configured backend. This tests the operational flow with trusted participants; it is not permissionless enrollment.

## Community model publication

Open publication means anyone can propose a model and supply evidence. It does not mean every architecture becomes executable immediately. A candidate requires lawful artifact access, an adapter, measured memory, a complete route, and a qualified service envelope. An unavailable model should show why it is unavailable instead of silently substituting a different one.

## Product priorities and acceptance

Prioritize an understandable catalog, honest availability, bounded quotes, visible session/accounting states, clear operator controls, and reproducible larger-model qualification. Avoid dashboards that present hypothetical network capacity as live metrics.

Success requires evidence that contributors can earn through useful work and spend on the models they need, that consumers receive completed service within stated limits, and that the system survives documented failures. More registrations or a larger advertised parameter count alone do not establish this outcome. See [fair distribution](16_TOKEN_ECONOMY_AND_FAIR_DISTRIBUTION.md) and [implementation status](../implementation/STATUS.md).
