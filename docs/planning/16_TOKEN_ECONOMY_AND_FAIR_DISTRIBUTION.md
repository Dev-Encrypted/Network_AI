# Economia de tokens de uso e distribuição justa

Proposta revista em **13/09/2026**: cooperar deve funcionar sem compradores em dinheiro. Os documentos [20](20_COOPERATIVE_ECONOMY_AND_ELASTIC_LIMITS.md) e [22](22_POLICY_CLOSURE_AND_CONTINUITY.md) definem a política atual, incluindo circulação e reserva; o [18](18_OPEN_NETWORK_AND_COMPUTE_MARKET.md) mantém nó aberto, publicação comunitária e mercado opcional. Este documento detalha remuneração, preços e justiça. Percentuais e tarifas são hipóteses a medir.

## 1. A decisão sobre a unidade

| Termo | Significado | Exemplo ilustrativo |
|---|---|---|
| Token de uso, TU | Crédito cooperativo de serviço ganho por contribuição útil verificada | Carteira de serviço com 120 TU |
| Token processado | Unidade do tokenizer de uma configuração | 2.000 tokens de entrada e 500 de saída |
| Saldo financeiro | Pagamentos efetivamente recebidos, em ativo/unidade identificados | Receita de uma API comercial |
| Limite elástico | Oportunidade temporária de usar capacidade ociosa | Mais concorrência enquanto não há fila concorrente |

**1 TU = 1.000.000 microTU**; valores inteiros com unidade tipada e strings decimais na API. Identificar `coop_network_id`. Dinheiro usa `payment_unit_id` e quantidades atômicas próprias; não existe conversão automática, paridade ou retirada financeira de TU cooperativos. NC→TU renomeia somente exemplos antigos de serviço; não existe banco implantado a migrar.

TU não equivale universalmente a um token de texto, segundo de qualquer GPU ou quantia em dinheiro. Tokenizer, arquitetura, contexto, cache e precisão diferem. O usuário poderá contribuir numa configuração compatível e gastar seus TU em outra disponível e elegível, pagando sua tarifa.

Esta revisão corrige a associação anterior de todo ganho a depósitos. **Emissão cooperativa tem orçamento de capacidade; pagamento comercial tem fundos.** Ambos exigem capacidade física disponível, compromissos registrados e proteção contra gasto duplo. Token especulativo e consenso próprio não foram assumidos.

## 2. O que a distribuição precisa garantir

1. **Contribuição equivalente recebe tarifa equivalente.** Medir o serviço reservado, incluindo seu papel na execução e as condições de rede. Marca, quantidade de contas e preço de compra da placa não determinam recompensa.
2. **Capacidade necessária pode ganhar enquanto aguarda pedidos.** A remuneração continua baseada em disponibilidade útil solicitada pela rede. Não depende exclusivamente de produzir tokens de saída.
3. **O consumidor conhece e limita o gasto.** Cotação, tarifa, modelo, contexto, máximo de saída e prazo ficam registrados antes da execução.
4. **Saldo acumulado não compra preferência na fila cooperativa.** Ofertas comerciais podem vender concorrência reservada explícita; isso compra capacidade definida, não prioridade sobre toda a rede.
5. **A rede limita promessas novas ao que consegue oferecer.** Contar saldos, reservas e ganhos já contratados; não tratar capacidade prevista como receita realizada.
6. **O pool não apaga ganhos liquidados automaticamente.** TU não expira automaticamente; condições financeiras aplicam-se apenas ao saldo comercial. Preços futuros precisam estar explícitos; preservar o número de TU não garante poder de compra constante. Nenhum reajuste muda sessão ou tarifa de lease já aceita.

Não prever distribuição inicial para fundadores, remuneração por guardar saldo, indicação em cadeia ou multiplicador permanente para contas antigas. Administração e suporte têm custo real; criar TU para o operador não paga essas despesas.

## 3. Como pagar GPUs diferentes

### Qualificar o serviço antes de estabelecer a tarifa

O inventário do [15](15_HETEROGENEOUS_HARDWARE_AND_CATALOG.md) identifica combinações de dispositivo, memória utilizável, engine, modelo, quantização, contexto, papel, rede e confiança. Benchmark por carga representativa produz a classe de serviço. Uma mesma GPU pode ser excelente para um modelo e inadequada para outro.

