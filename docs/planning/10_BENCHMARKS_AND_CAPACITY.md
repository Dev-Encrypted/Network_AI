# Bancada, desempenho e capacidade

## Situação da evidência

**Nenhum benchmark de GPU, inferência ou rede foi executado neste planejamento.** Foram inspecionados fontes, configurações, índices e metadados públicos. Contas abaixo são projeções aritméticas recalculadas localmente, não desempenho demonstrado. Benchmarks de autores estão separados no [02](02_RESEARCH_AND_COMPARISON.md).

A bancada começa com 24 GiB conforme o briefing e se expande pela [matriz heterogênea](15_HETEROGENEOUS_HARDWARE_AND_CATALOG.md). RTX 3090 e RTX 4090 recebem resultados separados; uma não representa toda geração ou fabricante.

## Registro reproduzível

Cada run guarda: ID, data, responsável, hipótese pré-registrada, hardware, driver/firmware, SO/kernel, imagem por digest, engine/commit, kernels/flags, manifesto/revisão dos pesos, precisão, template/parser/tokenizer, dataset e seed. Registrar CPU/NUMA, RAM, SSD, PCIe e interconexões entre GPUs.

Guardar stages, rota direta/relay, localização aproximada consentida, banda bidirecional, RTT/jitter/perda, energia/clocks observados, outras cargas e temperatura. Usar corpus sintético/autorizado. Não publicar chaves, prompts privados ou IPs pessoais.

Etiquetas obrigatórias: `MEASURED_LOCAL`, `PUBLISHED_EXTERNAL`, `SIMULATED`, `CALCULATED_PROJECTION`, `NOT_RUN`. Rede emulada com GPU real continua simulação para conclusões sobre WAN.

## Experimentos

Todos estão **NOT_RUN**; responsáveis abaixo são papéis, sem pessoas designadas.

| ID | Comparação / trabalho | Evidência e gate | Responsável / dependência |
|---|---|---|---|
| E00 | Resolver pesos, licenças, imagens e suporte | Pacotes por digest e permissão de uso; versão executável | Infra/modelos; fase 0 |
| E01 | Qwen3-8B BF16 local versus mesmo worker remoto | Total 8.192 tokens, 1 sessão, VRAM ≤20 GiB; stream/cancel; overhead de gateway | Runtime; E00 |
| E02 | Petals privado; referência local versus blocos LAN/WAN emulada | Baseline fixado; dependências antigas, tensores e falhas analisados | Distribuição; E00; engine isolada do serviço |
| E03 | K3 completo, cluster compatível; vLLM/SGLang quando acessíveis | Referência numérica, memória, tools, estados; declarar falta de hardware se ocorrer | Modelos; E00; **inicia fase 0** |
| E04 | K3: unidades KDA, MLA, AttnRes, experts, head, visão em 24 GiB e perfil maior | Load parcial, picos de memória, kernels, ABI; OOM é resultado útil | Kernels; análise começa antes de E03; paridade completa depende dele |
| E05 | libp2p/QUIC versus Iroh; direto versus relay/TCP 443 | NAT, bytes/CPU/cópias, cancelamento, replay, limites | Redes; E01/E02 para integração |
| E06 | B: TP/EP/PP em interconexão rápida conforme engine | Mesma carga/configuração; comunicação, qualidade, cada GPU | Runtime; E01/E03 |
| E07 | C: blocos, ilhas rápidas, divisão heterogênea | Paridade de fronteiras, TTFT/TPOT, indivisibilidade/gargalos | Distribuição; E02/E04/E05 |
| E08 | Réplicas, concorrência, vários modelos | Curvas por grupo, fairness, admissão, VRAM e custo de troca | Scheduler; E01/E06/E07 |
| E09 | Churn, slow node, pause, kill, sleep, IP, gateway/controle/DB | Falhas do 06 tratadas; sem efeito financeiro duplicado; liberações | Confiabilidade; fluxo integrado |
| E10 | Disponibilidade falsa, Sybil/conluio, recibos/resultados alterados | Detecção, falsos positivos, custo dos probes e teto de emissão | Segurança/ledger; fase 2 |
| E11 | Hardware/SO/quantização/contexto/engine heterogêneos | Status por tupla; capacidades de 8–192+ GiB, AMD/Intel/Apple por prioridade | Qualificação; E01 e adaptadores necessários |
| E12 | Economia e restauração | 7 dias de piloto e 30 antes da abertura pública; restore, custo/tarefa, resgates e fraude | Operação/produto; fases 2–5 |
| E13 | Rede aberta e liquidação | Três operadores, dois gateways/indexadores; criar/publicar/contratar e retirar valores de teste sem servidor original; replay/gasto duplo/reorg/disputa | EP10; identificar ativo/rede/contrato e suas dependências |
| E14 | Mercado comparável | Oferta comunitária fora da lista inicial; READY/spot sem dupla remuneração; custo real, preço total, qualidade, latência, sucesso e margem por configuração/GPU | B044/B047/B050; não afirmar preço sempre menor |
| E15 | Cooperação sem compradores e limites elásticos | 7 dias com receita zero: READY→TU→uso em outro modelo; demanda baixa e fila alta, 1/2/4, volta da procura sem mudar preço/prazo aceitos | B051–B057; teste real após referências do 21 |
| E16 | Dois registros, estoque e continuidade | Dinheiro desligado com TU saudável; quorum/partição, emissão e holds concorrentes, saída correlacionada, estoque antigo e grants; campanha de 30 dias | B052/B054/B055/B058; federação do laboratório explicitada |

