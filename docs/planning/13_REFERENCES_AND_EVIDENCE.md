# Referências e registro de evidências

## Método e alcance

Pesquisa realizada com corte em **13/09/2026**, a partir do briefing fornecido e da orientação adicional de contemplar GPUs heterogêneas e diferentes modelos. Foram consultados repositórios, código, model cards/configs/índices, documentação operacional e artigos dos autores. O recorte inclui os onze projetos solicitados, cinco engines solicitadas e iniciativas adjacentes diretamente úteis. Não é inventário de todos os projetos existentes.

Fontes primárias têm preferência. Documentação de fornecedor comprova o que ele declara/documenta; benchmark publicado é evidência sob suas condições, sem reprodução independente neste pacote. Página de produto não prova infraestrutura ativa, correção, rentabilidade ou privacidade. As decisões NETWORK AI são propostas próprias, não recomendações atribuídas aos autores dessas fontes.

Quando a data original não estava explícita, registrar acesso em vez de inventá-la. `pushed_at` não prova manutenção de release; HEAD observado não é versão estável qualificada. Links `main`/`stable` são mutáveis; os pins locais de modelos e quatro repositórios reduzem parte dessa ambiguidade.

## Referências decisivas

Todas acessadas em 13/09/2026; datas indicadas são da publicação/evento quando identificáveis.

