# Security policy

NETWORK AI currently provides a private inference application and research benches. Their validation scope is local or private; no complete public-network security qualification has been performed. The loopback deployment is not a public production configuration.

## Report a vulnerability

Use **Security → Report a vulnerability** in the [official repository](https://github.com/Dev-Encrypted/Network_AI/security) when that option is available. Otherwise, open an issue requesting a private reporting channel without posting credentials, personal data or sensitive exploitation details.

Include version/commit, component, environment, impact and minimal reproduction. Test only systems you are authorized to assess. There is no contractual response SLA or bounty program at this stage.

## Known boundaries

- Node or transport signatures authenticate messages, not unique people, physical GPUs, honest token counts or correct inference.
- The private product persists nonces and uses node epochs. The separate F0 transport bench uses ephemeral replay state; its results do not prove persistence through restart.
- Application-level libp2p cancellation is not implemented in the F0 harness.
- Disconnecting an HTTP request does not independently prove the engine reclaimed internal GPU resources.
- The Petals reference has upstream integration limits recorded in [F0 results](docs/execution/README.md).
- Encryption in transit does not hide content from the operator executing it.
- The PostgreSQL owner and private administrator remain trusted; runtime-role protections are not distributed consensus.
- Public anti-Sybil, work verification, independent operators and larger-model route recovery require separate qualification.

See [private trust boundaries](docs/implementation/ACCOUNTING.md), [security design](docs/planning/08_SECURITY_AND_TRUST.md), and [launch gates](docs/execution/GATES.md). Reviewing publication files or translating documentation is not a product security audit.
