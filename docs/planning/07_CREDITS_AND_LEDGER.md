# Ledger cooperativo e ledger de pagamentos

## Unidade e autoridade

A regra vigente está consolidada no [24](24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md), com fundamentos nos documentos 20/22: **contribuição útil contratada e verificada gera ganho em TU sem compradores em dinheiro**, por circulação e emissão complementar limitada. TU tem 1.000.000 microTU; não é token de texto, saldo sacável ou promessa de conversão financeira. Identificar `coop_network_id` e versão da política.

O saldo comercial é separado, identificado por `payment_unit_id`, ativo/rede e escala, com quantidades atômicas. Somente depósitos e pagamentos efetivos o alimentam. Nenhuma razão 1:1 entre dinheiro e TU foi definida. NC→TU renomeia apenas exemplos históricos de serviço.

Usar inteiros de 64 bits com intermediários checados contra overflow, resto acumulado e strings decimais na API. PostgreSQL é a projeção/journal operacional de cada operador. O estado compartilhado exige registro verificável comum: consenso de serviço para TU e liquidação financeira para pagamentos, com CometBFT/ABCI e governança definidos no [22](22_POLICY_CLOSURE_AND_CONTINUITY.md). Um banco ou recibo local não cria saldo global. Falha da integração de pagamentos não deve interromper a cooperação se o registro de TU estiver saudável.

## Modalidades de remuneração

O [plano consolidado v6](24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md) é a regra econômica vigente. COOP_CONTINUITY agrega COOP_CORE_RESERVE e COOP_WORKING sem lançamentos próprios. Consumo finalizado recompõe piso operacional, reserva protegida e restante do alvo operacional, nessa ordem; queima somente o excedente. Operação normal usa WORKING e emissão autorizada; CORE_RESERVE só financia rotas essenciais na contingência prevista. Ambos integram S, sem duplicar o agregado. As tabelas abaixo indicam COOP_CONTINUITY como família de contas; os ensaios v4 preservam a conta única histórica.

| Modalidade | Origem do ganho | Condição |
|---|---|---|
| Reserva cooperativa | TU existentes retidos e emissão complementar limitada | Tempo útil contratado e verificado; fontes exclusivas cobrem remuneração única |
| Reserva comercial | Fundos do contratante | Tempo contratado e verificado, pagamento reservado antes do aceite |
| Inferência comercial sob demanda | Escrow do cliente | Uso aceito × tarifa financeira da oferta |

A mesma alocação/intervalo não recebe remuneração cooperativa integral e pagamento comercial integral. Recursos ou períodos distintos podem adotar modalidades diferentes, sem dupla reserva. Na cooperação, consumo recompõe COOP_CONTINUITY até alvo publicado e queima o restante; não paga um segundo prêmio por chamada. O provider ganha pelo READY contratado. Em spot comercial, recebe pela chamada sem reserva cooperativa simultânea.

```text
ganho_microTU = floor(ms_verificados_acumulados × tarifa_microTU_por_segundo / 1000)
```

Carregar o resto inteiro entre janelas do mesmo lease. Fixar tarifa no aceite, com lease inicial de no máximo 15 minutos. Benchmark classifica capacidade útil por configuração, papel, memória, prefill/decode, slots, banda, RTT e confiabilidade. Marca, preço da GPU, número de contas e VRAM autodeclarada não determinam remuneração.

Em C, componentes dividem o orçamento da rota; não multiplicar tarifa de GPU inteira por expert. Recursos no mesmo host exigem medição de interferência. Nó lento não aumenta cobrança declarando mais duração. Não há bônus automático por trabalho/autochamadas, publicação ou indicação. Reservas futuras dependem de demanda/cobertura útil e dos tetos do modo escolhido; ausência de vendas não impede cobertura cooperativa aprovada.

## Disponibilidade que pode ser paga

Janela válida exige lease aceito, configuração/runtime aceitos pelo nó e pelo contratante, recursos reservados, readiness, conectividade e ausência de conflito de alocação. READY ocioso pode receber quando foi contratado para cobertura/contingência. DOWNLOADING, LOADING, VALIDATING, armazenamento isolado e aplicativo aberto não recebem automaticamente.

Falha de outro membro da rota não invalida o tempo devidamente observado de um nó ainda sob contrato. Honrar o intervalo até drenagem/prazo; risco de recuperação pertence à contingência do contratante. Se o controle local cai, recibos auxiliares ficam pendentes, sem autorização de inventar saldo.

