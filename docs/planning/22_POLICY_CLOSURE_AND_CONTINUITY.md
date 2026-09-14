# Decisões de continuidade, preços, acesso e governança

**Fundamentos da revisão 4 — 13/09/2026.** Este documento preserva decisões e a referência de conta única usadas no ensaio v4. Preços, confiança e governança aqui descritos permanecem fundamentos; economia, fundos e sequência de abertura vigentes estão consolidados no 24. A implementação do produto continua fora desta etapa.

**Regra vigente — revisão 6:** aplicar o [24](24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md), inclusive piso operacional antes da recomposição protegida, expansão condicionada, bootstrap e fase madura sem emissão contínua. As fórmulas de conta única abaixo são históricas. O simulador e os resultados do 23 continuam da revisão 4; não validam a política nova.

Cooperação deve ser útil sem vendas, com compromissos limitados. Quando ninguém oferece hardware ou sustenta a infraestrutura, a decisão é interromper novas promessas e preservar direitos verificáveis. Não fabricar capacidade ou prometer equilíbrio perpétuo.

## 1. Decisões adotadas

| Ponto | Decisão concreta | Condição de ativação pública |
|---|---|---|
| Estoque e saída de GPUs | Circulação de TU, reserva de continuidade e redução por modelo | Recursos e custo mínimo medidos; perda de oferta exercitada |
| Preços entre modelos | Cesta de trabalho fixada e qualificação independente | Medições comparáveis; nenhum peso econômico autodeclarado |
| Procura concentrada | Fila por configuração, custo e pagador | Carga desigual, saldo suficiente e nenhuma sobrealocação |
| Fraude e autoridade | Atestações independentes, exposição limitada e registro federado escolhido | Operadores independentes; conluio, partição e contestação exercitados |
| Custos sem compradores | Orçamento real separado e encerramento provisionado | 30 dias de operação mínima e 7 dias de encerramento cobertos |

Os defaults numéricos são reversíveis. A escolha dos mecanismos está fechada; ativação e calibração exigem as evidências abaixo.

**Resultado desta revisão:** a simulação favoreceu circulação nos nove controles comparados, mas reprovou o conjunto fictício de tarifas, demanda e comportamento para abertura: houve hibernação até no cenário básico. Portanto, os valores fictícios não são a tabela do produto. O 23 registra os resultados completos; aprovação contábil não será usada para disfarçar baixa utilidade.

## 2. Reserva de continuidade

Criar **COOP_CONTINUITY**, conta coletiva em microTU no registro de serviço. Seus TU já emitidos contam integralmente na exposição. Não são saldo financeiro, não têm saque e não pertencem a fundadores.

Para cada 19 microTU de remuneração ordinária efetivamente emitida a contribuidores, autorizar no máximo 1 microTU adicional à reserva, até seu alvo. Acumular o resto por época. Isso limita a reserva a 5% da emissão composta de contribuição e reserva, antes dos grants. Grants continuam limitados a contribuição/49 e aos tetos existentes.

**Reservar ambas as parcelas no orçamento antes do contrato.** Remuneração do nó e parcela máxima da reserva são compromissos vinculados e distintos; contar ambas em grupo/época/global e liberar o não utilizado. Não retirar 5% da tarifa já aceita pelo nó. Pagamento com TU existentes da reserva não autoriza outra emissão para reserva ou grant.

```text
S = TU disponíveis e retidos de participantes + TU da reserva livres e comprometidos
L = emissão ainda não realizada já autorizada, incluindo reserva e grants
J = estornos de TU queimados aprovados ainda não relançados
E = S + L + J
folga_nova_emissao = max(0, 0.35 × C_ref - E)
reserva_emitida_na_epoca <= floor(remuneracao_ordinaria_emitida_na_epoca / 19)
grants_emitidos_e_pendentes <= floor(remuneracao_ordinaria_emitida_na_epoca / 49)
```

Reserva comprometida não é somada novamente em L: já integra S. A revisão 4 **substitui a queima integral do consumo** pela circulação abaixo. O consumidor continua pagando somente a tarifa aceita; a destinação não é cobrança adicional. Estornos seguem o journal do 07.

