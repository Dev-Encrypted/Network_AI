# Public documentation language and historical sources

English is the primary language of maintained public repository documentation, research explanations, contribution instructions, GitHub descriptions, and release notes. Write for readers who may be new to AI infrastructure: define specialized terms, explain assumptions, and link implementation claims to evidence.

## The English edition

The September 14, 2026 edition replaces the Portuguese reader-facing Markdown with English explanations. It adds a beginner guide, glossary, model-scaling calculations, and explicit focus on models above 27B. Technical chapters retain their original path names so existing links remain usable.

This is an editorial revision that includes later implementation and experimental findings, rather than a word-for-word certified translation. Original detailed drafts remain accessible from the first public commit and immutable release archives. [Publication and provenance](publication/README.md) identifies them and the source hashes.

## Material preserved in its original form

Raw experimental logs, synthetic evaluation prompts, machine-readable policy snapshots, source files bound to historical experiment hashes, upstream metadata, and historical visualization fragments retain their original bytes and language. Translating those records in place would change the evidence. Their maintained English indexes explain their meaning and limitations.

The original planning verifier targets the original archive. The current execution verifier checks original Markdown hashes inside that archive, verifies unchanged non-Markdown planning evidence, and treats current English chapters as a separate edition. It does not claim that English document bytes match the Portuguese sources.

Canonical license texts retain their official wording. The current private application's interface remains in Brazilian Portuguese; the [beginner guide](GETTING_STARTED.md) translates its navigation labels. Repository documentation language does not silently change runtime UI strings or historical test fixtures.

## Contribution convention

Use English for new maintained documentation, examples intended for readers, pull-request descriptions, and new release notes. Preserve exact protocol field names, identifiers, filenames, and quotations when they are needed to reproduce a result. Explain any intentional non-English evidence in the surrounding English text.