| Evidência inicial | Frequência proposta | Limite |
|---|---|---|
| Heartbeat autenticado | 15 s com jitter | Presença, não prova de GPU pronta |
| Probe da engine carregada | Admissão/reconexão e aleatório 2–5 min ocioso | Amostra de execução; adversário pode terceirizar |
| Challenge de nonce/forma/memória | Admissão e suspeita, com teto | Não prova unicidade física perfeita |
| Sessões reais e medição cruzada | Eventos cumulativos autorizados | Assinatura não prova qualidade/correção |
| Testes simultâneos de reservas correlatas | Amostra dirigida por risco | Pode detectar oversubscription, sem eliminar conluio |

Janelas de 60 s; verificador escolhido no contrato, independente do provider quando a oferta declarar essa propriedade. Hipótese de probes normais até 1% do tempo de GPU reservado, medindo também energia e rede. Tempo insuficientemente observado é pending/unverified; contestação aceita evidências redundantes, sem condenar não determinismo por igualdade exata.

A verificação é probabilística. Para fraude em fração f e m amostras independentes, detectar pelo menos uma ocorrência teria probabilidade `1 − (1−f)^m`; reconhecimento de probes, correlação e verificadores coniventes invalidam essa hipótese. Contrato/garantia e fundos em risco limitam perdas; blockchain não resolve a prova numérica. Ofertas experimentais devem expor quem verifica e quem absorve disputa.

## Reservar orçamento antes do lease

Na cooperação, reservar primeiro TU existentes e depois eventual emissão coberta por capacidade conservadora. Compromissos de transferência já pertencem a S, sem duplicação em L:

```text
E = TU_de_participantes_e_reserva_disponiveis_ou_retidos + compromissos_ainda_nao_emitidos + estornos_de_TU_queimados_aprovados_pendentes
nova_emissao_comprometida <= min(max(0, 0.35 × C_ref_7_dias - E), folga_epoca, folga_grupo)
```

C_ref é capacidade cooperativa conservadora avaliada a preços de referência fixados, descontando reservas comerciais, contingência e custos físicos. Não é garantia de resgate imediato ou valor financeiro. A emissão transforma compromisso em saldo; não aumenta E de novo. Consumo aceito reduz saldo do consumidor. Somente reversão aprovada e não lançada de TU queimados integra J; devolução de TU existentes debita seu hold/fundo já contado em S.

No modo comercial, o limite é financeiro, além do limite físico:

```text
novo_pagamento_comprometido <= min(fundos_livres_confirmados, folga_epoca, folga_grupo)
soma(disponivel + escrow + pendencias_nao_contadas_em_outro_estado) = fundos_cobertos
```

Ambos reservam todos os compromissos possíveis até o prazo. Contratos que cruzam meia-noite são particionados entre épocas UTC antes do aceite. O mesmo compromisso não é somado duas vezes por pertencer ao limite global e ao de grupo. Honrar contratos válidos já aceitos; mudanças de tarifa/emissão valem para novos contratos.

Capacidade física não pode ser vendida ou prometida duas vezes. Reservas de contingência não são throughput primário duplicado. Saldo financeiro não prova capacidade; TU não garante disponibilidade de qualquer modelo. Limites elásticos são permissões temporárias de admissão e não entram no saldo.

Grants cooperativos cabem no teto de estoque e em até 2% da emissão cooperativa total aprovada, incluindo compromissos pendentes: `grants_emitidos + grants_pendentes <= floor(emissao_a_contribuidores / 49)`. Grants comerciais dependem de fundos reais do patrocinador. Cadastro não cria orçamento em nenhuma modalidade.

## Journal de partidas dobradas

Journal imutável: transação, referência de negócio, regra, timestamp e chave idempotente. Linhas têm conta, lado debit/credit, unidade tipada e quantidade inteira positiva; débitos = créditos por transação e unidade. Não balancear TU contra dinheiro. A convenção operacional não equivale automaticamente à contabilidade financeira/legal.

### Registro cooperativo em microTU

| Operação | Débito | Crédito |
|---|---|---|
| Emitir por READY verificado ou grant aprovado | COOP_ISSUANCE | COOP_AVAILABLE do participante |
| Reservar uso | COOP_AVAILABLE | COOP_HELD da sessão |
| Liquidar parcela reciclada de uso comprovado | COOP_HELD | COOP_CONTINUITY até alvo publicado |
| Liquidar restante do uso comprovado | COOP_HELD | COOP_REDEEMED |
| Dotar reserva por emissão aprovada | COOP_ISSUANCE | COOP_CONTINUITY; máximo contribuição emitida/19 |
| Reservar TU existentes para READY | COOP_CONTINUITY | COOP_CONTINUITY_HELD do contrato |
| Pagar READY com TU existentes | COOP_CONTINUITY_HELD | COOP_AVAILABLE do contribuidor |
| Liberar restante | COOP_HELD | COOP_AVAILABLE do participante |
| Estornar parcela queimada | COOP_REDEEMED | COOP_AVAILABLE do participante |
| Estornar parcela reciclada | Hold/fundo responsável com TU existentes | COOP_AVAILABLE do participante |