### Circulação que financia novas reservas úteis

A primeira simulação mostrou que queimar todo consumo e depender apenas de emissão nova para READY podia interromper o próprio serviço usado para reduzir o estoque. A reserva isolada apenas adiava esse problema. A decisão é usar primeiro TU já existentes para financiar disponibilidade, emitindo somente o complemento autorizado.

```text
pagamento_READY = transferencia_de_TU_existentes + emissao_nova_autorizada
R = min(consumo_aceito, necessidade_da_reserva_ate_alvo_publicado)
B = consumo_aceito - R
consumo_aceito = R + B
S_depois = S_antes - B  # R muda de titular; nao cria TU
```

Liquidar R para COOP_CONTINUITY e B para COOP_REDEEMED, atomicamente. Reservar TU existentes antes de prometer o respectivo READY; dois contratos não podem usar o mesmo fundo. Alocar primeiro rotas mínimas completas, depois expandir dentro do caixa em TU e da folga de emissão. Cada parcela de remuneração tem uma fonte exclusiva; somar parcelas não pode ultrapassar tarifa × tempo verificado. O uso não paga um segundo prêmio ao executor da mesma alocação.

O alvo da reserva é publicado por época e deriva de capacidade mínima qualificada. Não aumenta automaticamente porque o estoque cresceu, alguém abriu contas ou chamou o próprio modelo. Pagamentos reciclados não entram na base de emissão adicional de reserva/grants. Autochamadas podem movimentar TU existentes, mas não ampliam o orçamento ou criam remuneração automática por processamento. Conluio para simular READY continua sendo risco de atestação.

R permanece retido enquanto houver falha de infraestrutura ou consumo não comprovado na janela de finalização da sessão. Liberar ao fundo somente após a decisão aplicável; a macro-simulação agrega essa decisão, sem testar seu tempo real. Estornar parcela queimada reverte COOP_REDEEMED; parcela reciclada exige débito do hold/fundo responsável, sem reemiti-la. Reparação tardia após finalização exige fundo identificado e regra aceita; não fabricar saldo para encobrir perda.

Acima do teto de estoque, **nova emissão** fica congelada, mas transferências de TU existentes podem manter rotas úteis. Pouca demanda por tempo indefinido ainda pode consumir a reserva; isso não se resolve emitindo para sempre. Retomada pode receber doação voluntária e explícita de TU existentes de membros, sem conversão financeira ou corte compulsório de saldos.

Alvo da reserva: **72 horas do custo em TU da capacidade mínima**, não de toda a rede. Fixar esse plano antes do incidente. Constituir a reserva durante a bancada, dentro dos tetos de emissão, antes da abertura. A simulação declara seu saldo inicial e história sintética; isso não é emissão real autorizada por este documento.

Cada pool publica um conjunto mínimo de rotas completas para modelos essenciais escolhidos pela comunidade. Rotas distribuídas exigem todos os papéis e domínios de falha do perfil. Modelos experimentais ficam fora dessa reserva inicial. Escolher o menor conjunto qualificado que entregue o catálogo mínimo. Se o gigante perder componentes, preservar o compacto que ainda funciona; parar apenas modelos/rotas inviáveis. Reduzir o alvo da reserva ao escopo fisicamente executável, sem fingir que fragmentos servem o modelo inteiro. Falta temporária de TU para pagar o gigante também permite manter só o compacto, mas não reduz automaticamente o alvo de recomposição: preservar a possibilidade de financiar a retomada do catálogo qualificado.

Fornecedores aceitam previamente tarifa de contingência, recursos, prazo máximo de lease de 15 minutos e condições de pausa. A reserva paga tempo útil verificado **por transferência**, sem emissão nova ou dupla remuneração da mesma alocação. Teto por época segue o plano aprovado; cada pagamento exige hold exclusivo. Se uma rota mínima deixa de existir, parar seu gasto e informar o modelo indisponível.

### Estados econômicos

