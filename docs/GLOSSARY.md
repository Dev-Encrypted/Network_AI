# Glossary

| Term | Meaning in NETWORK AI |
|---|---|
| Parameter | A learned numerical value in a model. `B` means one billion parameters. |
| Weights | The stored parameter values needed to execute a model. |
| Inference | Running an already trained model to produce an answer. |
| GPU | A processor commonly used for the numerical work of inference. |
| VRAM | Memory attached to a GPU. It must hold assigned weights and execution state. |
| RAM / SSD | Host memory / persistent storage. Neither is automatically equivalent to GPU memory. |
| GB / GiB | One billion bytes / 1,073,741,824 bytes. Always check the unit in a capacity claim. |
| Quantization | Storing or computing some numerical values with lower precision to reduce resource use, with format and quality tradeoffs. |
| Context | The tokens available to the model in a request, subject to the profile's input/output limits. |
| Text token | A unit produced by a tokenizer; it may be a word, part of a word, or another symbol. |
| KV cache | Stored attention state reused during generation. It consumes memory beyond model weights. |
| Prefill / decode | Processing input tokens / generating subsequent output tokens. |
| TTFT | Time to first token. Reports must distinguish the first visible answer from hidden reasoning or protocol traffic. |
| Throughput | Work completed per unit of time, such as successful requests or generated tokens per second. |
| Participant / operator | The person or organization contributing resources and responsible for a node. |
| Node / agent | A software process that joins a deployment and executes assigned work through an engine. |
| Physical domain | A lab administrator's grouping of agents sharing a capacity limit, such as one GPU. |
| Manifest | A fixed description of a model artifact, limits, origin, and required configuration. |
| Qualification | Evidence and approval that a specific configuration can serve a defined workload. |
| Route | All resources required to finish a request for one compatible model profile. |
| Replica | Another complete executable copy of a model route. |
| Pipeline parallelism | Splitting groups of model layers across execution stages. |
| Tensor parallelism | Splitting numerical operations or tensors across devices that communicate during execution. |
| MoE | Mixture of experts: an architecture selecting some expert networks for each token. Total and active parameters differ. |
| LAN / WAN | A local network / a network connecting distant locations, including the Internet. |
| NAT / relay | Address translation / an intermediary forwarding traffic when peers cannot connect directly. |
| TU | Proposed cooperative usage-token accounting unit. It is separate from text-token counts. |
| LAB_TU | Private-preview laboratory credits. No cash redemption or guaranteed future capacity. |
| Quote / hold | An expiring price agreement / a reservation preventing double spending during execution. |
| Receipt / settlement | An execution report / the accounting transaction charging accepted usage and releasing the remainder. |
| Ledger / journal | The accounting system / a balanced transaction recorded in that system. |
| Idempotency | Repeating an operation's identifier does not create its effect a second time. It does not imply that an answer is stored. |
| Epoch / fencing | A node restart generation / rejection of attempts belonging to an obsolete generation. |
| Outbox | Durable local storage for receipts waiting to reach the control service. |
| Lease | An assignment valid only for a defined period, with explicit resources and payment terms. |
| Sybil attack | One operator presenting many identities to gain extra influence, credit, or priority. |
| Quorum | The agreement threshold required among a defined set of operators. |
| Holdout | Data or random seeds reserved from calibration for a later independent evaluation. |
| Gate / SLO | An advancement criterion / a defined service-level objective. Passing unit tests does not imply passing an operational gate. |

Start with the [beginner guide](GETTING_STARTED.md) or continue to [model scaling](MODEL_SCALING.md).
