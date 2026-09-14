# GPUs diferentes, múltiplos modelos e cobertura de cenários

## Requisito e limite da promessa

NETWORK AI é uma rede heterogênea: fabricantes, gerações, memórias e desempenhos diferentes; hosts com uma ou várias GPUs; conexões e horários distintos; múltiplos modelos simultâneos. O perfil inicial de 24 GiB é uma referência de bancada solicitada no briefing. Não é requisito universal nem limite da arquitetura.

O objetivo é aproveitar combinações úteis e permitir que a comunidade integre novos modelos/runtimes. Não é possível prometer suporte técnico antecipado a todo hardware/arquitetura. Cada nó/pool mantém sua política de execução e qualificação; pode recusar uma combinação sem impedir anúncio em outros operadores. Uma reserva cooperativa útil pode gerar TU sem comprador financeiro; ficar online sem atribuição/verificação não gera saldo. Limites elásticos dependem da folga do perfil/modelo compatível, conforme o [20](20_COOPERATIVE_ECONOMY_AND_ELASTIC_LIMITS.md).

O [18](18_OPEN_NETWORK_AND_COMPUTE_MARKET.md) separa registro aberto de ofertas, execução assumida pelo provider e catálogo qualificado por cada operador. Publicar qualquer modelo não exige a engine da primeira bancada; exige declarar adapter, limites e evidências. Dividir uma sessão de qualquer modelo entre GPUs ainda depende de ABI, estados e suporte real daquela arquitetura.

## Capacidade é um vetor por dispositivo

| Dimensão | Inventário e validação | Consequência |
|---|---|---|
| Identidade observada | Fabricante, modelo, arquitetura/ISA, dispositivo local, driver, runtime | Nome/UUID não concede elegibilidade nem prova exclusividade física |
| Memória | Total, livre observado, budget do usuário, reserva externa, dedicada/unificada, pico sob carga | Bytes e reserva por domínio; memória unificada compartilha pressão com CPU/SO |
| Cálculo | Dtypes/kernels executáveis; prefill/decode por configuração/forma; banda de memória | Mesma VRAM pode resultar em funções e tarifas diferentes |
| Topologia local | GPU-GPU, PCIe/NVLink quando presentes, NUMA, CPU, RAM, SSD | Duas GPUs não se tornam uma GPU com memória somada |
| Rede | RTT, jitter, perda, upload/download por par, NAT, relay, franquia | Qualificação depende da rota; ping isolado não determina posição |
| Disponibilidade | Horários, sleep/resume, uso simultâneo, temperatura, throttling, energia | Reserva pode ter janela curta, concorrência menor ou ser recusada |
| Confiança | Operador/grupo, chaves, software aprovado, incidentes, atestação quando aplicável | Host rápido não substitui host autorizado de um grupo privado |

Relatório local é entrada não confiável. Benchmarks, probes e histórico produzem classificação com validade. Mudança de driver, runtime, dispositivo, limite importante ou configuração invalida a qualificação afetada; oscilações pequenas atualizam capacidade sem benchmark completo a cada heartbeat.

`hardware_profile_id` descreve características. `qualification_id` vincula **hardware + SO/driver + engine/build + modelo/revisão + quantização + função + contexto + concorrência + ABI + política**, com resultados e prazo. Suporte a texto não aprova automaticamente visão, tools ou contextos maiores.

## Faixas de memória: possibilidades a qualificar

Faixas não prometem que um modelo caiba. Pesos, estados, buffers, outra utilização e a unidade indivisível da engine determinam a admissão.

| Memória nominal ilustrativa | Caminhos previstos | Limitações a testar |
|---|---|---|
| Até 8 GiB | Modelos menores/quantizados; componentes pequenos de C | VRAM efetiva menor; nenhum compromisso de hospedar camada K3 |
| 10–16 GiB | Modelos compactos, quantizados, contexto menor; blocos aprovados | INT4 não resolve kernel ausente ou estados grandes |
| 20–32 GiB | A em perfis medidos; C por blocos; multi-GPU local | Qwen3-8B BF16/8K/1 sessão em 24 GiB ainda precisa medição |
| 40–64 GiB | Modelos maiores, mais contexto/concorrência ou vários blocos | Throughput e preço dependem do acelerador e da carga |
| 80–192+ GiB | Ilhas B, estágios maiores de C, referência de modelos gigantes | Interconexão, kernel, software e estado continuam limitantes |
| Memória unificada CPU/GPU | Perfis específicos Apple/AMD/Intel quando suportados | Não contar a mesma memória como RAM livre e VRAM dedicada |
| Várias GPUs por host | B local ou atribuições A independentes | Inventário por placa; falha do host é compartilhada |
| CPU + GPU/offload | Perfil opcional com RAM/NUMA e tempo medidos | RAM não é VRAM; pode falhar no gate interativo/econômico |

