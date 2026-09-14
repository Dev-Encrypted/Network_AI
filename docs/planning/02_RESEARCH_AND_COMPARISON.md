# Pesquisa e comparação

## Conclusão arquitetural

Construir uma **camada própria de cooperação, controle e contabilização sobre engines existentes**. Adotar vLLM como primeiro caminho de serviço para modelos completos em nós/clusters; usar Petals como referência de inferência por blocos pela internet na Fase 0. Avaliar PRIME-PIPELINE/PRIME-IROH para experimentos e SGLang como concorrente técnico no caminho Kimi. Não fazer um fork integral de uma plataforma antes de medir o mecanismo distribuído.

Nenhuma iniciativa examinada entrega, de forma demonstrada nas fontes consultadas, toda a combinação exigida: grandes modelos Kimi entre GPUs residenciais, crédito interno por reserva útil, confiança explícita, recuperação de sessões e agente local. Isso é uma conclusão limitada ao recorte investigado, não uma afirmação sobre todos os projetos existentes.

Pesquisa com corte em 13/09/2026. Código, documentação, model cards e artigos de autores têm precedência sobre demonstrações visuais e promessas comerciais. “Serviço oferecido” significa produto e documentação públicos encontrados; não significa contratação, benchmark independente, auditoria de segurança ou disponibilidade testada nesta análise.

## Classificação das iniciativas

| Projeto | Categoria principal | Divisão de uma mesma sessão | Papel recomendado |
|---|---|---|---|
| Petals | Inferência entre máquinas; software de pesquisa com swarm público | Blocos transformer, rotas com réplicas | Referência principal do modo C |
| Hivemind | Biblioteca P2P e treinamento descentralizado | Primitivas, não um servidor universal de LLM | Dependência da bancada Petals; referência de descoberta |
| exo | Cluster local com inferência particionada | Pipeline/tensor conforme backend e modelo | Referência de topologia e possível cluster participante |
| AI Horde | Cooperativa com créditos e distribuição de pedidos | Pedidos completos para workers | Referência de participação, filas e kudos |
| Golem | Marketplace de computação | Aplicação deve organizar o paralelismo | Referência de acordos, pagamento e reputação |
| Akash | Marketplace operacional de cloud | Interna ao workload/cluster contratado | Possível contingência; não núcleo da cooperação |
| io.net | Serviço comercial de clusters/compute e APIs | Dependente da infraestrutura e workload | Referência de admissão, reservas e verificação |
| Gensyn | Infraestrutura/pesquisa de treinamento e verificação | RL distribuído não equivale a pipeline de chat | Referência de verificação, não engine escolhida |
| Prime Intellect | Cloud/API, treinamento e pesquisa de inferência WAN | PRIME-PIPELINE é experimento específico | Comparador de pipeline e transporte |
| Bittensor | Subnets com incentivos e validação | Depende de cada subnet | Referência de adversários/incentivos |
| Salad | Serviço comercial de containers em GPUs compartilhadas | Normalmente pedido/job/container completo | Referência operacional de interrupção e demanda |
| GPUStack | Gestão de clusters de inferência | Conforme engine e configuração | Referência de catálogo, placement e administração |
| Distributed Llama | Cluster local/protótipo numérico | Tensor parallel em topologia prescrita | Comparador LAN; não WAN pública |
| KTransformers | Pesquisa e runtime CPU/GPU | Offload dentro da máquina, não cooperação WAN | Comparador de executar localmente com RAM |

## Petals e Hivemind