| Estado | Entrada | Comportamento |
|---|---|---|
| NORMAL | Registro saudável; contratos cabem em TU existentes ou emissão autorizada | Contratar mínimo e expandir dentro do orçamento; recompor reserva; grants só de emissão elegível |
| DEFENSE | Não cabe o custo mínimo na soma de fundos existentes e emissão permitida | Suspender expansão/grants; limitar extras; pagar as rotas mínimas que ainda couberem |
| RECOVERY | Recursos e folga para o conjunto mínimo voltam por 24 h | Renovar gradualmente e recompor reserva antes de expandir incentivos |
| HIBERNATING | Sem conjunto mínimo, reserva suficiente/voluntários ou operação custeada | Suspender novas promessas afetadas; drenar e preservar saldos/checkpoints |

Perda de quorum prevalece sobre esses estados: não gastar a reserva sem confirmação. Crédito gasto financia nova disponibilidade até o alvo do fundo; sua parcela queimada reduz E. Perda de capacidade que eleve E acima do alvo congela emissão, sem bloquear transferências legítimas. Com uso zero por muito tempo, a reserva pode esgotar; a saída é hibernação controlada, sem corte retroativo de saldo.

Retomada exige checkpoint verificável, quorum saudável, recursos requalificados, operação custeada e cobertura mínima por reserva, folga legítima ou cessão voluntária explícita. Não reinicializar saldos. Sem quorum recuperável, uma recuperação social exige novo identificador de rede e aceite dos clientes; duas cópias não podem ser anunciadas como o mesmo saldo global.

## 3. Valor entre GPUs e modelos

Fixar uma cesta de cargas por configuração: entrada/saída, contexto, precisão, cache, modalidade e confiança. Medir capacidade útil conservadora, sucesso, memória/estado, comunicação, probes, retries e recuperação sob o nível de serviço escolhido.

Um perfil recebe peso econômico após três execuções por dois operadores independentes, com resultados reproduzíveis. Requalificar após mudanças relevantes de engine/driver/configuração ou desvio do envelope. Esse procedimento não prova unicidade física.

O custo de referência por trabalho reúne execução, memória reservada, comunicação, validação e recuperação, sem duplicar overhead. Pesos são publicados e não representam cotação em reais. Tarifas de entrada/saída/cache devem cobrir o orçamento daquele perfil sob utilização conservadora; tempo autodeclarado da chamada não é preço.

```text
custo_ref_rota = soma(custos_ref_dos_papeis) + overhead_ref_nao_contado_nos_papeis
peso_papel = custo_ref_papel / soma(custos_ref_dos_papeis)
remuneracao_papel = remuneracao_total_aprovada_da_rota × peso_papel
```

Fragmentar um papel conserva seu peso. GPU melhor recebe mais por serviço útil adicional contratado; rede incompatível não recebe o peso de uma rota funcional. Se falta orçamento, reduzir novas contratações e aplicar o estado econômico, preservando tarifas aceitas.

No piloto, uma classe de serviço por configuração e tarifa fixa por versão. Revisão ordinária no máximo diária, com aviso de 48 h e variação inicial máxima de 10%, alinhada à governança. Quando isso não cobre o perfil, suspender novas ofertas e requalificar. Não haverá preço automático por fila nem desconto automático por ociosidade: o controlador muda admissão.

Publicação de modelos permanece aberta. Receber a unidade TU comum exige qualificação e cobertura aprovadas pela política do registro/pool, sem autoaprovação pelo provider. Modelos experimentais ocupam no máximo 5% do orçamento de novas emissões da época. Esse envelope e o de novos contribuidores limitam o mesmo total, sem somar o recurso duas vezes.

Modelos sem orçamento cooperativo podem operar localmente ou em ofertas comerciais independentes. Catálogo explicita os modos aceitos. C_ref conserva cesta/preços e mapa de recursos compatíveis; aplica desconto por permanência, concentração e falhas correlacionadas. A referência de sete dias é previsão prudencial, não contrato de sete dias: leases continuam de 15 minutos. Provider não aumenta C_ref unilateralmente.

