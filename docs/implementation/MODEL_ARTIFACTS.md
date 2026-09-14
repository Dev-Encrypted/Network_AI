# Verified artifacts and the trusted CPU cluster adapter

The application catalog contains operator claims about model revisions. The acquisition tool adds a separate, executable check of local artifact bytes before an operator starts a model. A verified file does not by itself qualify its runtime, memory, output quality or distributed route.

## Acquire a pinned configuration

The supplied candidate uses the official [Qwen3-32B GGUF repository](https://huggingface.co/Qwen/Qwen3-32B-GGUF), whose model card reports 32.8 billion parameters and Apache-2.0 licensing. The manifest fixes revision `938a7432affaec9157f883a87164e2646ae17555`, a 19,762,149,024-byte Q4_K_M artifact and its upstream SHA-256. This is a model above the project's 27B focus boundary.

```bash
pnpm model:acquire adapters/manifests/qwen3-32b-q4-k-m.json .runtime/models/qwen3-32b
pnpm model:acquire adapters/manifests/qwen3-32b-q4-k-m.json .runtime/models/qwen3-32b --verify
```

The first command downloads the weights and therefore requires the documented disk space and network transfer. The second only verifies existing files. The tool checks sizes and SHA-256, writes incomplete transfers to `.part`, validates HTTP resume ranges, checks free disk space and renames the file only after successful verification. An existing mismatched artifact is not overwritten. A `.lock` prevents cooperating download processes from writing the same artifact simultaneously; after an abrupt process kill, inspect the stopped transfer before manually removing that exact stale lock.

Current acquisition is restricted to revision-pinned HTTPS sources at Hugging Face and an allowlist of non-executable artifact formats. Python code and pickle checkpoints are rejected. Paths cannot escape the destination, collide by case, use Windows device names or traverse existing junctions. Operators still review licenses, publisher identity and manifests; an attacker-controlled hash is not trustworthy provenance. This is not automatic deployment of arbitrary community submissions or a peer-to-peer weight distribution protocol.

## Engine and resource isolation

The local experiment uses the CPU build of llama.cpp `b10964`, upstream commit `b29c606e2`, version string `0.4.1-dev`. The [upstream Windows CPU archive](https://github.com/ggml-org/llama.cpp/releases/tag/b10964) was checked against its GitHub asset SHA-256:

```text
917f39c076402c421224824607397af20f53625a60defc20e8dd22446bf4c5d7
```

The release ZIP is 18,427,629 bytes. Engine binaries and model weights remain outside the source repository. Existing installed model sessions are not stopped to reclaim VRAM. A CPU-only build allows this experiment to use host RAM while preserving the existing GPU model. RAM, bandwidth and CPU time still constrain performance.

`scripts/cluster.mjs` supervises either a local CPU server (`--workers 0`) or one trusted participant's two-process CPU RPC cluster (`--workers 2`). The latter requests layer partitioning at a 1:1 split. It fixes one inference slot, a 2,048-token context and loopback listeners. It verifies the complete model artifact before launch, records the engine executable hash and stops the whole process group when a managed component exits. Logs and process identifiers are private. A supervisor launched with piped stdin accepts `stop` for shutdown on Windows.

```bash
pnpm model:cluster --engine-dir .runtime/engines/llama-b10964-cpu/bin --model-dir .runtime/models/qwen3-32b --manifest adapters/manifests/qwen3-32b-q4-k-m.json --directory .runtime/private-lab/my-cluster --workers 2 --port 43220 --rpc-port 43820 --threads 8
```

Use independently reviewed compatible engine binaries in `--engine-dir`; the launcher does not download or trust an arbitrary executable named by a model manifest. The backend model alias is `network-ai-qualified-model`. A node can use `backend_kind: openai` and `backend_url: http://127.0.0.1:43220` after the exact model is qualified. Both CPU workers on one host belong to the same physical resource domain. They are not two independent contributors and do not double its capacity.

The supervisor creates a random engine API key in its protected directory and passes the key-file path to llama.cpp. CORS is restricted and built-in agent tools are disabled. Supply that file to the node profile generator with `--backend-key-file PATH`; the key stays in the operator profile and is sent only to its configured local backend. It is not included in node invitations, capabilities or control records. CPU repacking is disabled in the current comparison profile to keep the local and RPC numerical paths closer; the earlier default-repacking result is preserved separately.

**Upstream classifies ggml RPC as an insecure proof of concept.** This adapter hardcodes RPC listeners and destinations to loopback and supports only the trusted local experiment. Do not expose the RPC server through public ports, relays or the private HTTP bridge. See the [upstream RPC boundary](https://github.com/ggml-org/llama.cpp/blob/b10964/tools/rpc/README.md). An open, adversarial multi-participant tensor protocol requires further implementation and validation.

## Compare actual execution

```bash
node scripts/cluster-acceptance.mjs --engine-dir .runtime/engines/llama-b10964-cpu/bin --model-dir .runtime/models/qwen3-32b --manifest adapters/manifests/qwen3-32b-q4-k-m.json
```

The campaign runs the same fixed prompts and greedy sampling locally and with two RPC workers. It requires both workers to receive model buffers, records generated token IDs and timing, and reports sequence equality without concealing differences. Eight generated tokens on three prompts are a small compatibility check, not a quality benchmark, logits-equivalence proof, throughput qualification, long-context study or WAN result. Larger GPUs and independent hosts still need their own measured profiles.

## September 14 observed results

The first fully instrumented comparison, with default CPU repacking, matched **2/3** generated sequences. Its local engine allocated a 14,400 MiB CPU_REPACK buffer; the RPC path used different buffers. We preserved that [divergent result](evidence/qwen3-32b-default-repack.json), then selected a new profile that disables repacking in both paths. The [new comparison](evidence/qwen3-32b-no-repack.json) matched **3/3** sequences. That change is consistent with a kernel/representation difference; this campaign does not establish a formal causal proof or arbitrary-input numerical equivalence.

With repacking disabled, the local engine reported 18,840.96 MiB of model buffers and 512 MiB of KV buffers. The split configuration reported 9,169.13 and 9,254.52 MiB of model buffers on the two RPC endpoints, plus 417.30 MiB locally. Its KV buffers were 264 and 248 MiB. These are engine-reported allocations, not total operating-system RAM or independent GPU measurements. The upstream log uses the word `GPU` for layer offload even though these two RPC devices were CPU backends.

Local generation measured roughly 2.58–2.69 tokens/second and the RPC path roughly 2.33–2.46 tokens/second on the three short fixtures. They were run on one shared i9-14900K host; this sample does not establish a stable service envelope or comparative price advantage.

The final cluster also [completed through the actual Network AI API and private QUIC bridge](evidence/qwen3-32b-network-api.json): 18 input tokens, nine output tokens, 5,269 ms, `COMPLETED` and `SETTLED`. The campaign paid observed readiness and refunded the unused contract budget. This is integrated trusted-cluster evidence, not independent-stage reservations or multi-operator settlement.

## Keep the private 32B model available

After the explicit download and compatible engine setup, the optional installer enrolls a dedicated CPU node and adds the model to the private catalog:

```bash
pnpm lab:install-cpu-cluster --engine-dir .runtime/engines/llama-b10964-cpu/bin --model-dir .runtime/models/qwen3-32b --manifest adapters/manifests/qwen3-32b-q4-k-m.json
```

The private model ID is `qwen3-32b-cpu-private`. The installer requires the running private control service and its existing administrator configuration. It does not buy hardware or download weights. Once installed, `lab:start` also starts the CPU supervisor and node; `lab:stop` requests shutdown of the entire managed CPU process group. The original GPU node remains separate. Budget host RAM and CPU use before enabling this optional experiment; the installer creates no additional physical GPU capacity.
