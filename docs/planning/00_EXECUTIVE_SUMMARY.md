# NETWORK AI — resumo executivo

## Planejamento consolidado da revisão 6

O [24](24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md) é a regra operacional vigente. Corrige a prioridade de recomposição: piso de renovação essencial, reserva protegida, restante do orçamento normal e só então queima. Acrescenta bootstrap sem saldo fictício, prova de fluxo recorrente sem emissão contínua, demanda por modelo/coorte e vendedor responsável por cada rota comercial.

As 19 verificações pontuais corrigem o contraexemplo de liquidez e conferem limites aritméticos; não representam nova simulação integrada ou execução do produto. A configuração fictícia v4 continua reprovada. FC01–FC06 separam desenho, integração e aprovação de abertura. A primeira bancada de inferência e a pesquisa de modelos gigantes não dependem da integração comercial.

## Histórico da revisão 4

Os documentos [22](22_POLICY_CLOSURE_AND_CONTINUITY.md) e [23](23_INTEGRATED_ECONOMY_SIMULATIONS.md) registram os fundamentos e ensaios anteriores. Foram definidos circulação/reserva de TU, tabela comparável de contribuição e consumo, fila por custo, verificação com exposição limitada, CometBFT/ABCI federado e custeio com encerramento reservado. Consumo recompõe a reserva até seu alvo e queima o restante; READY recebe TU existentes antes de emissão complementar autorizada.

As 54 execuções fictícias preservaram invariantes, mas reprovaram os parâmetros ensaiados para abertura por interrupções no cenário básico. O mecanismo foi escolhido; tarifas reais, utilidade por GPU e disponibilidade exigem calibração e os pilotos definidos. Não há alegação de equilíbrio econômico demonstrado.

**Recomendação:** construir uma rede cooperativa aberta que funciona mesmo sem compradores em dinheiro. Disponibilidade útil gera tokens de uso; ociosidade permite limites maiores. Mercado e pagamentos são adicionais, com saldo separado. Identidade portável, ofertas comunitárias e operadores independentes permanecem requisitos. A referência econômica vigente é o [24](24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md); o 20 explica a cooperação e os limites elásticos.

Este é um pacote de planejamento e especificações, com pesquisa até **13/09/2026**. Não há produto implementado, pesos completos baixados, infraestrutura implantada ou benchmark de GPU executado aqui. Cálculos de capacidade são projeções; compatibilidades precisam de testes.

## Arquitetura recomendada

**Rede aberta e mercado comunitário:** qualquer participante pode criar nó, publicar ofertas de modelos, escolher pools e vender inferência. Identidade por chave, descoberta P2P, indexadores/gateways intercambiáveis e liquidação verificável substituem a dependência de um operador central global. O [18](18_OPEN_NETWORK_AND_COMPUTE_MARKET.md) define a direção vigente e os testes de independência. Os quatro planos do 03 descrevem a operação local de cada pool/gateway.

| Modo, mesma interface externa | Papel |
|---|---|
| A — modelo completo em um nó | Baixa complexidade de serving, réplicas e resposta rápida quando o perfil cabe |
| B — modelo completo em cluster participante | GPUs próximas com interconexão adequada; unidade útil para modelos grandes |
| C — modelo repartido entre participantes | Blocos contíguos e híbridos de ilhas rápidas; particionamento/estado precisam de prova por arquitetura |

TP/EP são preferidos dentro de ilhas rápidas. Dividir experts pela internet não é default porque MoE reduz trabalho ativo, mas não elimina memória residente ou comunicação. Ativações e streaming ficam fora do backend NestJS. Browser usa gateway HTTPS/SSE; comunicação peer/relay respeita autorização limitada à sessão.

## GPUs heterogêneas e diferentes modelos

A plataforma prevê memórias, gerações, fabricantes, sistemas e conexões diferentes. **24 GiB é a primeira bancada, não requisito universal.** Cada dispositivo é qualificado por GPU/SO/driver/engine/modelo/quantização/função/contexto/concorrência. Mesma VRAM não implica igual desempenho nem compatibilidade.

Um nó pode manter modelo inteiro, blocos de um maior ou nenhuma atribuição naquele momento. Uma GPU menor pode contribuir para um modelo compatível e gastar os créditos em outro maior. Catálogo, identidade e saldo são comuns; tarifas, limites, confiança e capacidade são específicos de cada configuração. Candidatos iniciais incluem Qwen, Llama e diferentes Kimi, sem promessa de equivalência ou substituição silenciosa.

A [matriz de heterogeneidade](15_HETEROGENEOUS_HARDWARE_AND_CATALOG.md) cobre múltiplos fabricantes, 8–192+ GiB, memória unificada, GPUs por host, Windows/WSL2, concorrência com jogos, perda de capacidade e combinações não qualificadas.

## Tecnologias e reutilização

| Área | Escolha inicial |
|---|---|
| Daemon/CLI e gateway de dados | Rust; worker separado; operações numéricas continuam nas engines |
| Inferência A/B | Python + vLLM; SGLang comparado no caminho Kimi; uma engine de serviço inicial |
| Pesquisa C | Petals privado como referência; avaliar PRIME-PIPELINE/PRIME-IROH; executor específico somente onde necessário |
| Controle | TypeScript/NestJS como monólito modular |
| Web / desktop posterior | React/Next.js; Tauri/React reutiliza daemon |
| Dados | PostgreSQL operacional local; registro cooperativo e liquidação financeira separados; Redis efêmero |
| Contratos / rede | Protobuf/gRPC; libp2p/QUIC candidato, confrontado com Iroh; relay de saída com quotas |
| Modelos / operação | Manifestos assinados, conteúdo por hash, S3/HTTP; Docker, CI, OpenTelemetry/Prometheus/Grafana |