## 4. Procura concentrada

Adotar round-robin com déficit por pagador/tenant e custo de recursos, em filas por configuração. Chaves e subcontas conhecidas compartilham limites. Saldo, idade e pagamentos comerciais não aumentam prioridade cooperativa.

Pedidos grandes acumulam déficit até reserva completa, limitado ao custo máximo autorizável mais um quantum. Não acumular prioridade infinita. Requests impossíveis são recusados sem bloquear a fila inteira. A rota reserva simultaneamente memória/estado e todos os componentes.

Defaults: dois pedidos pendentes por pagador/configuração e oito no conjunto de modelos. Fila interativa expira em até 120 s; antes do Start, liberação integral do hold. Fila flexível tem contrato próprio e prazo escolhido, sem promessa interativa. Teto global deriva do throughput seguro, prazo e memória administrativa; rejeitar excesso antes de criar hold.

Na corrida pelo gigante: cessar novos extras, preservar justiça por custo e publicar capacidade efetiva. Só mover GPUs após verificar compatibilidade, load, custo e cobertura mínima restante. Limitar uma troca de atribuição por domínio a cada 30 minutos, salvo recuperação de falha. Nunca substituir o modelo do usuário.

Limites 1/2/4, extras de 60 s e deadline dentro do lease continuam. Controlador usa tempo monotônico decorrido; contagem de eventos ou telemetria duplicada não pode acelerar as janelas de promoção. API implementada precisa provar isso.

