# NETWORK AI: uma rede cooperativa de inferência com GPUs heterogêneas

**Concepção e direção:** [Dev-Encrypted](https://github.com/Dev-Encrypted)  
**Versão:** 14/09/2026 · pesquisa e primeiros experimentos F0  
**Licença do texto original:** [CC BY 4.0](../LICENSES/CC-BY-4.0.txt)

**Atualização de implementação:** após o corte F0 deste artigo, foi construída a [aplicação privada v0.2](implementation/README.md), com inferência integrada, interface e contabilidade de laboratório. Os resultados econômicos abaixo continuam válidos como registro da configuração reprovada; a implementação não os converte em aprovação de uma rede pública.

## Resumo

NETWORK AI investiga uma rede em que participantes oferecem capacidade de inferência, hospedam modelos compatíveis e recebem tokens de uso pela disponibilidade útil contratada e verificada. O objetivo é permitir cooperação mesmo sem compradores em dinheiro. Uma API comercial poderá coexistir com essa rede, em uma contabilidade separada.

O projeto combina três problemas: executar modelos em hardware heterogêneo, coordenar participantes que podem falhar ou agir de forma adversarial e manter uma economia que não prometa mais capacidade do que a rede consegue entregar. A abertura do catálogo é um objetivo; suporte a cada combinação depende de evidência.

O primeiro incremento executou inferência local, transporte autenticado em loopback, um modelo dividido entre dois processos CPU e 5.600 simulações econômicas. A bancada comprovou comportamentos locais específicos. A configuração econômica foi reprovada. Este artigo apresenta o resultado junto da arquitetura candidata, sem transformar uma hipótese em operação já disponível.

## 1. Participar da rede

Um participante poderá oferecer uma GPU, um conjunto de GPUs próximas ou capacidade delimitada de inferência. A oferta identifica hardware, engine, revisão do modelo, quantização, contexto, concorrência e disponibilidade. A rede precisa verificar a capacidade antes de atribuir trabalho ou remunerar uma reserva.

O consumidor solicita um modelo e um perfil de serviço. A seleção de rota considera memória, desempenho observado, confiança e orçamento. Registrar um modelo no catálogo não cria automaticamente uma rota executável. Um modelo pouco procurado pode precisar de uma janela agendada ou de cobertura contratada pelos interessados.

O desenho permite contribuir para um modelo menor e usar TU em outro modelo. Isso exige tarifas e cobertura por perfil: uma unidade de trabalho de um modelo compacto não tem o mesmo custo de uma unidade de trabalho de um modelo grande. [Hardware e catálogo](planning/15_HETEROGENEOUS_HARDWARE_AND_CATALOG.md).

## 2. Três formas de executar inferência

| Modo | Execução | Evidência necessária |
|---|---|---|
| A | Modelo completo em um nó | Pesos, estados e carga cabem; qualidade e desempenho medidos |
| B | Modelo completo em um cluster próximo | Distribuição entre GPUs e interconexão adequadas à engine |
| C | Modelo dividido entre participantes | Particionamento, tráfego, estado, paridade e recuperação demonstrados |

O modo C é a hipótese mais exigente. A rede precisa transportar ativações e manter o estado de uma sessão entre fronteiras. Internet residencial, latência e desconexões podem impedir um perfil interativo, mesmo quando há memória agregada suficiente. GPUs próximas podem formar grupos rápidos para reduzir essas fronteiras.

No desenho candidato, Rust cuida do daemon e do transporte; engines como vLLM executam inferência nos perfis qualificados. Petals funciona como referência de pesquisa para blocos distribuídos. O plano de controle organiza ofertas, sessões e contratos, mantendo operações numéricas fora dele. O repositório atual implementa uma bancada parcial dessas decisões. [Arquitetura](planning/03_ARCHITECTURE.md), [tecnologias](planning/02_RESEARCH_AND_COMPARISON.md).

## 3. O que significa um token de uso

**TU não é sinônimo de token de texto.** Tokens de entrada e saída medem parte da carga de uma inferência. TU é a unidade contábil proposta para contribuir e consumir capacidade, usando tarifas específicas do perfil.

Também há distinção entre TU e dinheiro. A cooperação mantém seu saldo interno; a venda de API registra pagamentos, obrigações e repasses no fluxo financeiro. O desenho não oferece conversão automática entre os saldos. Uma venda comercial não deve usar capacidade já comprometida com uma sessão cooperativa.

O participante recebe pela duração da **reserva útil aceita e verificada**, à tarifa daquela atribuição. Isso permite remunerar prontidão durante uma janela sem pedidos, quando a rede contratou essa cobertura. Aplicativo aberto, arquivo baixado ou GPU declarada não bastam. Toda reserva tem duração, orçamento e verificação definidos. [Política v6](planning/24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md).

## 4. Evitar promessas sem cobertura

O ledger experimental separa saldos emitidos, compromissos futuros de emissão e reversões autorizadas. A exposição é `E = S + L + J`: saldo emitido livre ou retido, emissão já prometida e reversões aprovadas de TU queimados ainda não lançadas.

O desenho limita nova emissão pela capacidade de referência conservadora e pela exposição existente. O consumo pode recompor o orçamento de renovação, a reserva protegida e o orçamento normal; somente o excedente segue para queima. O bootstrap começa sem saldo fictício, mediante reservas reais verificáveis dentro dos limites propostos.

Essas restrições evitam determinadas inconsistências contábeis. Não garantem que participantes consumam seus saldos, que todos os grupos tenham liquidez ou que o preço cubra a oferta necessária. Por isso, o plano exige uma fase madura sem emissão ordinária que esconda déficit recorrente. [Ledger](planning/07_CREDITS_AND_LEDGER.md), [simulador](../benchmarks/python/network_ai_bench/economy.py).

## 5. Demanda baixa e limites maiores

Se uma rota dispõe de capacidade livre, usuários elegíveis podem receber mais concorrência ou quota temporária. O benefício termina quando a demanda concorrente retorna. Ele não deve ampliar o contexto sem medição nem conceder saldo duradouro.

Ausência de compradores em dinheiro difere de ausência de demanda cooperativa. A primeira não impede a proposta; a segunda deixa uma cobertura contínua sem consumo que a reponha. Tampouco basta haver GPUs ociosas: elas precisam estar disponíveis para o modelo e o perfil solicitados.

Os limites 1×/2×/4× estão no planejamento e em exemplos aritméticos. Ainda não foram integrados ao estudo de eventos F0. Os [exemplos interativos](../outputs/explanations/README.md) usam números hipotéticos e não substituem esse teste. [Cooperação e elasticidade](planning/20_COOPERATIVE_ECONOMY_AND_ELASTIC_LIMITS.md).

## 6. Resultados do primeiro incremento

Os experimentos ocorreram em um único computador, com Windows/WSL2, RTX 4090 de 24 GB e aproximadamente 128 GB de RAM. A GPU estava compartilhada com um modelo já carregado no LM Studio.

| Experimento | Resultado observado | Interpretação permitida |
|---|---|---|
| HTTP com modelo existente | 30/30 respostas visíveis corretas; TTFT p50 1,085 s e p95 1,870 s | Inferência real no perfil local descrito |
| BLOOM-560m dividido em CPU | 30 forwards com erro máximo de logits 0,0; três gerações com tokens iguais | Paridade no modelo, engine e entradas testados |
| Falha e substituição de servidor | Falha detectada; retomada em 5,50 s com logits iguais | Recuperação local com nova identidade autorizada pelo controlador |
| libp2p e Iroh | Controles de identidade, replay e tamanho exercitados | Proteções do protocolo de bancada em loopback |
| Qwen3-8B oficial | Artefatos e fixtures verificados | Preparação concluída; inferência BF16 pendente |
| Kimi K3 | Seis tensores de um expert carregados em CPU | Leitura parcial de pesos compactados, sem execução do expert |

A primeira tentativa HTTP usou um limite de saída insuficiente e misturou raciocínio com conteúdo visível na medição. Esse run permanece no histórico. O experimento corrigido é identificado separadamente. As falhas iniciais de integração do cliente Petals também foram preservadas.

Dois processos locais não equivalem a dois operadores independentes. Esses resultados não demonstram privacidade contra o dono da GPU, desempenho WAN, execução completa de Kimi ou suporte a qualquer modelo. [Relatório](execution/README.md), [reprodução](execution/REPRODUCE.md).

## 7. Por que a economia ensaiada foi reprovada

O estudo fixou cinco variantes, 16 cenários, 20 sementes de calibração e 50 sementes distintas de validação: 5.600 casos com 90 dias simulados cada. Velocidades, tarifas, recompensas e comportamento eram fictícios.

Todas as execuções preservaram as invariantes contábeis implementadas. Nenhuma passou em todos os critérios econômicos implementados. No cenário básico, a v6 concluiu 15,75% dos pedidos compatíveis com saldo na fase madura, contra a meta de 95%.

A cobertura essencial fictícia custava 168 TU por dia: uma rota compacta e uma rota grande com três provedores. A distribuição de pagamentos e consumo não fez os TU retornarem na mesma velocidade à operação. Provedores maiores acumularam saldo; outros grupos ficaram com pouca liquidez. O fim da emissão ordinária expôs a insuficiência do fluxo.

Priorizar o piso operacional melhora a ordem dos pagamentos, mas não cria demanda financiada. A próxima calibração precisa revisar cobertura, janelas, consumo e liquidez por grupo, usando novos parâmetros e novas sementes. Ajustar a política depois de observar o holdout não permite chamar uma repetição das mesmas sementes de validação inédita.

O estudo rejeita essa configuração, sem provar impossibilidade geral da cooperação. Também não cobre todos os predicados de retomada, elasticidade ou comportamento real. [Análise completa](execution/ECONOMY_V1_RESULTS.md), [protocolo](../benchmarks/economy-study-v1.json), [resumo verificável](execution/evidence/economy-v1-summary.json).

## 8. Abertura, confiança e governança

A proposta exige identidade portátil, ofertas inspecionáveis e operadores alternativos. A primeira hipótese do registro cooperativo é federada: quatro operadores independentes e quorum de três. Isso não constitui consenso permissionless equivalente ao Bitcoin.

Assinaturas identificam a origem das mensagens; não provam que a inferência foi calculada corretamente ou que duas identidades pertencem a GPUs distintas. Medição, custo de verificação e exposição a fraude precisam ser avaliados em conjunto.

Não há promessa de confidencialidade contra o proprietário do nó. Perfis privados, grupos de confiança e eventual computação confidencial têm requisitos próprios. Confiar no transporte não significa confiar no processamento remoto. [Segurança](planning/08_SECURITY_AND_TRUST.md), [rede aberta](planning/18_OPEN_NETWORK_AND_COMPUTE_MARKET.md).

## 9. Caminho para a próxima etapa

O avanço depende de evidência por perfil: GPU disponível para o Qwen3-8B oficial, outro host físico, medições de rede e recuperação, revisão econômica e contratos persistentes. Operadores independentes e campanhas reais precisam demonstrar continuidade antes da abertura.

A API comercial tem critérios adicionais de vendedor responsável, liquidação, repasses, contestação e saída. O caixa de operação e encerramento também precisa existir de fato. Nenhum desses requisitos é satisfeito por um saldo de laboratório.

O repositório publica a pesquisa para permitir inspeção, reprodução e contribuições. Os [gates](execution/GATES.md) identificam as lacunas; o [índice técnico](README.md) permite aprofundar cada decisão.

## Referências e citação

Fontes externas, revisões e snapshots estão em [Referências e evidências](planning/13_REFERENCES_AND_EVIDENCE.md). O corte da pesquisa é 13/09/2026; os experimentos são de 14/09/2026. Metadados upstream e projeções permanecem distintos de medições.

Ao citar o projeto ou adaptar este artigo, atribua **Dev-Encrypted**, informe título, versão e [repositório original](https://github.com/Dev-Encrypted/Network_AI). Use [CITATION.cff](../CITATION.cff). Créditos a bibliotecas e modelos estão em [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
