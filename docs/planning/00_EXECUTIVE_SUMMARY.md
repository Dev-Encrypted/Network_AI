# 00. Executive summary

NETWORK AI aims to let people contribute compatible computing resources and use qualified AI models through shared usage credits. It prioritizes **models above 27B parameters**, where memory and service requirements often exceed one participant's equipment. Smaller models remain useful for consumers, contributors, and experiments.

## Recommended architecture

Build a network coordination layer around existing inference engines. Keep identities, catalog, admission, and accounting separate from numerical execution. Support a complete model on one node first, then qualified nearby GPU clusters and model stages distributed across participants. Do not assume that a global sum of VRAM forms one usable machine.

A route must include every required part of the exact model configuration. Its capacity depends on usable memory, context, concurrency, speed, communication, and failure behavior. Parameter count helps estimate weights; it does not uniquely determine the number of users or devices. [Sizing guide](../MODEL_SCALING.md).

## Participation and economics

Participants propose models and offers. The network accepts useful, bounded capacity contracts and pays for verified readiness under the candidate cooperative policy. Consumers reserve credits before work and settle accepted usage afterward. Larger or more costly profiles have distinct tariffs.

Cooperation should not require cash buyers, but it still needs funded demand and a source for external operating costs. Idle compatible capacity can support temporary larger allowances. It must not create unlimited permanent credit liabilities. The optional API market keeps payments and provider liabilities separate from TU.

## Current delivery

The v0.2 private preview integrates a Next.js interface, NestJS/Fastify control service, PostgreSQL, and Rust gateway/node. It runs real local inference with signed identities, account isolation, laboratory holds and settlement, cancellation, outbox recovery, and backup restoration.

Its `LAB_TU` is a laboratory unit with explicit grants and a completed-work payment rule. Public cooperative issuance, readiness contracts, distributed model execution, federated consensus, and commercial settlement are not implemented in that profile. The current UI is Brazilian Portuguese; maintained GitHub documentation is English.

## Evidence and decisions

The F0 bench demonstrated a local community 27B model, a small CPU model split between processes on one host, and authenticated loopback transport controls. No integrated model above 27B has been qualified across physical hosts.

The economic study ran 5,600 fictional 90-day cases. Accounting invariants passed; no case passed all implemented economic gates. The baseline v6 mature-period completion rate was 15.75%, against a 95% target. The tested economic settings must not become a production configuration.

Proceed with a pinned larger-model route, measured multi-host capacity, revised economic calibration, complete lifecycle predicates, and independent operator recovery. Public launch depends on [FC01–FC06](../execution/GATES.md), not on the existence of a repository or passing local tests.

Original research detail is preserved in the [source archives](../publication/README.md). This English edition incorporates the later findings without rewriting those records.