| Situação | Tratamento econômico |
|---|---|
| GPU menor executa um modelo compacto completo | Pode receber pela capacidade desse serviço e gastar TU em qualquer configuração permitida pelo saldo e pela política de confiança |
| GPU maior sustenta mais sessões úteis | Pode receber mais pela capacidade adicional realmente reservada e qualificada |
| GPU participa de uma rota de modelo gigante | Recebe pela parcela contratada da rota, respeitando seu orçamento total |
| Muita VRAM, mas conexão inadequada à rota interativa | Procurar uma configuração compatível; não remunerar como se o requisito de latência estivesse atendido |
| Dois dispositivos no mesmo host | Medir recursos distintos e interferência; um dispositivo duplicado em duas identidades não cria capacidade |
| GPU está online, mas não há demanda ou cobertura a contratar | Mantê-la elegível, com previsão informativa; não prometer ganho automático |
| Réplica pronta de contingência | Remunerar quando expressamente contratada dentro da reserva aprovada; não contá-la também como throughput primário disponível |

Não pagar por armazenamento isolado, download, loading, aplicativo aberto ou minutos autodeclarados. READY e SERVING podem receber a mesma tarifa contratada quando representam a mesma reserva útil. Uma máquina lenta não aumenta seu ganho por demorar para concluir um pedido: ela recebe a tarifa da classe admitida pelo intervalo aceito, sem bônus por duração da requisição.

### Contratar primeiro, emitir depois

O scheduler escolhe reservas que completam serviços úteis, considerando demanda, cobertura mínima e contingência. Antes de propor o lease cooperativo, reserva TU existentes e o teto de emissão complementar dentro dos limites dos documentos 20/22. No lease comercial, reserva pagamento a partir dos fundos disponíveis do contratante. O contribuidor vê configuração, recursos, duração, tarifa, estimativa de energia quando disponível e condições de interrupção. A tarifa é fixada no aceite, inicialmente por até 15 minutos.

```text
ganho_microTU = floor((ms_verificados_acumulados × tarifa_microTU_por_segundo) / 1000)
```

Carregar o resto da divisão entre janelas do mesmo lease. Reconciliação não pode premiar quem fragmenta recibos. Ganho cooperativo verificado transfere TU previamente retidos ou transforma compromisso de emissão em TU disponível, sem duplicar o total contratado. Pagamento comercial transfere fundos reservados ao provider. Encerramento libera somente a parte ainda não emitida ou paga, conforme a modalidade. Outra GPU entrar ou sair não altera retroativamente a tarifa aceita.

Para um conjunto de reservas equivalentes e com mesma duração, uma forma auditável de calibrar as tarifas é `r_i = lambda_grupo × peso_util_i`, respeitando `soma(r_i × duração_máxima_i) <= orçamento_grupo`. Os pesos são definidos por benchmarks e pelo papel útil aprovado. A tabela é publicada antes dos aceites; não redistribuir o orçamento inteiro a cada heartbeat. Orçamento cooperativo não utilizado não é emitido; fundos comerciais não utilizados permanecem com o financiador.

Em uma rota distribuída, decompor o custo de referência da rota em parcelas `a_k = custo_referência_k / soma(custos_referência)`. Essas parcelas distribuem o orçamento dos componentes, com `soma(a_k) = 1`. O custo de referência é medido em ambiente qualificado, com memória, execução e comunicação pertinentes; não é o tempo declarado pelo próprio worker. Hospedar duas parcelas recebe sua soma. Dividir uma parcela em novas identidades não aumenta o orçamento nem seu peso total.

Em oferta sob demanda, a parcela dos providers vem da chamada e segue as mesmas proporções úteis. Não acumular emissão cooperativa integral e pagamento comercial integral pela mesma alocação/intervalo. Não pagar a tarifa de uma GPU inteira por cada expert lógico. Se uma falha em outro componente interromper a rota, honrar o intervalo de disponibilidade dos leases válidos dos demais até sua drenagem contratada. O risco pertence ao orçamento de contingência; a falha alheia não transforma trabalho observado em dívida do contribuidor. Suspender novas reservas de fragmentos sem uma rota útil aprovada.

### Dar oportunidade sem premiar identidades extras

Reservar inicialmente até **5% das oportunidades de admissão compatíveis** para qualificação de novos participantes quando houver candidatos e necessidade. São reservas normais dentro do orçamento, não uma emissão extra. Publicar taxa de seleção e motivos de espera por classe; usar rotação entre ofertas equivalentes para evitar que disponibilidade antiga monopolize os leases.