| ID | Fonte primária | Evidência usada / limite |
|---|---|---|
| R01 | [Petals — repositório](https://github.com/bigscience-workshop/petals) | Modelos, blocos, dependências, guias; não K3 |
| R02 | [Petals — artigo NeurIPS 2023](https://arxiv.org/html/2312.08361v1) | Autores descrevem rede real e emulada, throughput, falhas; condições separadas no 02 |
| R03 | [Petals — conversor fixado](https://github.com/bigscience-workshop/petals/blob/22afba627a7eb4fcfe9418c49472c6a51334b8ac/src/petals/utils/convert_block.py) | Limite de teste do TP além de BLOOM e unidade de bloco |
| R04 | [Hivemind](https://github.com/learning-at-home/hivemind) | DHT/P2P e treinamento como biblioteca, sem ledger universal |
| R05 | [exo](https://github.com/exo-explore/exo) | MLX, descoberta, TP/PP e TB5; contradição do README sobre Linux GPU preservada |
| R06 | [AI Horde](https://github.com/Haidra-Org/AI-Horde) | Filas/workers/kudos; AGPL; pedidos completos, não divisão numérica automática |
| R07 | [Golem overview](https://docs.golem.network/docs/golem/overview), [reputação](https://docs.golem.network/docs/reputation), [SDK](https://github.com/golemfactory/golem-js) | Marketplace e métricas; GPU em evolução; SDK LGPL separado de Yagna |
| R08 | [Golem provider FAQ](https://github.com/golemfactory/yagna-docs/blob/master/provider-faq.md) | Referência histórica de conectividade sem port forwarding; não garantia de runtime atual |
| R09 | [Akash providers/leases](https://akash.network/docs/learn/core-concepts/providers-leases/), [provider setup](https://akash.network/docs/providers/setup-and-installation/provider-console/) | Operação Kubernetes, acordos e liquidação atual documentada; não copiar preços de exemplos inconsistentes |
| R10 | [io.net onboarding](https://io.net/docs/guides/workers/device-onboarding), [FAQ](https://io.net/docs/guides/faq) | PoW/admissão e estados; não prova perfeita de GPU exclusiva ou resultado |
| R11 | [io.net verificação confidencial](https://io.net/docs/guides/confidential-inference/verification-guide) | Nonce, assinante, imagem e atestação CPU/GPU; caminho distinto de contributors comuns |
| R12 | [Gensyn componentes](https://docs.gensyn.ai/core-components), [RL Swarm](https://docs.gensyn.ai/testnet/rl-swarm), [código](https://github.com/gensyn-ai/rl-swarm) | Pesquisa de treinamento/verificação; status de um testnet não define toda empresa |
| R13 | [Prime — Planetary Scale Inference, 28/04/2025](https://www.primeintellect.ai/blog/inference) | Pesquisa de pipeline; não serviço C equivalente já entregue |
| R14 | [PRIME-PIPELINE](https://github.com/PrimeIntellect-ai/prime-pipeline), [PRIME-IROH](https://github.com/PrimeIntellect-ai/prime-iroh) | Schedules e transporte reutilizáveis após licença/testes; licença de pipeline não resolvida |
| R15 | [Prime inference API](https://docs.primeintellect.ai/inference/overview) | API comercial de roteamento; não confundir com divisão de uma sessão do experimento |
| R16 | [Bittensor SDK antigo](https://github.com/RaoFoundation/bittensor), [subtensor](https://github.com/RaoFoundation/subtensor), [building blocks](https://docs.learnbittensor.org/learn/bittensor-building-blocks) | Migração/arquivamento do SDK, axon/dendrite/metagraph; validação por subnet |
| R17 | [Bittensor dTAO](https://docs.learnbittensor.org/dynamic-tao/dtao-guide) | Economia TAO/alpha distinta de créditos internos; não adotada |
| R18 | [Salad FAQ](https://docs.salad.com/container-engine/explanation/core-concepts/faqs), [SCE](https://salad.com/salad-container-engine/) | Running billing, realocação e operação de containers; não preservação automática de KV |
| R19 | [GPUStack](https://github.com/gpustack/gpustack) | Gestão privada de catálogo/engines; instalação privilegiada não copiada para contribuidores |
| R20 | [Distributed Llama](https://github.com/b4rtaz/distributed-llama) | C++/CPU/Vulkan, root/workers, topologia LAN e limites por heads |
| R21 | [KTransformers](https://github.com/kvcache-ai/ktransformers), [LICENSE](https://github.com/kvcache-ai/ktransformers/blob/main/LICENSE) | Offload CPU/GPU e Apache-2.0; referência de alternativa local |

## Modelos e engines

| ID | Fonte primária | Evidência usada / limite |
|---|---|---|
| R22 | [Kimi K3 — MoonshotAI](https://github.com/MoonshotAI/Kimi-K3), [pesos](https://huggingface.co/moonshotai/Kimi-K3) | Existência/nome, arquitetura, uso, reasoning e componentes |
| R23 | [K3 config fixado](https://huggingface.co/moonshotai/Kimi-K3/blob/f831ab66814297da540d832a5235f8e904f29d06/config.json), [índice fixado](https://huggingface.co/moonshotai/Kimi-K3/blob/f831ab66814297da540d832a5235f8e904f29d06/model.safetensors.index.json) | Camadas, quantização mista, estados e granularidade; sem execução dos pesos |
| R24 | [K3 License](https://github.com/MoonshotAI/Kimi-K3/blob/main/LICENSE) | Obrigações próprias de MaaS/atribuição; não chamar de MIT simples |
| R25 | [Kimi K2.5](https://github.com/MoonshotAI/Kimi-K2.5), [K2.6](https://huggingface.co/moonshotai/Kimi-K2.6), [K2.7-Code](https://huggingface.co/moonshotai/Kimi-K2.7-Code) | Modelos distintos, revisão/engine/parser a qualificar separadamente |
| R26 | [Kimi Linear](https://huggingface.co/moonshotai/Kimi-Linear-48B-A3B-Instruct) | Proxy KDA/MLA; não prova AttnRes/LatentMoE/visão K3 |
| R27 | [Qwen3-8B](https://huggingface.co/Qwen/Qwen3-8B), [Qwen3-32B](https://huggingface.co/Qwen/Qwen3-32B), [8B config fixado](https://huggingface.co/Qwen/Qwen3-8B/blob/b968826d9c46dd6066d109eabc6255188de91218/config.json) | Pesos/configs e cálculo KV; 20 GiB de budget ainda é hipótese |
| R28 | [Llama 3.1-70B](https://huggingface.co/meta-llama/Llama-3.1-70B-Instruct) | Metadados/licença/gate; não foram obtidos arquivos restritos |
| R29 | [vLLM K3 recipe](https://recipes.vllm.ai/moonshotai/Kimi-K3) | Cluster, engine/build, driver e paralelismo; não RTX24 qualificado |
| R30 | [vLLM K3 — 27/07/2026](https://vllm-project.github.io/2026/07/27/k3.html) | Benchmarks GB300/MI355X e otimizações; cargas baseline/especulação distintas |
| R31 | [SGLang K3 cookbook](https://docs.sglang.io/cookbook/autoregressive/Moonshotai/Kimi-K3) | Estados KDA/MLA e células de hardware; graus diferentes de validação e texto antigo remanescente |
| R32 | [vLLM segurança](https://docs.vllm.ai/en/latest/usage/security/) | Superfície administrativa/distributed runtime em rede confiável |
| R33 | [vLLM GPU](https://docs.vllm.ai/en/stable/getting_started/installation/gpu/), [quantização](https://docs.vllm.ai/en/stable/features/quantization/) | Backend/dtype dependem do hardware; não aprovação do NETWORK AI |
| R34 | [llama.cpp](https://github.com/ggml-org/llama.cpp), [RPC](https://github.com/ggml-org/llama.cpp/blob/master/tools/rpc/README.md) | Portabilidade e advertência explícita de RPC inseguro/experimental |
| R35 | [llama.cpp build](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md), [feature matrix](https://github.com/ggml-org/llama.cpp/wiki/Feature-matrix) | CUDA/ROCm/Metal/SYCL/Vulkan e diferenças por backend |
| R36 | [TensorRT-LLM](https://github.com/NVIDIA/TensorRT-LLM), [LICENSE](https://github.com/NVIDIA/TensorRT-LLM/blob/main/LICENSE) | Runtime NVIDIA, caminho PyTorch e Apache-2.0/avisos próprios |

## Infraestrutura, segurança e custos

| ID | Fonte primária | Uso |
|---|---|---|
| R37 | [libp2p QUIC](https://libp2p.io/docs/quic/), [hole punching](https://libp2p.io/docs/hole-punching/), [Iroh](https://github.com/n0-computer/iroh) | Comparação de conectividade, autenticação/relays; seleção depende da bancada |
| R38 | [Safetensors](https://huggingface.co/docs/safetensors/index), [TUF](https://theupdateframework.github.io/specification/latest/) | Formato sem pickle e atualização verificável; não ausência de bugs |
| R39 | [PostgreSQL isolamento](https://www.postgresql.org/docs/current/transaction-iso.html), [NestJS módulos](https://docs.nestjs.com/modules) | Transações/concorrência e monólito modular |
| R40 | [Redis licenças](https://redis.io/legal/licenses/), [Node releases](https://nodejs.org/en/about/previous-releases), [Tauri segurança](https://v2.tauri.app/security/) | Fixar versão/licença, runtime e menor privilégio do desktop |
| R41 | [CUDA WSL](https://docs.nvidia.com/cuda/wsl-user-guide/index.html), [NVIDIA nvtrust](https://docs.nvidia.com/nvtrust/index.html) | Limitações WSL e requisitos de confidencialidade por hardware |
| R42 | [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/), [prompt injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) | Referências para controles e testes, sem alegar certificação/conformidade completa |
| R43 | [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/) | Preço externo de armazenamento/operações, atualizado 07/08/2026; não cotação total de infraestrutura |
| R44 | [RFC 8785 — JCS](https://www.rfc-editor.org/rfc/rfc8785) | Canonicalização do payload de manifesto; IDs/assinaturas separados para evitar autorreferência |

## Economia de tokens e distribuição de acesso

Consultas adicionais em 13/09/2026 para a revisão 16/17. Percentuais e tarifas ilustrativas da nossa política são propostas próprias; não foram extraídos destas fontes como parâmetros aprovados para a rede.

| ID | Fonte primária | Uso e limite |
|---|---|---|
| R45 | [Ghodsi et al. — Dominant Resource Fairness, NSDI 2011](https://www.usenix.org/conference/nsdi11/dominant-resource-fairness-fair-allocation-multiple-resource-types), [artigo dos autores](https://www.usenix.org/events/nsdi11/tech/full_papers/Ghodsi.pdf) | Referência de distribuição de múltiplos recursos; não prova propriedades do nosso scheduler sob WAN, tarefas não preemptivas e identidades hostis |
| R46 | [Wang, Li e Liang — Dominant Resource Fairness in Cloud Computing Systems with Heterogeneous Servers, 2013](https://arxiv.org/abs/1308.0083) | DRFH como comparação para heterogeneidade; proposta própria exige teste e condições explícitas |
| R47 | [Anthropic — documentação de preços](https://platform.claude.com/docs/en/about-claude/pricing) | Referência de tarifação distinta para entrada, saída e cache; nenhum preço em dinheiro foi convertido em TU ou tratado como custo da nossa GPU |

## Rede aberta e mercado, revisão de escopo

Consultas em 13/09/2026. As fontes descrevem mecanismos existentes; não comprovam execução, segurança ou custo da proposta NETWORK AI.

| ID | Fonte primária | Uso e limite |
|---|---|---|
| R48 | [Bitcoin — artigo original](https://bitcoin.org/bitcoin.pdf) | Transações, gasto duplo e consenso; não prova de inferência ou de GPU útil |
| R49 | [Ethereum — mecanismos de consenso](https://ethereum.org/en/developers/docs/consensus-mechanisms/) | Separar consenso financeiro de medição de IA; não seleciona Ethereum ou ativo para o projeto |
| R50 | [EIP-712](https://eips.ethereum.org/EIPS/eip-712) | Assinatura de dados tipados e separação de domínio; não protege replay/gasto duplo sozinha |
| R51 | [libp2p — Kademlia DHT](https://docs.libp2p.io/concepts/discovery-routing/kaddht/) | Descoberta/roteamento P2P; não autoridade de saldo, identidade física ou qualidade |

## Cooperação sem compradores e consistência do registro

| ID | Fonte primária consultada | Uso e limite |
|---|---|---|
| R52 | [AI Horde — FAQ oficial](https://github.com/Haidra-Org/AI-Horde/blob/main/FAQ.md) | Precedente de créditos por contribuição e distinção de dinheiro; não copiar prioridade por saldo nem tratar sua arquitetura como prova da nossa descentralização |
| R53 | [CometBFT — documentação oficial](https://docs.cosmos.network/cometbft/latest/docs/README) | Referência de máquina de estados replicada com consenso existente; não prova execução física e não seleciona automaticamente governança da rede |

O [20](20_COOPERATIVE_ECONOMY_AND_ELASTIC_LIMITS.md) é proposta própria: percentuais, 4 validadores/quorum 3 para laboratório federado, regras de emissão e controlador são hipóteses declaradas, não resultados demonstrados pelas fontes. O [21](21_COOPERATIVE_SIMULATIONS.md) calcula 20 referências com entradas fictícias. DRF permanece referência comparativa de justiça com hipóteses específicas.

## Pins, snapshots e tratamento de inconsistências

O [diretório de evidências](evidence/README.md) guarda oito snapshots de modelos e sete pares config/index acessíveis. As revisões completas estão no [05](05_MODELS_AND_DISTRIBUTION.md). Não houve download completo dos pesos nem verificação de seus hashes por leitura dos bytes.

| Caso | Observação | Tratamento |
|---|---|---|
| Yagna | API/repositório indicado responderam 404 | Erro conservado; licença/manutenção atual não confirmadas, sem inferir abandono |
| PRIME-PIPELINE | Detector sem licença conclusiva; arquivo de licença não obtido | Não aprovar cópia de código até resolver; método/artigo seguem referência |
| TensorRT-LLM | API `NOASSERTION`, LICENSE direto Apache-2.0 com avisos | Usar texto de licença, não rótulo do detector |
| Bittensor | SDK antigo arquivado e aponta para monorepo | Não extrapolar arquivamento à rede inteira |
| exo Linux | README combina extras de instalação CUDA e ressalva de GPU Linux em desenvolvimento | Qualificação Linux GPU fica pendente |
| SGLang K3 | Texto pré-lançamento coexistindo com imagens/receitas recentes e células em verificação | Documentar suporte por célula; não considerar toda matriz validada |
| Llama gated | API pública respondeu; demais arquivos exigem acesso | Nenhum contorno do gate; baseline exige obtenção autorizada futura |

Fonte inacessível não virou fato inventado. Claims comerciais foram usados para classificar produto/objetivo, não como prova técnica de latência, correção ou segurança. A pesquisa não contratou serviços, não auditou toda a implementação de cada rede e não testou sua disponibilidade.

## Escala de confiança usada nas decisões

**Alta para o fato restrito observado:** existência de repositório/checkpoint, revisão, tamanho declarado, conteúdo de configuração/licença e comportamento visível de código consultado. Isso não aprova uma implantação.

**Moderada para resultados dos autores:** benchmark com workload e hardware descritos, ainda sem reprodução nossa. Separar rede real, emulada e comparação de cargas diferentes.

**Proposta a validar:** escolhas de stack NETWORK AI, budgets, tarifas, percentagens de oferta, SLOs, memória de buffers e modelos econômicos. Não foram inferidos como medições externas.

**Em aberto:** K3 por WAN residencial em 24 GiB, C entre backends, prova economicamente suficiente de disponibilidade, recuperação de estados gigantes, equivalência Windows/Linux e sustentabilidade de créditos no pico. Cada um tem experimento ou gate no [10](10_BENCHMARKS_AND_CAPACITY.md) e no [12](12_ROADMAP_AND_BACKLOG.md).

## Fontes da decisão de registro da revisão 4

| ID | Fonte primária consultada | Uso e limite |
|---|---|---|
| R54 | [Especificação de consenso CometBFT 0.38](https://raw.githubusercontent.com/cometbft/cometbft/v0.38.x/spec/consensus/consensus.md) | Hipóteses de voto/consenso e limites; não prova recibos de GPU |
| R55 | [Requisitos de aplicação ABCI 0.38](https://raw.githubusercontent.com/cometbft/cometbft/v0.38.x/spec/abci/abci%2B%2B_app_requirements.md) | Determinismo/replay da aplicação; estado consensual não usa relógio ou serviços locais |
| R56 | [Releases oficiais CometBFT](https://github.com/cometbft/cometbft/releases) | Referência de bancada v0.38.26 observada; não declarada a versão mais recente nem build já auditada |

Governança, percentuais, reserva e remuneração do [22](22_POLICY_CLOSURE_AND_CONTINUITY.md) são decisões próprias. O [23](23_INTEGRATED_ECONOMY_SIMULATIONS.md) contém execução de um modelo fictício com falhas registradas; não são resultados dessas fontes nem benchmark de infraestrutura.

## Fontes da revisão 5

| ID | Fonte primária | Uso e limite |
|---|---|---|
| R57 | [vLLM — benchmarking](https://raw.githubusercontent.com/vllm-project/vllm/main/docs/benchmarking/cli.md) | Método e métricas; não benchmark nosso |
| R58 | [x402 — batch settlement](https://docs.x402.org/schemes/batch-settlement) | Referência de integração com escrow e vouchers; não contrato implantado ou auditado por nós |
| R59 | [x402 — redes e ativos](https://docs.x402.org/core-concepts/network-and-token-support) | Identificação de ambiente/ativo de teste; suporte do protocolo não qualifica um facilitador |
| R60 | [x402 — FAQ](https://docs.x402.org/faq) | Diferença entre pagamento exact e devolução; não promessa de estorno automático |
| R61 | [x402 — especificação EVM batch-settlement](https://github.com/x402-foundation/x402/blob/main/specs/schemes/batch-settlement/scheme_batch_settlement_evm.md) | Canais, teto reclamável e retirada; não prova de qualidade de IA ou auditoria do bytecode |
| R62 | [Stripe — disputas Connect](https://docs.stripe.com/connect/disputes) | Alternativa de gateway financeiro e dependência do contrato escolhido; não meio universal da rede |

Fontes consultadas em 13/09/2026. A existência da documentação não prova implantação ou disponibilidade do serviço. A escolha e os requisitos adicionais da nossa bancada estão no [24](24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md).

## Revisão 6 — correção de liquidez e consolidação

As fontes primárias de benchmarking vLLM, batch-settlement e sua especificação EVM foram revisitadas em 13/09/2026. A correção de prioridade e os critérios de fluxo recorrente são decisões próprias. A referência aritmética confere limites pontuais; não valida o fluxo econômico ao longo do tempo.

| ID | Fonte primária | Uso e limite |
|---|---|---|
| R63 | [Google SRE — Handling Overload](https://sre.google/sre-book/handling-overload/) | Filas, controle de carga e orçamento de retries; referência de operação, não benchmark da NETWORK AI |

A política vigente está no 24 e em operating-policy-v6.json. Não houve execução dos 20/50 conjuntos de sementes planejados. As 19 verificações pontuais não são 19 mercados simulados ou resultados de GPU.