Petals tem cliente, servidores de blocos, descoberta via Hivemind, seleção de rotas e recuperação por reconstrução de estados. Documenta BLOOM, Llama, Falcon e Mixtral; o README inclui Llama 3.1 405B e Mixtral 8×22B. Isso **não implica suporte a Kimi K3**. Linux/CUDA é o caminho principal, com instruções para WSL e outras plataformas. [Repositório](https://github.com/bigscience-workshop/petals), [artigo NeurIPS](https://arxiv.org/html/2312.08361v1).

A unidade externa é um bloco servido por um nó; há código para tensor parallel local. O próprio conversor avisa que TP para arquiteturas além de BLOOM não foi suficientemente testado. Se um bloco não couber, não basta atribuir “meia camada” a outro peer: é preciso TP local validado, outra representação ou novo suporte numérico. [Código de conversão](https://github.com/bigscience-workshop/petals/blob/22afba627a7eb4fcfe9418c49472c6a51334b8ac/src/petals/utils/convert_block.py).

Hivemind fornece DHT, comunicação e primitivas de treinamento sobre redes heterogêneas. Sua biblioteca e Petals usam código MIT, mas os pesos têm licenças independentes. A DHT não é autoridade de saldo, identidade comercial ou disponibilidade garantida. [Hivemind](https://github.com/learning-at-home/hivemind).

**Reutilização:** reproduzir primeiro o Petals fixado; proteger a bancada por rede privada, mantendo seus transportes internos. Só depois decidir se um fork estreito de compatibilidade/manutenção é necessário. Evitar reescrever Hivemind em Rust ou transportar toda sua semântica para o produto. A camada pública deverá autorizar sessões antes de alcançar RPCs da engine.

## Comparação de operação e confiança

“Não comprovado” nesta tabela significa ausência de evidência suficiente no material consultado; não ausência universal da funcionalidade.

| Projeto | Descoberta e NAT/CGNAT | Falhas e segurança | Incentivo e limite para NETWORK AI |
|---|---|---|---|
| Petals | DHT e libp2p; artigo usa Circuit Relay para servidores atrás de firewall | Réplicas de blocos e reconstrução; host pode observar/alterar dados | Contribuição voluntária; não oferece nosso ledger por disponibilidade |
| Hivemind | DHT/P2P e relays como primitivas | Tolerância específica por subsistema; aplicação define autorização/verificação | Não define economia de inferência completa |
| exo | Descoberta automática e namespace libp2p; evidência principal LAN/TB5 | Placement por topologia; continuidade transparente de KV sob churn WAN não comprovada | Sem ledger cooperativo equivalente |
| AI Horde | Worker busca jobs no coordenador por API, favorável a conexões de saída | Filas/status/reputação; verificação varia entre texto/imagem | Kudos priorizam acesso, incluindo mecanismos de disponibilidade; adaptar conceitos, não assumir nossa fórmula |
| Golem | Oferta/demanda via Yagna; documentação de provider não exige port forwarding | Acordos, cobrança, runtimes e reputação; correção depende do workload | GLM; não converter sua economia em créditos internos por simples renomeação |
| Akash | Diretório/leases on-chain e provider com endpoints; exige infraestrutura operável | Reagendamento de workload não preserva automaticamente KV; trust depende do provider | Mercado e liquidação próprios; não resolve peers domésticos ou particionamento numérico |
| io.net | Onboarding e orquestração de clusters; NAT e topologia precisam ser qualificados por produto | PoW/checagem de VRAM e controles de admissão; não é prova universal da resposta | Aluguel temporal e recompensas; validação publicada tem limites e componentes fechados |
| Gensyn | Comunicação e identidade da rede/testnet | Pesquisa de execução/verificação e resolução de divergências | Incentivos on-chain; não demonstram inferência de K3 em tempo real |
| Prime | API roteia provedores; PRIME-IROH permite P2P, hole punching e relay | Sandbox de pesquisa; recuperação de estados e proteção pública ficam por integrar | Cloud/API têm cobrança; pesquisa não fornece nossa cooperativa pronta |
| Bittensor | Metagraph, axons e dendrites; endpoint de miner depende da subnet | Validadores pontuam resultados; conluio e cópia de pesos de validação importam | TAO/alpha e regras por subnet; pontuação não prova cálculo correto |
| Salad | Agente/container e gateway ou fila; rede residencial gerenciada | Realoja containers interrompidos; aplicação deve preservar/reexecutar jobs | Cobrança de containers em execução e recompensa de contribuidores; disponibilidade de jobs varia |
| GPUStack | Coordenador registra workers e endpoints anunciados | Health/placement e isolamento conforme implantação; host gerenciado é pressuposto | Gestão de frota privada, sem emissão cooperativa equivalente |
| Distributed Llama | Root e workers configurados em LAN/Ethernet | Root coordena slices; tolerância bizantina/NAT público não comprovada | Sem economia; sincronização estreita e topologia limitada |
| KTransformers | Sem problema P2P no caminho CPU/GPU local | Depende do host, memória RAM e kernels | Alternativa local a comparar com o benefício de contribuir |

Fontes operacionais: [AI Horde](https://github.com/Haidra-Org/AI-Horde), [Golem overview](https://docs.golem.network/docs/golem/overview), [reputação Golem](https://docs.golem.network/docs/reputation), [FAQ de provider](https://github.com/golemfactory/yagna-docs/blob/master/provider-faq.md), [Akash providers](https://akash.network/docs/learn/core-concepts/providers-leases/), [io.net onboarding](https://io.net/docs/guides/workers/device-onboarding), [io.net FAQ](https://io.net/docs/guides/faq), [Gensyn](https://docs.gensyn.ai/core-components), [Prime API](https://docs.primeintellect.ai/inference/overview), [Bittensor](https://docs.learnbittensor.org/learn/bittensor-building-blocks), [Salad FAQ](https://docs.salad.com/container-engine/explanation/core-concepts/faqs).

## Evidência implementada, hardware e reutilização

| Projeto | Evidência técnica específica | Limite ou decisão |
|---|---|---|
| exo | MLX, MLX distributed, pipeline/tensor e TB5/RDMA; exemplos em M3 Ultra | README contém extras CUDA na instalação Linux, mas declara aceleração Linux ainda em desenvolvimento. Tratar GPU Linux como não qualificada, não resolver a contradição a favor do marketing. [Código/documentação](https://github.com/exo-explore/exo) |
| AI Horde | Backend Python/PostgreSQL/Redis; workers de texto como KoboldCPP/Aphrodite e workers de imagem | Adaptar recibos, filas e experiência. Não fazer fork AGPL sem aceitar obrigações de distribuição/serviço do código modificado. [Backend](https://github.com/Haidra-Org/AI-Horde) |
| Golem | SDK JS, Yagna e runtimes; reputação cita GPU ainda em evolução/beta | Compatibilidade GPU/modelo precisa de teste específico; pesquisa não confirmou um scheduler Kimi pronto. Link de Yagna respondeu 404 nesta coleta; não inferir abandono do projeto. [SDK](https://github.com/golemfactory/golem-js) |
| Akash | Providers Kubernetes, especificação de deployment, recursos e leases | Pode fornecer uma unidade B contratada; criar clusters e executar modelos é responsabilidade adicional. A documentação consultada já usa ACT em liquidação, então não assumir versões antigas da economia. [Setup](https://akash.network/docs/providers/setup-and-installation/provider-console/), [provider](https://github.com/akash-network/provider) |
| io.net | Worker, estados, PoW e API de verificação; caminho separado de confidential inference | Não transplantar a afirmação de exclusividade física da GPU como garantia. Confidential inference exige atestação completa, diferente do worker residencial. [Verificação confidencial](https://io.net/docs/guides/confidential-inference/verification-guide) |
| Gensyn | RL Swarm executa aprendizado cooperativo; página consultada diz não haver swarm oficial ativo naquele estado | Reutilizar ideias de testes e divergências; a condição do RL Swarm não significa que todos os produtos Gensyn estejam inativos. [RL Swarm](https://docs.gensyn.ai/testnet/rl-swarm), [código](https://github.com/gensyn-ai/rl-swarm) |
| Prime | PRIME-PIPELINE deriva de GPT-Fast e implementa schedules síncronos/assíncronos; PRIME-IROH tem bindings Python/Rust | Benchmark comparador, não serviço público pronto. O README usa Llama-2-7B-chat por padrão. [Pipeline](https://github.com/PrimeIntellect-ai/prime-pipeline), [transporte](https://github.com/PrimeIntellect-ai/prime-iroh) |
| Bittensor | SDK antigo foi arquivado; desenvolvimento mudou para `subtensor/sdk/python`, Bittensor 11 | Não confundir arquivo do SDK antigo com fim da rede; licenças dos subnets são independentes. [Aviso oficial](https://github.com/RaoFoundation/bittensor), [monorepo](https://github.com/RaoFoundation/subtensor) |
| Salad | Containers em GPUs de consumo, gateway/fila, realocação e cobrança por segundo em running | Referência de interrupções; frontend comercial não comprova desempenho de uma sessão repartida. [SCE](https://salad.com/salad-container-engine/) |
| GPUStack | Catálogo, autenticação de API, workers e engines gerenciadas | Bons padrões de administração. Instalação privilegiada com Docker socket não deve ser copiada para contributors públicos. [Repositório](https://github.com/gpustack/gpustack) |
| Distributed Llama | C++/CPU ARM e AVX2, Vulkan experimental, Llama/Qwen; root distribui pesos | Restrições publicadas incluem potências de dois e limite por KV heads. Não apropriado como núcleo WAN heterogêneo. [Repositório](https://github.com/b4rtaz/distributed-llama) |
| KTransformers | CPU/GPU heterogeneous inference, kt-kernel e integração com SGLang; tutorial Kimi K2.5 | Economiza VRAM usando RAM/CPU, com custo de memória e banda local; não valida K3 WAN. [Repositório](https://github.com/kvcache-ai/ktransformers) |

## Manutenção, licenças e dependências

Snapshot da API oficial do GitHub em [repository-status.json](evidence/repository-status.json). `pushed_at` pode incluir branches e não mede qualidade, estabilidade ou frequência de releases. O hash de HEAD foi coletado separadamente para as principais engines em [engine-commits.jsonl](evidence/engine-commits.jsonl).

| Componente | Licença observada | Sinal de manutenção na coleta | Dependências/condição |
|---|---|---|---|
| Petals | MIT | HEAD de 25/08/2024; último push 07/09/2024; não arquivado | PyTorch, Transformers, Hivemind, bitsandbytes e tensor_parallel; risco elevado de defasagem |
| Hivemind | MIT | Push 11/01/2026 | Python/PyTorch e stack P2P; manter ambiente isolado do vLLM |
| exo | Apache-2.0 | Push 25/08/2026 | MLX, bindings Rust, versões de macOS/TB5 |
| AI Horde | AGPL-3.0 | Push 04/09/2026 | Backend e workers têm artefatos/licenças próprios |
| Golem | SDK JS LGPL-3.0; licença atual de Yagna não confirmada nesta coleta | SDK push 03/09/2026; Yagna 404 | Não aprovar incorporação sem obter fonte/licença exatas |
| Akash provider | Apache-2.0 | Push 11/09/2026 | Kubernetes, rede/chain e ferramentas de provider |
| io.net | Plataforma completa não identificada como código aberto reutilizável | Documentação e produtos públicos | Termos comerciais e licenças de SDK não equivalem à plataforma |
| Gensyn RL Swarm | MIT | Push 05/01/2026 | RL/treinamento; componentes de verificação têm revisão própria |
| PRIME-IROH | MIT | Push 28/07/2026 | Rust/Python e Iroh |
| PRIME-PIPELINE | Licença não resolvida pelo detector da API | Push 13/05/2025 | Não copiar código até resolver a licença; usar benchmark como referência |
| Bittensor | SDK antigo MIT; monorepo reporta Apache-2.0 | Antigo arquivado em 10/07/2026; monorepo push 12/09/2026 | Verificar licença de `sdk/python` e cada subnet antes de reutilizar |
| Salad | Serviço proprietário; componentes abertos não abrangem toda a operação | Docs operacionais disponíveis | Integração comercial, não fork integral |
| GPUStack | Apache-2.0 | Push 10/09/2026 | Engines, containers e aceleradores têm condições adicionais |
| Distributed Llama | MIT indicado pelo projeto | Código e documentação públicos; sem série de releases auditada aqui | C++ e Vulkan; modelo/quantização específicos |
| KTransformers | Apache-2.0 no LICENSE; avisos próprios de dependências | README registra trabalho até agosto/2026 | Conferir licença dos kernels/imagem escolhidos |

## Engines

| Engine | Capacidade existente | Limites relevantes | Decisão e reavaliação |
|---|---|---|---|
| vLLM | Serving, continuous batching, caches, TP/PP/EP conforme arquitetura, API streaming | Distributed runtime pressupõe ambiente confiável; kernels/quantizações variam por GPU; não exporta bloco K3 arbitrário a um peer automaticamente | Primeiro worker de serviço A/B. Validar Qwen3-8B e manter K3 em perfil experimental separado |
| SGLang | Serving, Radix/prefix cache, MoE, paralelismo e estados híbridos | Receitas K3 têm qualificações diferentes; páginas ainda contêm texto anterior ao lançamento | Concorrente na Fase 0; trocar caminho Kimi se correção/memória/latência forem melhores |
| llama.cpp | GGUF, CPU/GPU heterogêneos, ampla portabilidade e RPC | RPC é declarado frágil/inseguro e não deve ser exposto em rede aberta; GGUF não é quantização universal | Caminho futuro local/privado; não adicionar ao MVP de serviço |
| TensorRT-LLM | Kernels/runtime NVIDIA, serving e paralelismo de cluster | Artefatos e kernels acoplados à plataforma; implementação atual inclui caminho PyTorch, não só engines compiladas | Avaliar apenas quando existir cluster NVIDIA e ganho medido justificar outro adaptador |
| Petals/PyTorch | Blocos transformer, discovery e recuperação WAN | Catálogo finito, dependências antigas, ausência de integração K3 | Referência experimental C; não engine pública de produção sem hardening |
| MLX/exo | Inferência e comunicação entre dispositivos compatíveis | Evidência forte em Apple/LAN; não prova frota CUDA residencial | Cluster B opcional após qualificação própria |
| kt-kernel/KTransformers | Experts CPU/GPU e offload | CPU, NUMA, RAM e banda local podem dominar | Benchmark da alternativa local, não novo caminho do MVP |

Fontes: [vLLM security](https://docs.vllm.ai/en/latest/usage/security/), [vLLM K3](https://recipes.vllm.ai/moonshotai/Kimi-K3), [SGLang K3](https://docs.sglang.io/cookbook/autoregressive/Moonshotai/Kimi-K3), [llama.cpp RPC](https://github.com/ggml-org/llama.cpp/blob/master/tools/rpc/README.md), [TensorRT-LLM](https://github.com/NVIDIA/TensorRT-LLM), [exo](https://github.com/exo-explore/exo).

vLLM/SGLang reportam Apache-2.0; llama.cpp MIT. A leitura direta do [LICENSE TensorRT-LLM](https://github.com/NVIDIA/TensorRT-LLM/blob/main/LICENSE) confirmou Apache-2.0 e avisos de terceiros, apesar do `NOASSERTION` na API. O [LICENSE KTransformers](https://github.com/kvcache-ai/ktransformers/blob/main/LICENSE) declara Apache-2.0. Conferir exceções por diretório, dependências e imagens; licença do repositório não substitui a de CUDA ou pesos.

## Benchmarks publicados e força da evidência

| Fonte | Condições e resultado publicado | Uso permitido na decisão |
|---|---|---|
| Petals, NeurIPS 2023, tabela 2 | Llama 2 70B NF4 em 3×T4 16 GB; um cliente, 100 Mbit/s, RTT 100 ms: 1,57 passos/s em sequência 128 e 1,44 em 2.048; rede controlada por `tc` | Demonstra viabilidade de um caso WAN simulado; não extrapolar para K3 |
| Mesmo artigo, experimento real | BLOOM 176B INT8 em 14 servidores Europa/América do Norte, GPUs heterogêneas e 100–1.000 Mbit/s; quatro atrás de firewall | Evidência de execução por internet real; hardware/modelo/contexto diferem do alvo |
| exo README | Exemplos de Qwen3-235B 8-bit, DeepSeek-v3.1 e Kimi-K2-Thinking 4-bit em 4×M3 Ultra, interconexão TB5/RDMA | Exemplos LAN; números gráficos sem conjunto completo de parâmetros não viram nosso SLO |
| Prime, abril/2025 | Pesquisa de schedules síncronos/assíncronos com latência artificial e análise de memória/throughput | Reproduzir scripts; previsão de escala planetária continua hipótese |
| vLLM K3, julho/2026 | Batch 1, GB300 NVL72: 118 tok/s em TP16 sem especulação; 370 com DSpark. Artigo apresenta 8K/1K random para baseline e SPEED Bench para especulação | Resultados dos autores com cargas distintas; não comparação controlada nossa nem expectativa de GPU 24 GiB |
| SGLang K3 | Receita distingue células verificadas de células ainda em verificação; exige reavaliar precisão | A qualificação parcial reduz a confiança em adotar qualquer combinação da matriz |
| Demais redes | Não foi identificado benchmark comparável de uma sessão K3 repartida entre GPUs residenciais nas fontes usadas | Não usar quantidade de GPUs, jobs concluídos ou imagens do painel como substituto |

Fontes dos experimentos: [Petals](https://arxiv.org/html/2312.08361v1), [Prime](https://www.primeintellect.ai/blog/inference), [vLLM K3](https://vllm-project.github.io/2026/07/27/k3.html), [SGLang](https://docs.sglang.io/cookbook/autoregressive/Moonshotai/Kimi-K3). Nenhum desses benchmarks foi executado para este pacote.

## Escolha entre uso, fork e desenvolvimento

| Alternativa | Avaliação | Condição de revisão |
|---|---|---|
| Usar um projeto integralmente | Rejeitada: objetivos econômicos, confiança, catálogo ou execução divergem | Reavaliar se surgir solução com os contratos e gates exigidos |
| Fork integral de Petals/exo/AI Horde | Rejeitado inicialmente: herda limitações e aumenta manutenção/licenciamento | Somente se prova de conceito demonstrar economia de integração superior ao wrapper |
| Camada própria + engines | Escolhida: separa cooperação de cálculo e permite catálogo extensível | Interfaces e testes devem impedir dependência do ledger em uma engine |
| Fork estreito de engine/blocos | Condicional: pode ser necessário para K3, estados híbridos ou segurança | Patch pequeno, upstream quando possível, responsável e suíte de paridade |
| Engine numérica nova | Último recurso experimental | Exigir gargalo demonstrado, alternativa medida e financiamento específico |

Iroh foi acrescentado à pesquisa porque PRIME-IROH oferece comparação direta com Rust/libp2p: QUIC, identificação por chave pública, hole punching e relays. Não executar dois stacks P2P no MVP. O teste de conectividade decide qual transportará o protocolo próprio; ambos continuam sem resolver confiança de inferência ou saldos. [Iroh](https://github.com/n0-computer/iroh), [PRIME-IROH](https://github.com/PrimeIntellect-ai/prime-iroh).