Reutilizar engines, rede, criptografia e armazenamento. Desenvolver ofertas/identidade abertas, coordenação por sessão/pool, lifecycle do daemon, manifestos, capabilities, medição, liquidação, UX e integração dos estados de C. Evitar fork integral antes da bancada; Petals tem dependências/manutenção antigas a avaliar. [Comparação](02_RESEARCH_AND_COMPARISON.md), [ADRs](04_TECH_STACK_AND_ADRS.md).

## Modelos grandes: viabilidade e limite atual

**Kimi K3 foi confirmado em fontes oficiais**, com pesos disponíveis e receitas vLLM/SGLang para clusters específicos. A arquitetura publicada tem 2,8 trilhões de parâmetros totais e 104 bilhões ativos, com KDA, Gated MLA, AttnRes e LatentMoE. Isso não demonstra execução entre GPUs residenciais. [MoonshotAI](https://github.com/MoonshotAI/Kimi-K3), [vLLM](https://recipes.vllm.ai/moonshotai/Kimi-K3), [SGLang](https://docs.sglang.io/cookbook/autoregressive/Moonshotai/Kimi-K3).

Na revisão fixada, metadados indicam aproximadamente **1,56 TB de arquivos de pesos** e shard de camada de até **15,824 GiB**. Peso comprimido em disco não é VRAM do runtime. Kernel, expansões, estados recorrentes, cache, resíduos e buffers determinam a menor unidade executável. A licença K3 também tem condições comerciais próprias, registradas no [05](05_MODELS_AND_DISTRIBUTION.md).

Não há prova neste pacote de K3 C em GPUs 24 GiB. A primeira investigação deve medir unidade real, execução de referência e tráfego por fronteira. Rotas com dezenas de etapas WAN sequenciais podem inviabilizar chat interativo mesmo com memória suficiente; agrupar GPUs em ilhas é hipótese prioritária. Ver [bancada e cálculos](10_BENCHMARKS_AND_CAPACITY.md).

## Créditos e confiança

Remunerar **duração verificada da reserva útil × tarifa da capacidade atribuída**. READY pode ganhar crédito sem receber pedidos se a rede solicitou essa reserva para demanda ou contingência. Aplicativo aberto, VRAM declarada ou arquivos armazenados não bastam.

**Tokens de uso (TU)** são ganhos por reserva cooperativa útil aceita e verificada, sem exigir venda ou depósito. Consumo reduz saldo gastável; não há conversão automática em dinheiro. **Saldo de pagamentos** registra vendas/depósitos e retiradas em unidade financeira separada. Limite elástico é capacidade de uso atual, sem acumular saldo ou ampliar contexto automaticamente. [Ledger](07_CREDITS_AND_LEDGER.md), [política vigente](24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md).

A política de emissão considera capacidade, TU acumulados e compromissos já aceitos. Não paga cadastro nem remunera duas vezes a mesma alocação. Quota e concorrência sobem com folga real por modelo, e novos extras param quando chega procura concorrente. Zero vendas com fila cooperativa cheia não é ociosidade. Os [20 cenários atuais](21_COOPERATIVE_SIMULATIONS.md) verificam regras de referência, sem provar hardware ou consenso.

Rede comunitária não garante sigilo contra o dono da GPU. Grupos autorizados e execução privada têm políticas próprias; computação confidencial só é anunciada com suporte/atestação demonstrados. Assinaturas provam origem, não correção numérica. Agente executa ferramentas no ambiente do consumidor; contributors recebem apenas workloads aprovados de inferência. [Segurança](08_SECURITY_AND_TRUST.md).

## Riscos que podem inviabilizar o perfil pretendido

| Risco | Evidência decisiva e resposta |
|---|---|
| Menor unidade K3 não cabe ou kernel não roda na GPU-alvo | Medir E03/E04; host/ilha maior, nova integração ou rejeitar aquela combinação |
| Latência/rede tornam C lento demais | E05/E07; reduzir fronteiras, agrupar GPUs, admitir somente perfis aprovados |
| Churn interrompe rotas e estado custa caro de reconstruir | E09 e recovery por arquitetura; contingência e limite de publicidade |
| Fraude supera custo viável de verificação | E10; fundos e perdas limitados por contrato, verificador/risco explícitos; pools podem restringir sua contratação |
| Créditos prometem mais consumo que oferta no pico | E12, cenários por modelo/horário, quotas e redução de novos compromissos |
| Privacidade incompatível com o uso de código sensível | Escolha explícita de trust policy e agente com contexto mínimo; sem promessa criptográfica inexistente |
| Heterogeneidade multiplica manutenção e falhas | Qualificação por tupla e uma engine inicial; expandir por demanda e evidência |

## Próximo incremento

Fase 0: resolver pacotes/licenças e builds; medir Qwen3-8B local/remoto em dois hosts privados; reproduzir execução de blocos; iniciar referência e menor unidade K3; comparar transporte/NAT. Entrega desse incremento é evidência e decisão de viabilidade por perfil, antes de UI extensa ou economia pública.

Depois: bancada privada → cooperação e limites sem compradores → ofertas comunitárias e comércio separado → C avançado → rede aberta com independência demonstrada → agente e expansão. O [roadmap](12_ROADMAP_AND_BACKLOG.md) contém **58 itens em onze épicos**. Abertura exige operadores e gateways/indexadores alternativos, registro cooperativo verificável e retirada comercial sem o servidor original. A hipótese federada usa quatro validadores independentes/quorum três; não é consenso permissionless equivalente a Bitcoin. Os [12 documentos obrigatórios e complementos](../../README.md) preservam os riscos e seus testes.