DRF serve como comparação de bancada; suas garantias não são automaticamente transferidas para a nossa rede. [Artigo primário](https://www.usenix.org/conference/nsdi11/dominant-resource-fairness-fair-allocation-multiple-resource-types).

## 5. Fraude e contestação

Criar nó não exige compra, depósito ou aprovação global. Remuneração na unidade comum exige contrato, recurso qualificado e evidência aceita. No pool de referência, exigir duas atestações concordantes entre três verificadores elegíveis de operadores distintos, sem vínculo declarado com o provider. Discordância permanece pendente e vai à revisão.

O registro seleciona o conjunto entre verificadores qualificados, com rotação e histórico públicos. Não chamar isso de sorteio criptograficamente imprevisível. Probes usam nonces do verificador, mas reconhecimento de testes e conluio continuam possíveis. Validadores e verificadores têm funções/chaves distintas.

Provider novo começa com uma alocação pequena, com ganho indisponível até a revisão de 24 h, conforme sua fonte de financiamento. Após sete dias de evidência consistente pode solicitar ampliação; idade sozinha não promove. Novatos juntos ocupam até 5% do orçamento da época; emissão experimental sem histórico suficiente ocupa no máximo **1% do total**. Limites são agregados, não multiplicados por carteira; categorias sobrepostas obedecem ao menor teto.

Recibos pendentes conservam sua fonte: emissão futura em L; TU existentes permanecem retidos em S. Atraso não libera orçamento para outro contrato. Decisões referenciadas liberam valor não devido. Recibo aceito não pode ser pago em outro gateway. Dupla reserva exige exclusão de intervalo/recurso e medição simultânea; UUID/IP não provam GPU única.

Suspeita suspende novas atribuições do perfil, preserva evidência e admite recurso em sete dias. Revisores não participaram da decisão original. Não confiscar todo saldo por falha legítima, não determinismo ou suspeita. Correções limitam-se a lançamentos identificados sob regras aceitas; perdas irreversíveis pertencem à contingência, sem débito arbitrário a outros usuários.

Autochamadas consomem TU e não geram bônus. Consumo sozinho não promove provider ou eleva peso/preço. Limitar influência de pagadores correlacionados sobre previsões; o envelope global permanece a última proteção quando correlação não é detectada.

**Limite de confiança:** conluio suficiente dos atestadores pode aprovar capacidade falsa. Não existe prova física universal neste plano. Medir perda não detectada, aplicar tetos e parar a emissão do perfil quando a evidência não sustenta confiança. Testes com detecção presumida igual a zero devem aparecer nos resultados.

## 6. Registro e governança escolhidos

**Escolha para integração:** CometBFT com aplicação determinística de TU via ABCI; referência de bancada **v0.38.26**, observada nas releases oficiais. Fixar tag/commit/dependências e revisar avisos de segurança em F0 antes de executar. Não criar algoritmo de consenso ou moeda negociável. Mudança por incompatibilidade/vulnerabilidade exige ADR e preservação de histórico. [Releases oficiais](https://github.com/cometbft/cometbft/releases).

A aplicação valida autorização, evidência, orçamento e gasto. Preços/capacidade entram como snapshots assinados versionados; réplicas não consultam GPU, Redis, relógio local ou API externa durante a transição determinística. Banco local é projeção. [Requisitos ABCI](https://raw.githubusercontent.com/cometbft/cometbft/v0.38.x/spec/abci/abci%2B%2B_app_requirements.md).

Quatro organizações independentes, poder igual e confirmação por três, no máximo uma vaga por operador. Nós de inferência são abertos; validadores têm admissão explícita. É **piloto federado**. Dois validadores indisponíveis podem bloquear confirmação; não diminuir quorum nem alegar equivalência ao consenso aberto do Bitcoin. A especificação usa mais de dois terços e descreve limitações de censura/partição. [Consenso CometBFT](https://raw.githubusercontent.com/cometbft/cometbft/v0.38.x/spec/consensus/consensus.md).

| Ação | Regra proposta |
|---|---|
| Candidatar-se | Inscrição pública, organização/conflitos declarados, sete dias de operação de teste e recursos de continuidade |
| Admitir/substituir vaga | 3 de 4 vigentes, justificativa pública, aviso de sete dias; uma substituição por janela; ativação pelo protocolo |
| Parâmetro ordinário | 3 de 4, proposta/simulações públicas, aviso mínimo de 48 h; contratos anteriores preservados |
| Aumentar emissão ou mudar direitos/governança | 3 de 4, aviso de sete dias e versão explícita aceita pelos clientes; sem corte retroativo |
| Emergência | Pausa local livre; pausa global exige quorum normal, reduz apenas admissão e dura até seis horas por decisão |
| Quorum perdido | Sem troca de conjunto ou liberação por minoria; recuperar quorum/checkpoint ou manter bloqueio |
| Upgrade | Replay determinístico, compatibilidade e altura de ativação; cliente verifica versão/checkpoint |

Operadores efetivos ainda precisam aceitar as vagas: isso é condição de implantação, não decisão arquitetural em aberto. Sem independência comprovada, permanecer laboratório identificado. Não usar uma carteira por voto ou poder comprado com TU.

Clientes verificam por endpoints alternativos e podem mudar gateway. Checkpoints verificáveis ficam com pelo menos três operadores. Publicar gênese, chaves, governança, custos, exportação de recibos e identidade. Registro público existente fica como alternativa de revisão, sem condicionar cooperação a compradores.

## 7. Operação sem vendas

Separar custos locais voluntários, recursos compartilhados cedidos com prazo e caixa real de despesas externas. Não tratar promessa de doação como dinheiro recebido nem TU como orçamento de nuvem.

Publicar orçamento mínimo e responsáveis por registro, descoberta, relay, checkpoints, verificação e suporte. Para cessão em espécie, registrar capacidade, prazo e substituto; custo zero em caixa não significa custo físico inexistente.

Antes da abertura, exigir **30 dias de operação mínima mais sete dias de encerramento reservados**. São critérios de cobertura; valores dependem de medições. Rateio, doações e recursos cedidos podem cobrir isso sem vendas. Receita comercial paga suas próprias obrigações antes de destinar excedente à cooperação.

| Cobertura operacional | Ação |
|---|---|
| ≥30 dias além do encerramento | Operar no orçamento/capacidade aprovados |
| <30 dias | Congelar expansão custosa; novos compromissos não excedem prazo coberto |
| <14 dias | Restringir relay subsidiado e outros caminhos caros; manter somente rotas custeadas |
| Sem operação além da reserva de encerramento | Hibernar antes de consumir essa reserva; drenar/exportar/checkpoint |

Não usar depósitos de clientes, disputas, saldo sacável de providers ou TU como caixa livre. Dinheiro exige reconciliação, idempotência e regra explícita para restos de arredondamento. Meios reversíveis, como cartão, não financiam ganhos externos irrevogáveis sem reserva de chargeback do intermediário.

Primeiro piloto comercial: a referência de qualificação é x402 batch-settlement/EVM com USDC de teste em Base Sepolia, conforme o 24. Contrato, implementação, facilitadores, retirada e reparação precisam ser qualificados antes de valor real. Até lá, módulo comercial desabilitado. Isso não bloqueia cooperação cujo registro/operação estejam saudáveis.

## 8. Fechamento e evidência

O [23](23_INTEGRATED_ECONOMY_SIMULATIONS.md) integra estoque, reserva, modelos, saída endógena, demanda desigual, comércio, caixa, fraude presumida e falhas do registro. Custos e comportamento são fictícios; políticas usam as mesmas sementes e choques.

Medir também trabalho desejado não atendido, modelos inacessíveis, cobertura mínima, saídas de nós, defesa/hibernação, gasto da reserva e perda por fraude não detectada. Saldo não negativo sozinho não demonstra utilidade.

### Procedimento fechado de calibração e aprovação

1. Medir a cesta e os custos físicos de cada rota; publicar quantas chamadas de referência cada hora contratada de contribuição compra por perfil. Custos em TU e custo elétrico em dinheiro são colunas distintas.
2. Medir demanda cooperativa com saldo/orçamento e separá-la de intenção sem renda, tráfego do próprio operador e procura por modelos inexistentes. Inferir entrada/saída de provedores dessas observações, incluindo sensibilidade a baixa utilidade do saldo.
3. Escolher o menor catálogo/quantidade de réplicas que satisfaça cobertura e contingência. Limitar novas contratações úteis, com rotação entre ofertas equivalentes; não remunerar todo anúncio ocioso.
4. Recalibrar a tabela prospectiva dentro do limite de variação/aviso; avaliar reservas de 24/72/168 h e estoque prudencial sob perda correlacionada. Fixar alternativas antes de rodar sementes de validação diferentes das de ajuste. Não selecionar apenas a média ou a melhor semente.
5. Exigir no cenário básico sem compradores: nenhuma hibernação econômica, pelo menos 95% do trabalho elegível e orçado aceito dentro do contrato, nenhum saldo/recurso duplicado e operação mínima custeada. Publicar também demanda desejada total, por coorte e por modelo; excluir pedidos sem saldo do gate não permite ocultá-los do relatório.
6. Sob choques, exigir preservação de saldos/contratos, redução por rota e retorno em até 24 h após recursos, quorum, caixa e liquidez mínima voltarem. Se essas condições não voltam, reportar a pausa e o recurso ausente. Não prometer recuperação espontânea com todos os provedores ausentes.
7. Repetir em bancada real e nos pilotos de 7/30 dias antes de anunciar tarifa ou disponibilidade pública. Se o conjunto não passa, reduzir a oferta do piloto e recalibrar; manter produto fechado a promessas públicas. Não apagar crédito ou elevar o teto de emissão para fabricar aprovação.

Esse procedimento decide como agir quando os dados contrariam os parâmetros. Hardware disponível, operadores reais e comportamento humano não são substituídos por números escolhidos para a simulação passar.

Gates reais: sete dias sem vendas com contribuição/uso cruzado; 30 dias de carga/saída correlacionada; nenhum gasto/recurso duplicado; preço e recibos concorrentes corretos; recuperação de quorum/banco; operação e reserva custeadas. Modelo grande fictício do simulador não prova Kimi ou inferência distribuída.

Falha de gate restringe o perfil, suspende novas promessas e exige nova versão com evidência. Não autoriza apagar ganhos, inventar capacidade, mudar preço aceito ou converter TU em dinheiro.