E03/E04 não esperam desktop ou produto completo. Sem cluster de referência K3, paridade permanece bloqueada; análise do grafo e load parcial podem prosseguir. Isso preserva o objetivo gigante desde o início.

## Cargas e amostragem

Comparações mantêm modelo, revisão, quantização, engine, contexto, saída e geração iguais. Produtos/configurações diferentes recebem comparação separada de qualidade/custo, sem atribuir toda diferença ao transporte.

| Eixo | Casos mínimos |
|---|---|
| Prompt/saída | 2K/256, 8K/1K, 32K/1K somente se a soma couber; 1M separado |
| Conteúdo | PT-BR/EN, código, JSON/tools, prefixos repetidos/únicos, casos adversariais autorizados |
| Geração | Greedy para paridade; seed/temperatura fixadas para qualidade; reasoning contado |
| Cache | Cold load, warm weights, prefix miss/hit do mesmo tenant, separados |
| Concorrência | 1, 2, 4, 8… até admissão rejeitar; primeiro perfil 24 GiB admite 1 |
| Modelos | Réplicas, grupos diferentes, troca de pesos, demanda concentrada |
| Hardware | Homogêneo, VRAM/gerações mistas, duas GPUs no host, offload e backends após qualificação |

No perfil inicial de **8.192 tokens totais**, a carga longa usa 7.168 de entrada + até 1.024 de saída; não 8.192+1.024. Contar template, ferramentas e marcadores internos pelo tokenizer aprovado.

Exploração: 3 warmups e ≥30 amostras independentes por célula. Qualificação: ≥1.000 sessões por perfil/carga crítica, intervalos de confiança de 95%, runs em três períodos diferentes. p99 exige N e incerteza; 30 amostras não dão cauda estável. Não excluir timeouts/falhas do sucesso/custo. Experimentos longos caros podem ter N menor explicitamente registrado, sem receber igual nível de confiança.

## Rede e topologia

Começar com um baseline, variar um fator por vez e depois combinar casos adversariais. Não é necessário produto cartesiano completo.

