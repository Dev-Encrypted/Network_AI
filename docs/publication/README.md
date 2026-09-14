# Publication, English edition, and archive provenance

Official repository: [Dev-Encrypted/Network_AI](https://github.com/Dev-Encrypted/Network_AI). Publishing the source and article does not activate a public inference service.

## Maintained English edition

The September 14, 2026 English edition includes an expanded [README](../../README.md), [article](../ARTICLE.md), [beginner guide](../GETTING_STARTED.md), [glossary](../GLOSSARY.md), [model-scaling guide](../MODEL_SCALING.md), [technical handbook](../planning/README.md), and translated implementation/execution guides.

It makes the recommended focus on **models above 27B parameters** explicit and explains how usable memory, quantization, context, device count and connectivity affect contribution requirements. These explanations do not claim that larger distributed inference is already implemented.

The technical chapters are an editorial revision incorporating later results, not a word-for-word historical translation. Original detailed Portuguese specifications remain accessible without changing their bytes:

- [Original planning tree at the first public commit](https://github.com/Dev-Encrypted/Network_AI/tree/1010df7290ee895104f38123724e1a737e8e880d/docs/planning).
- [Original full article at that commit](https://github.com/Dev-Encrypted/Network_AI/blob/1010df7290ee895104f38123724e1a737e8e880d/docs/ARTICLE.md).
- [Immutable F0 research release and planning ZIPs](https://github.com/Dev-Encrypted/Network_AI/releases/tag/v0.1.0-f0).
- [Source manifest for all 26 original planning Markdown documents](planning-source-manifest.json), including original sizes, SHA-256 hashes, archive identity and source commit.

Current English chapters preserve the same paths for navigation. The execution verifier checks the original prose against its archive manifest and keeps non-Markdown planning evidence byte-for-byte unchanged. It does not pretend that the English text has the Portuguese source's hash.

## Releases

| Release | Scope | Notes |
|---|---|---|
| [v0.1.0-f0](https://github.com/Dev-Encrypted/Network_AI/releases/tag/v0.1.0-f0) | Original research, bench and preserved artifacts | [English release description](releases/v0.1.0-f0.md) |
| [v0.2.0-private-preview](https://github.com/Dev-Encrypted/Network_AI/releases/tag/v0.2.0-private-preview) | Executable private inference application | [English release description](releases/v0.2.0-private-preview.md) |
| [v0.3.0-private-network-preview](https://github.com/Dev-Encrypted/Network_AI/releases/tag/v0.3.0-private-network-preview) | Authenticated private links, funded availability and real 32B CPU cluster | [English release description](releases/v0.3.0-private-network-preview.md) |
| [v0.4.0-private-route-preview](https://github.com/Dev-Encrypted/Network_AI/releases/tag/v0.4.0-private-route-preview) | Complete route consent, stage claims, guarded computation and participant settlement | [English release description](releases/v0.4.0-private-route-preview.md) |

Historical tags stay fixed. Their source archives retain the documentation language at the tagged commit. English release descriptions link readers to the maintained documentation on `main` and identify the original release scope.

## Complete F0 evidence package

| Field | Value |
|---|---|
| Filename | `NETWORK_AI_EXECUCAO_F0_2026-09-14_v1.zip` |
| Size | 86,326,026 bytes |
| SHA-256 | `5d6afd3b991b9938b9f8840266f2fef7fb5c10324f11265b6f8fc7872a55eca1` |
| Entries | 202, including a manifest covering 201 files |

This immutable package includes six historical planning ZIPs and two `runs.jsonl.gz` files containing the 5,600 economic cases. It predates the public repository's later organization and private product. Do not extract it over a current checkout.

The source distribution excludes weights, installed environments, build caches and credentials. Historical reports include original lab paths; those paths are evidence, not a required setup for other users.

## Selective evidence restoration

After installing the local Python package as described in [reproduction](../execution/REPRODUCE.md):

```powershell
.venv\Scripts\python benchmarks/scripts/restore_evidence.py --download
.venv\Scripts\python benchmarks/scripts/verify_execution.py --check
```

Use `--archive path-to-package.zip` instead of `--download` for an existing package. On Linux use `.venv/bin/python`.

The restorer validates size/hash, accepts only eight known historical paths, and preserves files already matching their expected hashes. It refuses a conflicting existing file. It does not replace current README, code, licenses or English documents.

`verify_repository.py` checks the source checkout without release assets. `verify_execution.py --check` requires the restored evidence and validates consistency without rewriting the historical report. Neither approves public launch.

## Attribution and rights

Credit **Dev-Encrypted**. Original code is [Apache 2.0](../../LICENSE); original prose is [CC BY 4.0](../../LICENSES/CC-BY-4.0.txt). [License scope](../LICENSING.md) explains original archived materials and third-party rights. See [language policy](../LANGUAGE.md) for intentional preservation of raw evidence in its original form.
