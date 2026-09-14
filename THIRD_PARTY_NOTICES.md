# Componentes e material de terceiros

O NETWORK AI não é autor das engines, bibliotecas ou modelos abaixo. A licença do código original não substitui seus termos. Pesos e ambientes instalados não são distribuídos neste repositório ou nos pacotes F0.

| Referência | Uso | Procedência |
|---|---|---|
| libp2p | Transporte QUIC | [rust-libp2p](https://github.com/libp2p/rust-libp2p), versões em `Cargo.lock` |
| Iroh | Transporte QUIC | [iroh](https://github.com/n0-computer/iroh), versões em `Cargo.lock` |
| Petals e Hivemind | Blocos CPU privados | [Petals](https://github.com/bigscience-workshop/petals), [Hivemind](https://github.com/learning-at-home/hivemind), revisões no lock Petals |
| vLLM, PyTorch, Transformers | Serving, operações numéricas e tokenizer | [vLLM](https://github.com/vllm-project/vllm), [PyTorch](https://github.com/pytorch/pytorch), [Transformers](https://github.com/huggingface/transformers) |
| Qwen3-8B | Preparação de artefatos e cargas | [Qwen/Qwen3-8B](https://huggingface.co/Qwen/Qwen3-8B), revisão nos relatórios |
| BLOOM-560m | Referência Petals executada | [bigscience/bloom-560m](https://huggingface.co/bigscience/bloom-560m), licença BLOOM RAIL 1.0 na origem |
| Kimi K3 e outros modelos pesquisados | Configurações, índices e inspeção parcial | [MoonshotAI](https://github.com/MoonshotAI/Kimi-K3), snapshots fixados com termos próprios |
| LM Studio e modelo comunitário existente | Endpoint da primeira medição | Identificador e fingerprints nos relatórios; não distribuídos |
| NestJS, Fastify, Next.js e React | Controle e interface do produto privado | Repositórios e licenças dos pacotes fixados em `pnpm-lock.yaml` |
| PostgreSQL | Persistência e journal | Imagem oficial fixada por digest no Compose; licença PostgreSQL |
| Axum, Tokio, Reqwest e ed25519-dalek | Gateway, agente e assinaturas | Versões em `Cargo.lock`; licenças próprias dos crates |
| IBM Plex Sans / Mono | Fontes locais da interface | IBM, SIL Open Font License; pacotes Fontsource em `pnpm-lock.yaml` |
| Lucide | Ícones da interface | Licença ISC; pacote fixado em `pnpm-lock.yaml` |
| Playwright e axe-core | Verificação de navegador e regras de acessibilidade | Ferramentas de desenvolvimento, com seus próprios avisos e licenças |

As [evidências de planejamento](docs/planning/evidence/README.md) contêm metadados, índices e configurações de APIs públicas. Os cabeçalhos safetensors em `docs/execution/evidence/kimi-k3/` são referência upstream. Esses conteúdos não são apresentados como criação de Dev-Encrypted nem recebem uma licença substituta.

Locks registram versões e revisões, mas não são auditoria completa de direitos de redistribuição. Antes de empacotar uma engine, pesos ou binários derivados, verifique os termos da revisão distribuída e seus avisos exigidos.

Consulte o [escopo das licenças próprias](docs/LICENSING.md), o [NOTICE](NOTICE) e as [fontes de pesquisa](docs/planning/13_REFERENCES_AND_EVIDENCE.md).