Ausência de garantia de identidade física é uma limitação real. Identidade de conta, sinais correlacionados, challenges concorrentes e limites globais reduzem o problema; não provam que cada conta é uma pessoa ou GPU diferente. IP compartilhado sozinho não autoriza bloqueio. Limites por operador conhecido reduzem dependência operacional; inventar identidades não deve gerar bônus por dispositivo, por cadastro ou por primeiras horas.

Bônus por trabalho, por autochamadas e por volume bruto de tokens fica desabilitado. Escassez pode alterar uma **tarifa futura publicada**, com evidência de demanda independente e teto de orçamento, mas não concede ao próprio nó o poder de declarar sua raridade. Antes de introduzir multiplicadores, medir se a seleção de leases já resolve o déficit.

## 4. Distribuição cooperativa e limites

Na cooperação, contribuição READY útil, contratada e verificada gera TU mesmo com receita monetária zero. O consumo aceito recompõe a reserva até seu alvo e queima o restante; a tarifa do consumidor não muda. Não há segundo prêmio por autochamada. Modelo publicado sem reserva útil aprovada não recebe emissão global automaticamente.

A política consolidada no [24](24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md) mantém o limite prudencial abaixo. Reposição segue piso operacional → reserva protegida → alvo operacional → queima; o limite de estoque não substitui a prova de fluxo recorrente.

```text
E = S_disponivel_e_retido + L_ainda_nao_emitido + J_reversoes_de_TU_queimados_aprovadas_pendentes
nova_promessa_TU <= min(max(0, 0.35 × C_ref_7_dias - E), folga_epoca, folga_grupo)
```

C_ref é capacidade cooperativa conservadora, por modelo/horário e recursos realmente compatíveis, com cesta e preços de referência fixados. Deduzir comercial confirmado, overhead e contingência. Alvo 35%, alerta 50% e crítico 80% são hipóteses de controle, não garantia de compra ou previsão de solvência. Reajuste nominal de tarifa não fabrica cobertura.

A rede pode contratar cobertura inicial e emitir TU antes das primeiras chamadas, conforme o bootstrap limitado do 24, sem saldo inicial fictício. Se todo consumo continuar zero e o estoque crescer, limitar novos compromissos; não emitir por tempo ilimitado apenas por estar online. Na fase madura, testar se o consumo reciclado cobre a operação sem emissão ordinária, uso da reserva protegida ou aporte extraordinário. Essa situação difere de zero compradores: participantes podem consumir bastante sem nenhuma venda monetária.

Grants de entrada não exigem receita financeira. Limitam-se a 2% da emissão cooperativa total aprovada e aos tetos de estoque/campanha: `grants_emitidos + grants_pendentes <= floor(emissao_a_contribuidores / 49)`. Criar conta não abre orçamento. Épocas são dias UTC; contratos que atravessam o dia reservam todas as parcelas antes do aceite, sem duplicar compromisso entre níveis.

No mercado, depósitos, pagamentos e retiradas seguem o [07](07_CREDITS_AND_LEDGER.md). Nenhum TU cooperativo vira automaticamente ativo sacável. Recursos/intervalos comerciais precisam de fundos confirmados e capacidade física sem sobreposição.

Na baixa demanda, aumentar limites temporários dos participantes com saldo e capacidade compatível. Isso não emite TU, não reduz automaticamente a tarifa e não acumula direito de ocupar o pico seguinte. Na queda de oferta, suspender extras primeiro; honrar sessões e leases válidos já aceitos, recalcular futuros compromissos e executar contingência. Apagar saldo ou interromper indiscriminadamente todas as reservas não é solução.

## 5. Como o usuário gasta e entende o valor

### Tabela por configuração, com preço de entrada e saída