COOP_REDEEMED representa TU retirados da circulação gastável. COOP_CONTINUITY e seus holds continuam em S; pertencem ao serviço, sem saque do administrador. Emissão adicional de reserva também exige compromisso prévio em L. Pagamentos reciclados não ampliam a base de grants/dotação. Emissão e ajuste exigem autorização única. Somente a reversão de TU queimados integra J antes de ser relançada; ressarcimento com TU existentes é transferência de fundo já contado em S.

Liquidação grava charged_microtu = working_floor_microtu + core_refill_microtu + working_extra_microtu + burned_microtu; recycled_microtu é a soma das três primeiras parcelas, sem outro lançamento. O cálculo usa saldos livres e alvos versionados, em transação atômica; holds não contam como saldo livre. Reembolsos acumulados por referência não excedem cada parcela original. Manter a parcela reciclável retida até concluir a regra de falha/evidência da sessão; não gastá-la enquanto ainda cobre reembolso pendente. Após finalização, reparação tardia depende de fundo identificado e das condições aceitas, sem emissão fictícia da parcela já circulada.

### Registro comercial em unidades atômicas de pagamento

| Conta | Função |
|---|---|
| SETTLEMENT_FUNDS | Contrapartida de fundos confirmados na unidade/contrato, conciliada externamente |
| PARTICIPANT_AVAILABLE | Saldo livre de cliente, provider, pool ou prestador identificado |
| PARTICIPANT_HELD | Saldo segregado por sessão/contrato, sem possibilidade simultânea de retirada |
| WITHDRAWAL_PENDING | Valor debitado do disponível aguardando saída finalizada |
| ADJUSTMENT_CLEARING | Ajuste excepcional identificado, sem criação de fundos não cobertos |

Pool/gateway/provider são participantes distintos na contabilidade, mesmo quando o mesmo operador acumula papéis. Ganho pendente de verificação é recibo, não saldo gastável. Não somar ganho histórico ao saldo atual. Fundo de contingência tem proprietário, regra de uso e saldo próprios; não é lucro livre enquanto comprometido.

| Operação | Débito | Crédito |
|---|---|---|
| Depósito confirmado | SETTLEMENT_FUNDS | PARTICIPANT_AVAILABLE do depositante |
| Reservar | PARTICIPANT_AVAILABLE do pagador | PARTICIPANT_HELD daquele contrato |
| Pagar lease verificado | PARTICIPANT_HELD do pool | PARTICIPANT_AVAILABLE do provider |
| Liquidar spot | PARTICIPANT_HELD do cliente | AVAILABLE de providers, gateway e fundos conforme divisão aceita |
| Liberar restante | PARTICIPANT_HELD | AVAILABLE do mesmo pagador |
| Estornar | HELD/AVAILABLE do responsável ou fundo conforme contrato | AVAILABLE do consumidor |
| Solicitar retirada | PARTICIPANT_AVAILABLE | WITHDRAWAL_PENDING |
| Finalizar retirada | WITHDRAWAL_PENDING | SETTLEMENT_FUNDS |
| Grant financiado | AVAILABLE do patrocinador | AVAILABLE do convidado |

Retirada cancelada usa lançamento inverso referenciado; repetição de evento não reaplica o pagamento. No canal não custodial, essas contas são projeções de direitos/eventos do contrato, sem conferir ao banco poder de movimentação próprio. Ajuste administrativo não fabrica depósito finalizado nem permite saldo negativo silencioso.

Exemplo aritmético exclusivamente comercial em unidades atômicas: um pool dispõe de 1.000.000 financiados e paga 600.000 por lease válido, ficando com 400.000. O provider reserva 400.000 do seu ganho para consumir, gasta 250.000 e libera 150.000; disponível fica em 350.000. Estorno de 50.000 financiado pelo recebedor do serviço leva-o a 400.000. O recebedor fica com 200.000; pool + provider + recebedor continuam somando 1.000.000. Os valores são fictícios e não preços públicos.

## Concorrência, assinaturas e idempotência

