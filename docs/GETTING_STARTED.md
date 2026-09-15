# Start here: understand the project and run a private lab

This guide is for readers who are new to distributed AI. You do not need a GPU to read the research or run the accounting tests. You need a compatible, separately configured inference engine to generate real model responses.

## The idea in an example

Alice has spare GPU time. Bruno wants to use a model that his laptop cannot serve comfortably. In the proposed network, Alice offers a measured amount of capacity for a defined period. If accepted, her contribution earns usage tokens. Bruno spends usage tokens to submit a request. Alice can later spend her earnings on another available model.

For a larger model, Alice's equipment may supply only part of a route. Other participants provide the remaining parts, and the system must coordinate them into a complete execution. That is the reason for the project's focus on **models above 27B parameters**. The [scaling guide](MODEL_SCALING.md) explains why the number of required contributors changes with hardware and model configuration.

This example describes the target cooperative network. Today's application runs a private laboratory profile with administrator-issued `LAB_TU`, whole-model node adapters, and one coordinator.

## Choose a reading path

| Your interest | Recommended path |
|---|---|
| The idea and its tradeoffs | [Article](ARTICLE.md), then [glossary](GLOSSARY.md) |
| Sharing a GPU | [Scaling](MODEL_SCALING.md), then [operator guide](implementation/OPERATIONS.md) |
| Calling the API | [API contract](implementation/API.md) |
| Credits and economic sustainability | [Fair distribution](planning/16_TOKEN_ECONOMY_AND_FAIR_DISTRIBUTION.md), then [actual simulation results](execution/ECONOMY_V1_RESULTS.md) |
| Implementing distributed execution | [Architecture](planning/03_ARCHITECTURE.md), [protocol](planning/06_NODE_PROTOCOL_AND_SCHEDULER.md), [roadmap](planning/12_ROADMAP_AND_BACKLOG.md) |
| Reproducing published evidence | [F0 reproduction](execution/REPRODUCE.md) |

## Install and start

Prepare Git, Node.js 24.13.0, pnpm 10.33.0, Rust 1.93.1, and Docker with Compose. Run commands from the repository root. The application uses its own PostgreSQL container and local ports.

```bash
git clone https://github.com/Dev-Encrypted/Network_AI.git
cd Network_AI
pnpm install --frozen-lockfile
pnpm lab:init
pnpm lab:start
```

Open `http://127.0.0.1:43100`. Read the credentials file whose private path the initializer prints. Its password is generated for your installation; there is no shared public administrator password.

The default `qwen-local` manifest describes the original test station's artifact. Your own model needs its own immutable manifest and administrator qualification. Follow [connecting a model and node](implementation/OPERATIONS.md) rather than assigning the original fingerprint to different weights.

The first administrator receives an explicit 100 `LAB_TU` test grant. New accounts receive zero. This balance exercises the software; it cannot be withdrawn or exchanged for money.

## Find your way through the current interface

The private-preview interface currently uses Brazilian Portuguese. Repository guides use English. These are the navigation labels you will encounter:

| Interface label | English meaning | What to do there |
|---|---|---|
| Conversar | Chat | Select an available model and submit a message |
| Modelos | Models | Inspect the catalog and submit a model candidate |
| Sessões | Sessions | Check execution state, token usage, and settlement |
| Créditos | Credits | Inspect available and reserved laboratory balances |
| Acesso à API | API access | Create or revoke your own API key |
| Meus nós | My nodes | Inspect, pause, or resume your agents |
| Administração | Administration | Provision users, grants, domains, invitations, and qualifications |
| Sair | Sign out | End the browser session |

## Complete your first request

1. Confirm that your qualified model's backend is running and loaded.
2. Confirm that its node is fresh and ready. An entry in the model catalog alone is insufficient.
3. Sign in and select the available model in Chat.
4. Send a short message with a small output limit.
5. Check Sessions after the response. A valid receipt should settle the request and release any unused reservation.
6. Inspect Credits to see the corresponding ledger entries.

The application retains session metadata but does not store conversation text in PostgreSQL. Reloading the page does not retrieve a past answer. Save any response you need in your own application.

## Keep a complete route available

Once a complete route is qualified and ready, open **Meus nós → Disponibilidade da rota completa** (My nodes → Complete-route availability). A sponsor chooses a duration, total rate and purpose, then reserves the full budget. Every provider must review and accept the offer before the clock starts.

For example, 30 seconds at 1,000 microcredits per second reserves 0.030 LAB_TU for the whole route. Its accepted shares divide that total among the components. Ready time can earn payment even when nobody submits a question. Registering a node alone earns nothing, and an empty sponsor balance cannot fund the offer.

If a stage goes offline, it stops earning eligible readiness time. The other components retain their accepted window while ready; the sponsor receives the unused remainder at the fixed end. Normal inference compensation is additional and separately accounted. The [full explanation](implementation/ROUTE_AVAILABILITY.md) covers shares, withdrawal, refunds and the limits of this private mechanism.

## Understand common outcomes

For cooperative funds, **Cooperação → Renovação automática com limites** adds optional continuation. The manager sets maximum windows, separate gross working/reserve limits and expiry. Each provider signs in separately and authorizes its own participation. Revoking that permission stops future windows while accepted windows retain their deadlines. Contributions alone do not enable automatic spending. The [step-by-step renewal guide](implementation/BOUNDED_RENEWALS.md) explains the controls and a real 32B example.

New v0.8 plans also expose **Expansão conforme a demanda** (Demand-backed expansion). This shows why extra capacity can or cannot start. An administrator records actual private account classifications and operational support; the manager and each provider separately choose the expansion purpose. Working funds must remain above the essential floor, the reserve must be complete, and funded demand must exceed covered free slots. One computer with one account does not establish independent demand by running more agents. Follow the [full expansion walkthrough](implementation/DEMAND_BACKED_EXPANSION.md); the original essential-only plans keep their accepted terms.

| Outcome | Meaning | Next step |
|---|---|---|
| Model unavailable | No qualified, eligible node currently serves it | Check qualification, loaded model, heartbeat, and node state |
| Insufficient balance | The maximum reservation exceeds free `LAB_TU` | Request an explicit lab grant or reduce the permitted output/profile where applicable |
| Queued | A compatible route is busy | Inspect the session; the private queue expires after 120 seconds |
| Duplicate request / HTTP 409 | That account already used the idempotency key | Inspect the returned session ID; do not assume a second answer is retained |
| Receipt pending | Streaming ended before the control service accepted settlement | Check the original session after control recovery |
| Interrupted or cancelled | The attempt ended without a completed charge | Inspect the reason and refund before making a new attempt |

Use the [private node-link guide](implementation/PRIVATE_LINK.md) for the new authenticated QUIC transport. It keeps application listeners on loopback and pins each peer. Independent hosts, relays/CGNAT, public admission, trust and operational performance still need qualification; changing application bind addresses is not a deployment procedure.

## Stop, back up, and continue development

```bash
pnpm lab:status
pnpm lab:backup
pnpm lab:stop
```

Stop the managed services before rebuilding application code. To reuse an existing build, run `pnpm lab:start --no-build`. Keep `.runtime/` private: it contains credentials, keys, and backups.

For detailed operations, recovery, test commands, and known limitations, continue with the [private application manual](implementation/README.md).