Cada configuração publica TU por 1.000 tokens de entrada sem cache, entrada com cache confirmado e saída, incluindo reasoning quando cobrado. Contexto, precisão, ferramentas e confiança ficam identificados. A prática de tarifas distintas para entrada, saída e cache aparece em APIs existentes; os valores da rede exigem medição própria. [Documentação de preços da Anthropic](https://platform.claude.com/docs/en/about-claude/pricing).

| Perfil exclusivamente fictício | Entrada / 1.000 | Cache / 1.000 | Saída / 1.000 | Pedido de 2.000 entrada + 500 saída |
|---|---:|---:|---:|---:|
| Compacto | 1 TU | 0,25 TU | 4 TU | 4 TU |
| Médio | 4 TU | 1 TU | 16 TU | 16 TU |
| Gigante | 20 TU | 5 TU | 80 TU | 80 TU |

Os perfis acima **não atribuem preço ou desempenho a Qwen, Llama ou Kimi**. No exemplo, 120 TU pagariam 30 pedidos compactos, sete médios com sobra de 8 TU, ou um gigante com sobra de 40 TU. Pedidos reais variam de comprimento; a estimativa deve identificar a carga usada e arredondar para baixo quando mostrar pedidos inteiros.

No perfil compacto, com 2.000 tokens de entrada e máximo de 1.000 de saída, reservar 6 TU. Se a saída final tiver 500 tokens, consumir 4 TU e liberar 2 TU. Para o perfil gigante, a mesma autorização reserva 120 TU e a mesma execução consome 80 TU. Não converter saída de um modelo em saída de outro sob a justificativa de saldo comum.

A tarifa deve cobrir o custo em TU das reservas necessárias, capacidade ociosa útil, recuperação e verificação, dividido pelo trabalho **realisticamente resgatável**, não pelo throughput de pico. A cobertura de despesas em dinheiro é outra conta, apresentada na seção 8. Nunca recalibrar a cobrança conforme o tempo que um worker afirma ter levado.

### Previsibilidade de cobrança

- Cotação válida inicialmente por 60 segundos para admissão; aceitação atômica do hold fixa preço e versão até o fim da sessão autorizada.
- Entrada usa tokenizer fixado e teto conservador sem cache; desconto só após hit confirmado. Saída total, incluindo unidades internas cobradas, precisa caber no máximo autorizado.
- Tarifa ordinária muda no máximo uma vez por dia, com aviso mínimo de 48 horas e variação inicial máxima de 10% por configuração, conforme a consolidação do 24. Esses parâmetros precisam de teste de estabilidade; indisponibilidade pode suspender novas admissões sem reajustar sessões aceitas.
- Perfil qualificado do pool: falha de infraestrutura interrompendo tentativa tem estorno conforme o [07](07_CREDITS_AND_LEDGER.md), com reabertura de TU ou fundos da reserva identificada, conforme o modo. Ofertas independentes publicam sua política antes do aceite. Cancelamento cobra uso comprovado conforme contrato; fila expirada antes da execução custa zero.
- Para novos produtos de estado persistente ou execução flexível, publicar tarifa e prazo próprios. Não introduzir uma taxa invisível de GPU parada. `rate_state = 0` no perfil inicial.

O primeiro pool de referência começa com um perfil de serviço por configuração; o mercado pode anunciar outras ofertas e classes explicitamente. Uma fila flexível posterior pode oferecer desconto apenas quando batching, ociosidade ou prazo realmente reduzirem custo. Hipótese de teto futuro de 30%, com desconto inicial de **zero** até medir economia líquida. Não prometer desconto financiado por inflação de TU.

### Carteira e contribuição compreensíveis

Mostrar saldo disponível, reservado, ganho em verificação, ganho liquidado, consumo e estornos, sem somar campos históricos ao saldo atual. Antes de uma sessão, exibir modelo/configuração, política de confiança, custo máximo, estimativa de custo e fila estimada com incerteza.

No painel de contribuição, mostrar “elegível sem reserva”, “reserva aceita”, “verificando” e “ganho liberado”. Exibir TU/h contratados e quanto essa hora compraria em exemplos publicados de modelos disponíveis. Estimativa de energia, quando suportada e autorizada, inclui a fonte e o intervalo; consumo elétrico local não implica remuneração financeira. Se o uso não compensar para o participante, ele deve poder pausar localmente.

## 6. Fila justa entre contas e modelos

Primeiro verificar modelo, confiança, saldo, orçamento máximo e recursos. Depois disputar capacidade por conta/tenant, agregando suas chaves de API. O saldo não entra no peso de prioridade. Uma pessoa com 10.000 TU não deve ocupar a fila inteira enquanto outra com saldo suficiente para uma chamada espera indefinidamente.

A implementação inicial deve experimentar round-robin com déficit por conta e custo estimado de recursos da configuração. Déficit é crédito de agendamento efêmero, sem valor de carteira ou conversão em TU. Aplicar o controlador 1×/2×/4× do 20, com promoção gradual, slots reais, saldo e ausência de fila concorrente. Extras têm prazo contratual máximo inicial de 60 segundos e não ampliam contexto. Na chegada de concorrência, cessar novas admissões extras imediatamente; sessões aceitas concluem dentro do preço e prazo acordados. O limite não é capacidade garantida nem saldo acumulável.

Aplicar cotas também no pai do tenant para não multiplicar prioridade com chaves ou subcontas conhecidas. Uma só conta usando vários modelos continua sujeita ao seu limite agregado. Separar capacidade por configuração e manter reservas completas nas rotas que precisam de várias GPUs ao mesmo tempo. Não somar tokens brutos de modelos diferentes como custo computacional equivalente.

Requests grandes acumulam déficit até ficarem elegíveis, sujeitos a teto de contexto e deadline, evitando starvation por tamanho. Medir espera por classes comparáveis e considerar chunked prefill somente em engines qualificadas. A fila pode expirar e liberar o hold; deve apresentar claramente esse prazo. Não garantir ausência de starvation sob demanda infinita ou identidades adversárias ilimitadas.

Comparar a política em bancada com **Dominant Resource Fairness** e **DRFH**, que discutem justiça em recursos múltiplos e servidores heterogêneos. Suas propriedades matemáticas dependem de hipóteses específicas; não são automaticamente garantias para nossa WAN, gang scheduling e operadores hostis. [Ghodsi et al., NSDI 2011](https://www.usenix.org/conference/nsdi11/dominant-resource-fairness-fair-allocation-multiple-resource-types), [Wang, Li e Liang, 2013](https://arxiv.org/abs/1308.0083).

## 7. Fraude, concentração e incentivos

| Estratégia ou risco | Regra que reduz o incentivo | Limite que precisa ser medido |
|---|---|---|
| Abrir muitas contas para a mesma GPU | Sem bônus por identidade; teto por recurso/rota; classes e desafios concorrentes | Unicidade física não é demonstrada apenas por UUID, IP ou assinatura |
| Fazer chamadas para si mesmo | Sem bônus por tokens produzidos; pedido transfere/queima TU existentes e não aumenta a tarifa ou orçamento de lease | Autoconsumo pode manipular a previsão de demanda; precisa de análise de concentração |
| Declarar disponibilidade inexistente | Recibos pendentes, evidência externa e emissão/pagamento limitados ao orçamento do modo | Probes podem falhar; medir perda e falso positivo, restringir contratos do pool quando necessário |
| Reter componente raro para exigir mais | Tarifa aceita fixa, contingência e busca de substitutos | Dependência concentrada de uma rota continua um risco real |
| Manter saldo enorme e dominar consumo | Concorrência e fila por participante, sem peso por saldo | Detecção de participantes correlacionados é incompleta |
| Induzir timeout ou repetir recibos | Cobrança por uso aceito; idempotência, teto, estorno e conciliação | Infraestrutura pode absorver trabalho sem receber; prever orçamento |
| Governo do protocolo favorecer insiders | Regras e alterações versionadas, exposição agregada e exceções revisáveis | Transparência não substitui operador responsável e auditoria |

Fraude confirmada pode suspender futuras atribuições e acionar uma disputa documentada. Não criar confisco automático de todo saldo por resposta não determinística, IP compartilhado ou suspeita isolada. Correções dependem de evidência e lançamentos de ajuste, preservando o histórico.

A distribuição é justa quando recompensas e acesso são explicáveis, contestáveis e proporcionais à contribuição aceita. Não exigir igualdade de ganhos entre serviços com capacidades diferentes, nem usar concentração de saldo isoladamente como prova de fraude.

## 8. Capacidade, fundos e custo real

Monitorar capacidade por modelo/horário, estoque e compromissos de TU, fundos financeiros confirmados e custo operacional. Um journal que concilia não prova lucro ou capacidade futura. Utilidade cooperativa pode existir sem vendas; energia, hardware, conectividade e operação continuam sendo custeados por participantes, orçamento inicial, rateio ou patrocínio.

O [18](18_OPEN_NETWORK_AND_COMPUTE_MARKET.md) detalha venda de API, divisão financeira ilustrativa 90/6/2/2 e retirada. É uma trilha opcional que deve sustentar seus custos reais, sem prometer transformar TU de cooperação em dinheiro.

No pool misto de referência, partir de capacidade segura já descontada de overhead/contingência. Hipótese inicial: preservar ao menos 75% para cooperação e limitar reservas comerciais a 25%. Na ausência de reserva comercial, cooperantes podem usar 100% da capacidade segura. São condições voluntárias do pool; cada nó declara sua alocação. Capacidade comercial com início futuro só pode ser emprestada se a sessão terminar antes do prazo.

```text
variacao_TU_gastavel = emissao_cooperativa + estornos - consumo_aceito
variacao_financeira_interna = depositos_confirmados - saidas_financeiras_liquidadas
resultado_operador = receita_financeira_recebida - custos - provisao_de_contingencia
```

Transferências comerciais internas se cancelam na soma financeira; taxas externas são saídas. TU é obrigação de serviço do registro cooperativo, sem equivalência financeira. Medir benefício por hora de contribuição, tarefas acessíveis, espera e energia. Retirada existe para ganhos comerciais, não para créditos cooperativos.

## 9. Governança de uma economia ajustável

A parte “inteligente” deve ser observável: previsão recomenda demanda e capacidade; controlador de cada pool aplica limites, respeita contratos e registra decisões. Nenhum agente de IA recebe autorização irrestrita para transferir fundos, alterar preço aceito ou apagar saldo. Ofertas independentes não dependem de uma tabela global administrada pela empresa.

Publicar versões de tarifas, metodologia de capacidade, fundos/orçamentos agregados, oferta por configuração, pagamentos, estornos, compromissos, fila e custo de verificação. Não publicar prompts, dados pessoais, topologia sensível ou ganhos individuais sem autorização. Tarifas futuras e critérios novos têm aviso; mudança de parâmetro não altera recibos aceitos.

Registrar cada decisão com `policy_version`, `capacity_snapshot_id`, `reference_basket_version`, `rate_card_id`, janela de demanda, limites, razão e autor/revisor quando administrativo. Ajustes extraordinários têm prazo e teto próprios. Na rede aberta atual, cada operador declara suas obrigações e referencia a liquidação comum; banco próprio, DHT e assinatura não criam saldo global.

## 10. Implantação e critérios de aceitação

| Etapa | Entrega | Critério para avançar |
|---|---|---|
| Planejamento atual | Unidade, contratos, política de pools e simulações 17/19/21 com escopos distintos | Contas reproduzíveis e revisões cooperativa 20 e comercial 18 integradas; nenhuma alegação de teste em GPU |
| Bancada de capacidade | Medir pelo menos duas configurações e classes de GPU distintas, quando qualificadas | Capacidade útil, overhead, energia, falhas e qualidade por perfil; tarifas derivadas de medições |
| Piloto privado de 7 dias | Zero compradores; READY, TU, consumo, limites elásticos e conciliação | Zero diferença contábil; nenhuma promessa acima de budget; consumo e custo observados |
| Piloto limitado de 30 dias | Diversidade de hardware, horários e demanda, com limites de admissão | Filas, cobertura, abuso, resgates e caixa dentro de limites publicados; corrigir falhas antes de ampliar |
| Abertura do pool qualificado | Ofertas com condições demonstradas, dentro do registro aberto | Histórico, recuperação, suporte e fundos; recusas do pool não proíbem ofertas em outros operadores |
| Rede aberta | Operadores e liquidação independentes conforme o 18 | Três operadores, gateways/indexadores alternativos e nova contratação/retirada sem servidor original |

Critérios quantitativos iniciais: zero microTU de divergência; zero cobrança acima da autorização; zero pagamento legítimo acima do teto previamente reservado; soma de alocações físicas sem duplicação; mesmas tarifas para a mesma classe e contrato; grants cooperativos dentro do teto de emissão/capacidade e grants comerciais dentro dos fundos disponíveis. Comparar tempo de espera e taxa de admissão de participantes equivalentes sob carga controlada, registrando intervalos e exceções; um primeiro alvo é razão de p95 de espera de até 2 entre coortes equivalentes, sem tratá-lo como garantia pública antes da bancada.

Também medir utilidade: uma hora de contribuição compra quais tarefas nos modelos disponíveis, com que espera e custo elétrico estimado? Comparar experiência com rodar localmente quando isso for possível, sem presumir equivalência entre modelos. Se a proposta não entrega benefício suficiente para uma classe de GPU, ajustar oferta, tarifa futura ou suporte daquela classe; não esconder o problema aumentando apenas o número nominal de tokens.

Itens executáveis estão nos EP09/EP10/EP11 do [backlog](12_ROADMAP_AND_BACKLOG.md). Tarifas reais, pesos de capacidade, parâmetros de risco e modelo comercial permanecem dependentes de medições. O plano define os limites e a forma de decidir, sem prometer resolver todos os cenários antes de observá-los.