| Caso | Condições | Risco |
|---|---|---|
| LAN | RTT ≤5 ms, banda medida ≥1 Gbit/s, sem perda injetada | Engine/fronteiras |
| WAN regional | RTT 20/50 ms, 100/1.000 Mbit/s | Possível faixa interativa |
| Distante | RTT 100/200 ms, 20/100 Mbit/s | Serialização e TTFT |
| Assimétrica | Upload 10/20; download 100/500 Mbit/s | Upload do contribuidor |
| Instável | Perda 0,1%/1%; jitter 10/30 ms; reconexão | Retransmissão, timeout, buffers |
| NAT | IPv4 público, NAT doméstico, CGNAT bilateral, UDP bloqueado, IPv6 | Conexão direta/fallback |
| Relay | Mesmo workload direto/encapsulado; quotas e clientes lentos | Custo e abuso |
| Correlacionada | Nós no mesmo roteador/ISP/host/energia | Redundância não independente |

Hole punching não resolve todos os NATs. Complementar simulação com conexões residenciais reais autorizadas. [libp2p](https://libp2p.io/docs/hole-punching/), [Iroh](https://github.com/n0-computer/iroh).

## Métricas e gates

TTFT do usuário inclui fila; TTFT da engine é outra métrica. TPOT é intervalo entre tokens entregues por sessão. Separar decode tok/s individual, throughput agregado, prefill tok/s e concorrência sustentável. Medir tarefa completa, p50/p95/p99, sucesso, erro/interrupção/recuperação, GPU busy e banda de memória, VRAM/RAM/pinned memory, SSD, bytes por link/relay, energia quando observável e custo por tarefa corretamente concluída.

Gates abaixo são **metas de entrada não medidas**, não promessas comerciais:

| Perfil | Aprovação inicial | Rejeição/revisão |
|---|---|---|
| A privado, 2K/256 | TTFT p95 ≤5 s; decode mediano ≥10 tok/s; ≥99% completas; budget e cancel respeitados | OOM/kernel incompatível bloqueiam; perfil menor exige novo teste |
| B interativo | Mesmos gates A para o perfil anunciado; custo/ganho versus referência | Caber em memória não basta |
| C interativo, 2K/256 | TTFT p95 ≤20 s; decode mediano ≥5 tok/s; ≥99% completas em condição estável declarada; paridade | Se falhar, pesquisa ou tarefa tolerante a latência; não anunciar chat equivalente |
| C sob churn | ≥95% tarefas no prazo; recuperação p95 ≤30 s no modelo de referência pequeno | Gate de recuperação K3 será fixado após E03/E04, antes de E07; não herdar 30 s |
| Numérico/isolamento | Envelope do 05 pré-registrado; estados corretos e sem vazamento entre tenants | Falha bloqueia publicação independentemente da velocidade |
| Tools/API | ≥99% chamadas sintaticamente válidas, ≥200 fixtures; erros nunca executam comando indevido | Medir também sucesso real com testes; sintaxe não prova qualidade da decisão |
| Financeiro | Todos os invariantes e tetos preservados nos casos determinísticos e fault injection | Efeito duplicado ou gasto sem autorização bloqueiam abertura |

Não aumentar tolerância após observar falha para aprovar. Resultado orienta menos fronteiras WAN, ilhas maiores, kernel novo ou outra configuração escolhida explicitamente. Modos C que falham continuam investigação da ambição central, sem selo prematuro de produto.

## Cenários de 10 a 10.000 participantes

GB=10⁹ bytes; GiB=2³⁰; TB=10¹²; TiB=2⁴⁰. Assumindo 24 GiB reportados por placa, `100 × 24 GiB = 2.400 GiB = 2,34375 TiB` físicos cadastrados. Isso não é memória única endereçável ou 100 GPUs online.

Hipóteses didáticas sem base empírica: 60% online, 80% desses aceitos, 50% desses reservados, 90% desses READY. Piso a cada etapa. A aceitação real é por configuração; a tabela representa um cohort homogêneo, não toda a rede heterogênea.

| Cadastrados | VRAM física GiB | Online | Aceitos | Reservados | READY | READY do grupo-alvo: piso de 50% |
|---:|---:|---:|---:|---:|---:|---:|
| 10 | 240 | 6 | 4 | 2 | 1 | 0 |
| 100 | 2.400 | 60 | 48 | 24 | 21 | 10 |
| 1.000 | 24.000 | 600 | 480 | 240 | 216 | 108 |
| 10.000 | 240.000 | 6.000 | 4.800 | 2.400 | 2.160 | 1.080 |

Reservar 4 GiB externos e 4 GiB de runtime/estados deixa **16 GiB hipotéticos para pesos por nó**. Aplicar 15% de perda por layout/fragmentação e duas cópias por redundância: `READY_alvo × 16 × 0,85 / 2` de orçamento equivalente de pesos.

| Cadastrados | Orçamento equivalente GiB | Teto relaxado de conjuntos K3 redundantes, somente pesos |
|---:|---:|---:|
| 10 | 0 | 0 |
| 100 | 68 | 0 |
| 1.000 | 734,4 | 0 |
| 10.000 | 7.344 | 5 |

K3 tem aproximadamente 1.453,735 GiB de arquivos informados na revisão inspecionada. A última coluna é o piso do orçamento dividido por esse tamanho; não demonstra rota executável. Camadas indivisíveis, kernel, estados, licença ou links podem reduzir tudo a zero. Um shard de 15,824 GiB em disco não está provado dentro de budget 16 GiB. [Metadados](05_MODELS_AND_DISTRIBUTION.md).

Em produção substituir hipóteses por inventário e métricas por grupo. Uma GPU elegível para cinco modelos não cria cinco GPUs; apenas suas allocations efetivas contam. Ver [15](15_HETEROGENEOUS_HARDWARE_AND_CATALOG.md).

## Limites de comunicação e disponibilidade

**Ativação convencional:** `B × T × H × bytes_por_elemento`. B=1, T=8.192, H=7.168, BF16 gera 112 MiB por fronteira de prefill. A 100 Mbit/s exige ≥9,395 s, sem overhead/concorrência. Chunking sobrepõe etapas mas não elimina bytes. Decode de um token gera hidden state de 14 KiB, tornando RTT dominante em várias topologias. AttnRes/outros estados acrescentam dados; não é modelo completo de tráfego K3.

**Teto serial ilustrativo:** 93 stages em ilhas distintas, 92 transferências sequenciais de ativação + um retorno de token. Com RTT simétrico de 100 ms e retorno ideal 50 ms, comunicação soma `93 × 50 ms = 4,65 s/token`: teto de **0,215 tok/s antes de compute**. Quatro ilhas na mesma hipótese dariam teto de 5 tok/s antes de compute. São exemplos simplificados, não recomendação de 93 nós WAN em série. Reduzir fronteiras WAN e agrupar GPUs rápidas é prioritário.

**Disponibilidade ilustrativa:** 93 componentes independentes, cada um disponível 99% do tempo, dão `0,99^93 ≈39,27%` de chance instantânea de todos aptos. Independência é hipótese forte; quedas correlacionadas mudam o resultado. Projetar réplicas/recuperação por domínio de falha.

Concorrência pode preencher bolhas de pipeline e aumentar throughput sem acelerar uma pessoa. Publicar resultados separados para tamanho de modelo atendível, velocidade por sessão e quantidade de sessões, sempre com configuração/hardware/topologia completos.

## Evidência econômica integrada da revisão 4

O [23](23_INTEGRATED_ECONOMY_SIMULATIONS.md) acrescenta 54 execuções fictícias de 90 dias e sete referências de fronteira. Isso não altera o status dos experimentos reais E15/E16: ainda não foram executados. CometBFT, GPUs, WAN, banco concorrente e pagamentos não rodaram no modelo econômico.

O conjunto fictício foi reprovado para abertura por hibernação econômica básica. E15/E16 devem executar o procedimento do [22](22_POLICY_CLOSURE_AND_CONTINUITY.md), medir custo útil por GPU/modelo, circulação, reserva, perda correlacionada, caixa e retomada. Conservar os resultados adversos e usar sementes/cargas diferentes das usadas na calibração.
