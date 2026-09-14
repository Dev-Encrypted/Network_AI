# 08. Security and trust boundaries

## Protect concrete assets

The network must protect consumer content, identity keys, balances, accepted capacity commitments, model provenance, and service availability. Contributors also need protection from unauthorized workloads, excessive resource use, and unsafe software distribution.

The private preview assumes a trusted local operator and coordinator. A public node network introduces adversarial participants and independent administration. Security evidence must identify which environment it covers.

## Threats and required controls

| Threat | Required response | Remaining boundary |
|---|---|---|
| Replayed or stale authorization | Signed bounded capabilities, nonces, expiry and epochs | A signature does not prove correct model execution |
| Duplicate physical-resource claims | Shared-domain limits plus independent qualification | Private domain labels are administrator assertions |
| False token usage or wrong model | Pinned profiles, measurement and work-verification procedure | Current usage is engine-reported |
| Double spending or duplicate settlement | Transactional holds, stable operation IDs, balanced immutable journals | A database owner remains trusted in the private profile |
| Malicious model package | Pinned hashes, provenance, allowed formats, no automatic repository code execution | A hash authenticates bytes only relative to a trusted reference |
| Abusive requests or flooding | Body limits, quotas, bounded queue, deadlines and backpressure | Fairness must include identities and funded demand |
| Prompt exposure | Explicit trust profile and retention policy | Encryption in transit does not hide content from its executor |
| Malicious update or compromised authority | Signed release provenance, staged qualification and key recovery | Public update distribution remains future work |

## Content path and privacy

The current browser proxy, gateway, node, and engine process content in memory. NestJS and PostgreSQL receive metadata, hashes, usage, and accounting values rather than conversation bodies. The browser does not execute model output as HTML. Engine logging remains the operator's responsibility.

Do not claim confidentiality against the owner of a GPU without a demonstrated mechanism and a defined threat model. A private trust group and a public volunteer pool require different disclosures and admission rules.

## Verification is a budgeted activity

Reference probes, redundant execution, audits, and challenges consume time and resources. An open network must measure false acceptance, false rejection, collusion, and the cost of verification relative to useful service. Matching a few reference answers is not proof that every future answer will be correct.

For a split model above 27B, intermediate state and stage substitution create additional integrity and privacy boundaries. Numerical parity, stage identity, and complete-route recovery need explicit tests; artifact integrity alone does not cover them.

## Current protections and limits

The private implementation includes persistent node keys, one-time enrollment, timestamp/nonce checks, epoch fencing, account authorization, loopback-only endpoints, bounded requests, signed receipts, and constrained database roles. It does not include public physical attestation, person-level anti-Sybil, confidential GPU execution, or independent-operator consensus.

The F0 transport harness has separate ephemeral identities and replay state. Do not apply its limitations or successes indiscriminately to the product protocol. [Private API](../implementation/API.md), [implementation status](../implementation/STATUS.md), [F0 evidence](../execution/README.md).

Report vulnerabilities through [SECURITY.md](../../SECURITY.md). Public opening still requires the trust and continuity gate in [FC05](../execution/GATES.md).