Locks ordenados por conta/contrato, serialização e retries com a mesma business key; journal e projeção atualizados no mesmo commit local. UPDATE/DELETE do journal negado à aplicação. Soma entre linhas exige procedure/constraint trigger diferido, não CHECK simples. [Isolamento PostgreSQL](https://www.postgresql.org/docs/current/transaction-iso.html).

| Evento | Chave mínima |
|---|---|
| Disponibilidade paga | assignment, epoch, window, rule; ajustes referenciam original |
| Hold/sessão | pagador, idempotency key, hash canônico do pedido |
| Medição | session, attempt, producer, seq; cumulativos não regridem |
| Liquidação local | session, settlement version |
| Evento financeiro externo | rede, contrato, transação e índice de evento; estado de finalidade separado |
| Voucher/canal | rede, contrato, canal, pagador, contraparte, nonce/seq, teto e prazo |
| Outbox | Evento na mesma transação, entrega pelo menos uma vez e efeito idempotente |

Essas chaves locais não resolvem gasto duplo entre operadores. TU exige hold exclusivo finalizado no registro cooperativo; pagamentos exigem escrow/canal ou exclusão financeira verificável. Banco local nunca autoriza dois providers contra o mesmo saldo livre. Quorum perdido interrompe novas confirmações cooperativas, preservando obrigações aceitas dentro de seus limites. Reorganização de cadeia, dados indisponíveis, expiração e liquidação financeira têm testes específicos nos EP10/11. Consenso valida transições do registro; não prova que uma GPU executou corretamente.

## Cotação, consumo e falhas

```text
custo = ceil((input_uncached × rate_prefill
            + input_cached × rate_cached
            + output_including_reasoning × rate_decode
            + state_reservation_units × rate_state) / denominator)
```

Unidades verificáveis pré-cotadas, taxas inteiras versionadas e tokenizer fixado. Toda cotação explicita `billing_mode`: cooperativo em microTU ou comercial em unidades atômicas de pagamento. Saldo insuficiente nunca ativa o outro modo automaticamente. `rate_state = 0` no perfil inicial, com contexto/slots já considerados na tarifa/admissão. Outras modalidades podem cobrar imagem, segundos de áudio ou unidade de previsão declarada, sem chamar tudo de token de texto.

Cotação inicial de 60 s fixa preço no hold aceito até o limite da sessão. Entrada usa teto sem cache; descontar apenas hit confirmado. Reservar máximo autorizado de saída, incluindo unidades internas cobradas. Não aumentar teto por timeout. O cliente pode escolher outra oferta ou autorizar novo orçamento explicitamente.

Metering do gateway/driver escolhido precisa de evidências e reconciliação; worker não escolhe contadores financeiros unilateralmente. Assinatura autentica origem, não correção. Vouchers progressivos podem limitar exposição, mas cliente que recusa aceite e provider que mente continuam riscos de contrato; não presumir solução trustless universal.

Perfil qualificado do pool de referência: tentativa interrompida por infraestrutura é estornada pela liberação do hold ou reversão das parcelas originais de queima/reciclagem; no comercial, usar fundos responsáveis/contingência; cancelamento do consumidor cobra prefill concluído e saída comprovada até cutoff; fila expirada antes do Start custa zero. Ofertas independentes publicam suas regras, árbitro e garantias antes de aceitar, sem herdar promessa de reembolso de outro operador.

No perfil de referência, divergência não aceita o maior contador automaticamente. Após deadline + 120 s sem evidência, liberar valor não comprovado e registrar perda/incidente do pool. Esse prazo local não substitui uma janela financeira de disputa ainda pendente: status final ao cliente só depois da regra de liquidação aplicável. Não debitar unilateralmente saldo liberado por recibo tardio.

## Aceite

Zero divergência em cada unidade; nenhum gasto acima do teto, emissão sem orçamento, pagamento sem fundos ou retirada de valor retido. Demonstrar READY e uso com receita monetária zero, circulação mais queima exatamente iguais ao consumo aceito, estorno sem emissão duplicada e preservação de compromissos e unidades.

Testar concorrência, COMMIT, restore, replay, recibo tardio, estorno, meia-noite, perda de quorum e gateway, canais financeiros concorrentes e finalidade/reorganização quando aplicáveis. Limites 1×/2×/4× do [20](20_COOPERATIVE_ECONOMY_AND_ELASTIC_LIMITS.md) mudam a admissão; no piloto não mudam a tarifa nem o contexto ou contratos aceitos.

A projeção de um operador deve ser reconstruível sem alterar direitos finalizados. Os [casos históricos](17_TOKEN_POLICY_SIMULATIONS.md), [casos comerciais](19_OPEN_MARKET_SIMULATIONS.md) e [referências cooperativas parciais](21_COOPERATIVE_SIMULATIONS.md) são referências de cálculo e política; não substituem validação em banco, GPU e rede reais.