Uma GPU de 8 GiB não precisa executar o mesmo modelo ou bloco de uma de 80 GiB. Ela contribui para configuração demandada e compatível, recebe a tarifa da capacidade útil e pode gastar créditos em outro modelo disponível.

## Fabricantes, sistemas e engines

Em 13/09/2026, vLLM documenta caminhos CUDA, ROCm, Intel XPU e Apple por plugin comunitário; isso não afirma paridade de modelos/recursos. llama.cpp apresenta CUDA, ROCm, Metal, SYCL e Vulkan com diferenças de features. São caminhos de avaliação, não suporte implementado no NETWORK AI. [vLLM GPU](https://docs.vllm.ai/en/stable/getting_started/installation/gpu/), [quantização](https://docs.vllm.ai/en/stable/features/quantization/), [llama.cpp build](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md), [matriz de features](https://github.com/ggml-org/llama.cpp/wiki/Feature-matrix).

| Coorte | Entrada planejada | Gate |
|---|---|---|
| NVIDIA Linux, 24 GiB Ampere/Ada | Primeiro serviço A com vLLM | Testar 3090/4090 individualmente; BF16 não implica MXFP4 eficiente |
| NVIDIA antiga/recente, outras capacidades | Novos perfis quando suportados | Compute capability, dtype, kernels, driver, memória e performance |
| AMD Linux | ROCm por dispositivo/configuração | Imagem própria, quantização e paridade; E11 |
| Intel GPU Linux | XPU por dispositivo/modelo | Recursos por engine; llama.cpp/SYCL é alternativa se justificada |
| Apple Silicon/macOS | MLX/exo e/ou Metal dedicado | Memória unificada; começa A/B privado; C entre backends é pesquisa |
| Windows NVIDIA via WSL2 | Coorte separada após Linux | Jogos, sleep/resume, reinício WSL, memória, observabilidade e cancelamento |
| Windows nativo AMD/Intel/NVIDIA | Caminho específico da engine | Não herdar perfil Linux; eventual llama.cpp passa gates próprios |
| CPU-only/iGPU/kernel ausente | Pesquisa/opcional | Lease apenas se cumprir workload aprovado, desempenho e orçamento |

WSL2 tem restrições específicas de driver, gestão e memória; não copiar capacidades do Linux físico. [NVIDIA WSL](https://docs.nvidia.com/cuda/wsl-user-guide/index.html). A matriz de quantização varia por implementação e geração; usar allowlist versionada, não inferir suporte pelo número de bits.

## Mistura dentro de uma execução

1. **A:** distribuir sessões entre GPUs diferentes quando todas atendem a configuração e os limites anunciados. Modelo e custo ficam fixos para a sessão.
2. **B:** cluster expõe capacidade como unidade e conserva inventário por GPU. Heterogeneidade interna exige suporte da engine e testes. TP/EP síncrono pode ficar limitado pelo dispositivo mais lento.
3. **C, mesma família de backend:** atribuir quantidades e tipos de componentes conforme memória e tempo de serviço. Dividir igualmente camadas entre GPUs desiguais não é default; minimizar caminho crítico e preservar cobertura.
4. **C, backends distintos:** CUDA/ROCm/Metal/XPU numa rota exigem ABI de tensores/estados e paridade ponta a ponta. Sem qualificação conjunta, atendem grupos/rotas separados.

Uma configuração C pode fixar conjunto de builds por papel/perfil num manifesto composto. Esse conjunto participa do digest imutável. Trocar cálculo, engine, parser, quantização ou layout fora dele cria nova configuração. Compatibilidade de fio não prova equivalência numérica.

Quando a menor unidade não cabe: buscar host maior; agrupar GPUs locais com paralelismo validado; pesquisar particionamento mais fino; ou publicar outra quantização após validação e escolha explícita. Se nenhuma opção existe, não há rota para aquele nó/modelo. Para K3, E04 decide isso incluindo AttnRes e kernels, sem regra genérica de experts.

## Múltiplos modelos

Candidatos com revisão/tamanho verificados no [05](05_MODELS_AND_DISTRIBUTION.md): Qwen3-8B/32B, Llama 3.1-70B, Kimi Linear e Kimi K2.5/K2.6/K2.7-Code/K3. A lista é inicial; não é ranking nem catálogo operacional. Compactos adicionais, embeddings/rerank e outras modalidades exigem ficha própria.

| Workload | Critério de catálogo | Alocação |
|---|---|---|
| Chat geral | Qualidade PT-BR, latência, contexto, preço | A/B, réplicas próximas; C após gate |
| Código/tools | Sucesso de tarefas/testes, JSON e IDs de chamadas | Parser validado; tools executadas no consumidor |
| Raciocínio/modelos gigantes | Qualidade, reasoning tokens, prazo/custo visíveis | B/C qualificados; orçamento/contexto específicos |
| Multimodal | Encoder/projetor, limites de imagens/frames, memória | Componentes auxiliares explícitos; texto-only não aprova visão |
| Contexto longo | Total de tokens e concorrência medidos | Pools KV/SSM próprios; model card não vira limite público automático |
| Embeddings/rerank, futuro | Recuperação, dimensões, batch, API própria | Filas/workers específicos; fora do contrato Chat Completions inicial |

No desenho inicial o usuário escolhe o modelo; o scheduler escolhe recursos. Seleção automática de modelo é expansão opt-in. Créditos comuns não significam preços iguais ou disponibilidade permanente de todos os modelos.

## Placement conjunto e concorrência

Manter demanda por grupo/faixa horária, custo de load, cobertura, slots e desempenho. Elegibilidade não é alocação: um domínio pode ser candidato a vários grupos, mas cada byte e parcela de compute reservados pertencem a allocations concretas com trava/versionamento comum.

MVP: uma atribuição de engine por GPU; múltiplos modelos no host podem usar dispositivos diferentes. Coexistência na mesma GPU exige perfil conjunto posterior: soma de pesos + pools + buffers + margem dentro do budget e desempenho/isolamento combinados aprovados. Aprovação isolada de dois modelos não aprova sua convivência.

Priorizar fechar capacidade utilizável. Evitar réplicas sem demanda enquanto outro grupo perde camada necessária. Não retirar nó de rota gigante ativa para aliviar fila pequena sem drenagem/substituição. Contingência tem orçamento e domínio de falha próprios.

Tarifas de contribuição usam capacidade útil por função/configuração, não fabricante ou VRAM isolados. Camada rara necessária recebe reserva útil mesmo com poucos tokens. Preço de inferência usa unidades aprovadas da configuração e não tempo lento autodeclarado.

## Cenários de aceite

| Cenário | Comportamento | Prova |
|---|---|---|
| 8/12/16/24/48/80 GiB na mesma rede | Atribuições elegíveis por dispositivo; incompatíveis recusadas | E11 e placement misto |
| Mesma VRAM, velocidades diferentes | Divisão/tarifa por perfil; evitar elo lento | E07/E08 e benchmark por função |
| Modelos disputam a mesma GPU | Reserva única; fila/troca gradual; sem dupla emissão | E08/E10 e teste de concorrência |
| Modelo/revisão/quantização muda | Nova configuração, download validado e drenagem | Digest incompatível rejeitado antes de Start |
| Contexto cresce | Validar entrada total + saída máxima a cada pedido | Rejeição previsível antes de OOM |
| Jogo/processo reduz capacidade | Pausa imediata ou drenagem escolhida; reduzir admissão | Interferência real; sem promessa de isolamento absoluto de VRAM |
| Sleep/reboot/reset de driver | Invalidar capacidade anterior, interromper/conciliar, requalificar | E09 e boot_id/epoch |
| Duas GPUs perdem host/rede | Mesmo domínio de falha | Contingência em outro host/rota |
| Kernel/engine desconhecido | Erro explicativo; sem código remoto arbitrário | Matriz negativa e diagnóstico |
| Pesos cabem, estados não | Recusar perfil/contexto/concorrência | Pico de load/prefill/decode medido |
| Memória unificada sob pressão | Preservar budget comum e reserva do SO | Sem duplicação RAM/VRAM |
| Link vira relay/perde upload | Reavaliar admissão; respeitar envelope atual | E05/E09 e quota de tráfego |
| Modelo sem capacidade | Fila limitada ou indisponibilidade | Nenhuma substituição silenciosa |
| Combinação ainda não testada | `unqualified`, motivo e experimento associado | Sem selo genérico de todas as GPUs suportadas |

Expandir esta matriz com incidentes e novos candidatos. A cobertura documentada organiza cenários conhecidos; testes e operação determinam o suporte real.
