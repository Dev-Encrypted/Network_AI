# Functional qualification of an installed model route

A model can finish a request, provide valid receipts and settle its charge while giving the wrong answer. NETWORK AI now measures those outcomes separately. The source tooling in version 0.13.1 adds a fixed functional corpus, streamed timing observations and a receipt review command for existing private routes. It does not automatically approve a model for public use.

The first campaign uses the existing official Qwen3-32B Q4_K_M CPU and mixed CPU/CUDA routes on one Windows computer. Both routes use the same pinned weights. No additional model download, grant, participant account or physical capacity is created. The original [artifact qualification](MODEL_ARTIFACTS.md) and [device evidence](HETEROGENEOUS_CONTRIBUTORS.md) remain separate measurements.

## What the tool checks

The [original synthetic corpus](../../adapters/qualification/text-functional-v1.json) contains eight cases: integer arithmetic, structured extraction, a correction in a conversation, Portuguese sentiment classification, a longer JSON array, and retrieval from the beginning, middle and end of a synthetic record list. It is intentionally small and public. It is not a hidden holdout, a comprehensive reasoning benchmark, a safety assessment or a ranking against other models.

Each case specifies its input, output allowance and expected answer before inference. The runner records a checksummed plan before sending its first request. Text assessment trims only surrounding whitespace and normalizes CRLF; JSON assessment requires the exact parsed structure and rejects extra fields, explanations and Markdown fences. A response that reaches its output limit fails the completion criterion even if part of its content looks useful.

A successful sample requires all of the following:

1. The answer satisfies the original case and finishes with `stop`.
2. The stream contains visible content, complete usage and its final `DONE` marker.
3. The admitted session uses the intended model and complete route.
4. The root inference receipt and each stage's completed command receipt are present.
5. Usage agrees with settlement, participant payments conserve the existing private 80/20 allocation, and no physical-domain claim remains.

The root's inference receipt is stored in `receipts`; stage command receipts are stored in `stage_receipts`. Those are different protocols. Counting only rows attached to stage participants omits the root and incorrectly fails otherwise complete requests. The first evaluator made that mistake; an intermediate review also expected the node identity inside the signed payload, although it belongs to the database row. The corrected evaluator and append-only review preserve both observations and the original model-answer failures. The answer key, token allowances and denominator remain unchanged.

The first complete campaign accepted **10/16 samples**, or five of eight cases on each route. All 16 requests completed and settled with three valid participant receipts and zero retained claims. Both routes returned identical bytes, including the wrong arithmetic answer, a conversation response cut off at its limit, and Markdown fences around an otherwise complete array. Maximum observed sizes were 526 prompt tokens and 96 output tokens. The longest client request took 48,671 ms. These numbers describe this corpus and this installation only.

## Run against existing routes

Prepare the private application and the qualified route first. Use the model IDs registered in your own installation. The following commands name this repository's measured demonstration:

```powershell
pnpm model:qualify --model qwen3-32b-route-private --model qwen3-32b-mixed-private --dry-run
pnpm model:qualify --model qwen3-32b-route-private --model qwen3-32b-mixed-private
```

The preflight logs in with the existing local operator configuration, checks that the lab has no active sessions or readiness windows, requires one available complete route per selected model and verifies that all participants belong to that operator. Every case must fit the registered input, output and context bounds. `--dry-run` writes the plan and checks accounting without generating a response or creating a temporary inference key.

A live run creates one temporary API key, sends one request at a time through the actual gateway and admission path, and alternates the starting model for successive cases. It does not call the model backend directly or retry failed inference. Each admitted request spends existing `LAB_TU` under its normal quote. The runner records failures, requests cancellation after a transport failure, waits for terminal accounting and revokes its key when finished. A failure to confirm cleanup is itself a failed run.

The original runner sent `Content-Type: application/json` on a DELETE with no body. The control server rejected it with HTTP 400, leaving the temporary key active. The exact key was subsequently revoked with the correct request (HTTP 200) and checked in the database. The runner and four affected older campaign helpers now omit that header when no body exists and retain cleanup failures in their result. A separate two-request smoke verified the corrected evaluator and automatic key revocation. It does not replace or enlarge the original 16-sample score. This patch does not silently revoke other historical keys.

Reports, original responses and the plan stay in `.runtime/private-lab/model-qualification/<run>/`. This directory is private and ignored by Git. A failed case produces a nonzero command exit after the campaign. Inspect the report before interpreting that exit as an infrastructure failure: semantic failures are also expected evidence.

## Context and timing boundaries

The measured installations advertise a 2,048-token engine context, a 1,400-byte input limit and at most 128 output tokens. Admission conservatively counts input bytes plus a per-message allowance against context capacity. This is not exact tokenizer certification. The corpus stays inside that existing envelope and records actual engine-reported prompt/output tokens; it does not qualify the model's full context capacity or change an immutable offer to fit a test.

`first_content_ms` measures elapsed client time from request submission to the first visible content. `completed_ms` includes the gateway, possible waiting, inference and final route receipts. The report retains any prompt-cache count supplied by the engine. These are observations from a small sequential campaign on a shared computer, not isolated cold-load benchmarks, pure decoder throughput, a latency guarantee or a statistically established CPU/GPU speedup. The engine supports separate context and generation parameters; its terminology is documented in the [pinned llama.cpp server manual](https://github.com/ggml-org/llama.cpp/blob/b10964/tools/server/README.md).

Equal response hashes mean the two sampled responses have identical bytes. They do not prove equal logits, arbitrary-input numerical equivalence, task correctness or suitability for other GPU classes. An incorrect answer can match on both routes.

## Review preserved evidence without regenerating answers

```powershell
pnpm model:review --directory .runtime/private-lab/model-qualification/YOUR_COMPLETED_RUN
```

Review requires a completed campaign with all planned samples and original response files. It verifies the immutable plan hash, input request digest against the admitted session, response hashes, unchanged semantic scores, actual usage, route binding and current terminal accounting. It reads the root and stage receipts separately and writes a new uniquely named `review-*.json`; it never overwrites `report.json`, changes the answer key or sends new inference requests.

The review output deliberately selects fields that omit session/account/node identifiers, raw content and private configuration. Before publishing it, inspect its scope and attach the physical topology evidence. The runner itself does not independently attest host counts or operator independence. Read-only access to the local database is still privileged local access, not a public verification protocol.

The [selected campaign report](evidence/functional-32b-v0.13.1.json) records every scheduled sample, the original evaluator correction and the functional result. [Versioned validation](validation-v0.13.1.json) records the software checks. Model quality, broader hardware, real links, malicious providers and sustainable pricing remain separate [launch requirements](../execution/GATES.md).
