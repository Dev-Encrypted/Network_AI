# Operação e viabilidade econômica

## O que precisa ser economicamente verdadeiro

A rede só se sustenta se a capacidade útil resgatável, descontados falhas, segurança e operação, entregar benefício aos participantes e tiver custos físicos e operacionais cobertos pelos participantes, operadores ou fontes declaradas. Créditos acumulados não armazenam a computação que ficou ociosa ontem. A análise deve ser por modelo/configuração, horário, região e confiança, pois VRAM de outro grupo pode não atender a demanda atual.

O mercado agora integra o escopo: clientes compram inferência de ofertas comunitárias e providers recebem ganhos financiados, conforme o [18](18_OPEN_NETWORK_AND_COMPUTE_MARKET.md). A cooperação do [20](20_COOPERATIVE_ECONOMY_AND_ELASTIC_LIMITS.md) gera TU por disponibilidade útil mesmo sem compradores. O laboratório usa créditos de teste, recursos voluntários e orçamento operacional identificado; o comércio exige contratos, custos e liquidação qualificados. Moeda própria e consenso próprio não foram escolhidos. Custos abaixo são de cada gateway/pool, não de uma empresa obrigatória para toda a rede.

## Custos separados

| Responsável | Custos a medir | Como atribuir |
|---|---|---|
| Plataforma | Controle/DB/Redis, gateway, relay, objetos, distribuição, observabilidade, backups | Fixos mensais + variáveis por sessão, GiB, request e retenção |
| Plataforma | Contingência, probes, verificação replicada, reexecução, fraude, suporte e manutenção | Separar tráfego/compute útil de overhead e perdas |
| Participante | Energia marginal, aquecimento, desgaste, internet/franquia, SSD, RAM, indisponibilidade para uso próprio | Uso incremental real, não TDP inteiro nem custo zero porque já possui a placa |
| Consumidor | Créditos gastos, espera, interrupções, contexto transmitido e tempo de integração | Valor por tarefa concluída, além de preço por token |

Uma GPU comunitária não torna gratuito o gateway, a recuperação de falhas ou a energia. O custo assumido pelo contribuidor não deve ser registrado como desembolso da plataforma, mas precisa aparecer no valor da cooperação.

## Modelo de custos mensal

```text
C_plataforma = C_controle + C_banco_cache + C_gateway
             + GB_mes_objetos * P_storage + ops_A * P_A + ops_B * P_B
             + GB_relay_cobrados * P_relay + C_capacidade_relay
             + C_observabilidade_backup
             + C_contingencia + C_probes + C_reexecucao + C_fraude
             + horas_suporte * custo_hora_interno + C_manutencao
             + C_liquidacao + C_disputas + C_pagamentos_externos

C_por_tarefa_boa = C_plataforma / tarefas_concluidas_com_qualidade_aceita
```

Não somar duas vezes: se compute de referência/probes está numa fatura fixa de contingência, distribuí-lo analiticamente por finalidade sem acrescentar a mesma fatura outra vez. Para relay, distinguir bytes úteis que atravessam o túnel, ingress/egress reais e unidade de cobrança do provedor. Download de pesos e ativação de inferência são séries separadas.

Não há cotação atual verificada de controle, suporte ou relay neste pacote. Suas variáveis ficam em aberto, com cotações exigidas antes de contratar recursos. O preço externo concreto abaixo é somente armazenamento R2.

## Cenários de carga, não previsões de mercado

Hipóteses didáticas para dimensionar a planilha futura. GB aqui é decimal; 30 dias por mês; volume de uma sessão é conteúdo que precisa de relay, contado uma vez antes de aplicar a cobrança real. Esses volumes não representam K3 C: tensores podem torná-los muito maiores.

| Cenário | Nós cadastrados | Sessões/dia | Conteúdo médio/sessão | Fração de sessões via relay | GB úteis/mês via relay | Objetos médios GB-mês |
|---|---:|---:|---:|---:|---:|---:|
| Piloto privado | 10 | 100 | 2 MB | 20% | 1,2 | 1.000 |
| Beta controlada | 100 | 5.000 | 5 MB | 40% | 300 | 5.000 |
| Rede ampliada | 1.000 | 50.000 | 10 MB | 60% | 9.000 | 20.000 |
| Ensaio de escala | 10.000 | 500.000 | 10 MB | 60% | 90.000 | 50.000 |

Essas sessões são carga de ensaio, não capacidade comprovada das quantidades de nós. Cruzar com READY por grupo no [10](10_BENCHMARKS_AND_CAPACITY.md). O modelo econômico deve recusar um cenário cuja demanda excede throughput/slots medidos, mesmo que o orçamento em moeda pareça viável.

Sensibilidades obrigatórias: relay 20→80%; bytes/sessão ×10; oferta de GPU −50%; demanda de um modelo ×5; fraude 0,5/2/10% do budget emitido; reexecução 1/5/15% das tentativas; suporte 1/5/15 incidentes por 100 nós/mês. São hipóteses de estresse, não taxas observadas. Medir custo de resolver cada incidente antes de extrapolar equipe necessária.

O custo de verificação não é necessariamente a percentagem de sessões replicadas: replicar 1% das sessões gigantes pode consumir mais que 1% de GPU-tempo. Registrar seleção ponderada por risco e trabalho, com teto financeiro; probes normais têm alvo de ≤1% do GPU-tempo reservado, sujeito a E10.

## Preço externo verificado

Cloudflare R2 Standard, consulta em **13/09/2026**, documentação atualizada em 07/08/2026: US$ 0,015 por GB-mês, operações Class A US$ 4,50/milhão e Class B US$ 0,36/milhão; egress gratuito do R2. Franquia publicada: 10 GB-mês, 1 milhão Class A e 10 milhões Class B por mês. Há regras de arredondamento e outros custos de serviços associados. [Preço oficial](https://developers.cloudflare.com/r2/pricing/).

| Objetos médios GB-mês | Armazenamento bruto calculado, sem franquia/operações/impostos |
|---:|---:|
| 1.000 | US$ 15 |
| 5.000 | US$ 75 |
| 20.000 | US$ 300 |
| 50.000 | US$ 750 |

É exemplo de origin compatível com S3, não cotação total da rede. Egress R2 gratuito não paga trânsito do relay de inferência. Conservar liberdade de provedor e conferir licença/redistribuição de cada modelo antes de hospedá-lo. Múltiplas revisões, repacotamento, rollback e réplicas aumentam armazenamento.

## Oferta e demanda ao longo do dia

Exemplo calculado em unidades abstratas de serviço qualificado por hora, iguais apenas dentro de uma configuração:

| Faixa local ilustrativa | Oferta | Demanda | Implicação |
|---|---:|---:|---|
| 00–06h, 6 horas | 100/h | 20/h | Excesso 480 unidades; não vira estoque de computação |
| 06–18h, 12 horas | 60/h | 50/h | Excesso 120 unidades |
| 18–24h, 6 horas | 40/h | 100/h | Déficit 360 unidades no pico |

Oferta diária total 1.560 unidades e demanda 1.320 ainda deixam déficit noturno de 360. Um saldo diário positivo não resolve a simultaneidade. Contexto, modelo, confiança e região podem fragmentar mais a oferta.

Planejar reservas remuneradas por janela e incentivo a contribuições no pico. Desconto por execução flexível é evolução condicionada a economia medida, inicialmente zero, segundo o [16](16_TOKEN_ECONOMY_AND_FAIR_DISTRIBUTION.md). Cotas de concorrência e fila limitada protegem o serviço. Aumento de tarifa segue aviso e limites da política para novos contratos; não altera hold ou lease aceito.

O monitor separa estoque/compromissos de TU, fundos financeiros, capacidade por modelo/horário e resultado operacional. Não converter toda GPU em capacidade de qualquer modelo nem vender o mesmo recurso duas vezes. Um saldo financiado não promete disponibilidade de configuração específica; venda de capacidade futura exige contrato próprio. A emissão cooperativa atual usa S+L+J e referência conservadora de sete dias preservada no 24, com alvo/alerta/crítico hipotéticos de 35/50/80%. Essa regra de serviço não substitui fundos financeiros.

Os [18 cenários do 17](17_TOKEN_POLICY_SIMULATIONS.md) incluem baixa demanda, perda de capacidade, concentração no modelo mais caro e dupla promessa de capacidade comercial/cooperativa. São cálculos hipotéticos. Se faltar oferta provável, preservar contratos aceitos, restringir promessas novas e financiar continuidade quando possível; congelar todas as renovações pode agravar a saída de GPUs. Comunicar filas e indisponibilidade, sem apagar saldos ganhos.

Grants cooperativos cabem em até 2% da emissão cooperativa total e no orçamento de capacidade, sem exigir vendas. Consumo retira TU gastáveis; provider cooperativo já recebe por READY. Pagamento comercial transfere dinheiro às contrapartes. A mesma alocação/intervalo não recebe emissão integral e spot integral. Os [oito casos comerciais do 19](19_OPEN_MARKET_SIMULATIONS.md) verificam fundos e margem; os [20 casos cooperativos do 21](21_COOPERATIVE_SIMULATIONS.md) verificam referências de emissão, limites e segregação, com números fictícios.

Pouca demanda total pode liberar maior quota e concorrência, sob os limites físicos do modelo. Isso não gera estoque acumulável. Na volta da procura, cessar novos extras e preservar o prazo das sessões aceitas. No pool misto de referência, comercial ocupa até 25% da capacidade segura; sem reservas comerciais, a cooperação pode aproveitar 100%. São hipóteses voluntárias do pool, não capacidade adicional.

Receita monetária zero ainda exige custear energia, rede, discovery, registros e relays. Documentar quem paga: voluntários, rateio, orçamento inicial ou patrocínio. Medir custo por participante e dependência de cada fonte. Créditos de uso não quitam automaticamente uma fatura externa.

## Valor de contribuir versus usar localmente

Para cada perfil, comparar inferência local e contribuição seguida de consumo ou retirada do ativo efetivamente recebido. Medir qualidade, espera, interrupções, ganhos, taxas e energia. Retirada depende da unidade/contrato escolhido; não prometer paridade em dinheiro nem recompra de uma moeda própria.

```text
energia_incremental_kWh = integral(max(potencia_contribuindo - baseline, 0)) / 1000
custo_energia = energia_incremental_kWh * tarifa_real_da_conta_do_participante
valor_cooperativo = tarefas_uteis_resgatadas / tarefas_uteis_locais_na_mesma_janela
```

A razão é só uma métrica quando tarefas são comparáveis; acesso a modelo que não roda localmente tem utilidade própria, avaliada pelo usuário. Incluir download/load não remunerado, disponibilidade do catálogo, privacidade e desgaste. Desistência por baixo valor é sinal para revisar tarifas/placement, não culpa do contribuidor. Não estimar energia pela VRAM nem pela potência nominal da fonte.

## Implantação, continuidade e recuperação de um operador

Começar com implantação simples e versões fixadas: proxy/gateway, duas instâncias de API sem estado, PostgreSQL primário com standby quando o ambiente permitir, Redis reconstruível e workers de conciliação. Duas APIs não removem o banco como autoridade de falha. Scheduler/conciliador usam lease de liderança ou locks com fencing; não depender só de Redis para exclusão financeira.

Durante falta do controle/DB daquele operador, ele não autoriza pagamentos ou reservas novos. Sessões existentes podem terminar no envelope assinado; recibos ficam em spool limitado. Outros operadores continuam independentes. Failover local só promove writer após fencing; saldo depende do registro externo correspondente. Indisponibilidade apenas dos pagamentos não bloqueia novas sessões cooperativas cujo registro de TU permaneça saudável. Não reconstruir fundos por heartbeat.

| Objetivo inicial, não demonstrado | Piloto privado | Antes de comunidade pública |
|---|---|---|
| Dados gerais de controle | RPO ≤5 min; RTO ≤4 h em ensaio de restore | RPO ≤1 min; RTO ≤1 h demonstrados sob carga prevista |
| Lançamentos financeiros confirmados | RPO zero como requisito de promoção financeira, ou suspender settlement durante reconciliação de perda conhecida | Replicação síncrona/durável em domínio independente ou mecanismo equivalente demonstrado; nenhum failover que silenciosamente descarte COMMIT reconhecido |
| Sessões GPU | Podem ser interrompidas; recovery conforme modo | SLO por configuração; HA de API não preserva KV/SSM |

RPO zero não é obtido apenas habilitando backup diário. Se a configuração de banco não suportar esse requisito, não anunciar continuidade financeira automática: parar novas operações, recuperar evidências e conciliar antes de reabrir. Publicar risco residual de perda regional conforme topologia real.

Backups: base diária e WAL contínuo quando PostgreSQL configurado para PITR; cópia criptografada em credencial/conta distinta; retenção inicial de 30 dias e ponto mensal por 90 dias, ajustável à política de dados. Guardar também manifests, licenças, rate cards, chaves públicas e configuração; chaves privadas usam backup protegido e controle de acesso separado. Objeto por digest não dispensa inventário/backup do catálogo.

Testar restauração mensal no piloto e antes de upgrade de armazenamento: instância isolada, hash/invariantes do journal, saldo projetado, outbox, holds abertos, revogações e APIs de leitura. Registrar duração e último ponto recuperável. Configurar pagamentos/créditos externos inexistentes no piloto como desabilitados também no restore; nunca iniciar workers restaurados contra participantes reais sem fencing.

## Atualização gradual e rollback

1. Assinar pacotes e imagens; fixar dependências/digests e SBOM; executar testes de contrato N/N−1, segurança e GPU por perfil afetado.
2. Canary em nós privados; rollout de 1%, 5%, 25%, 100% por cohort, com janelas e capacidade de contingência. Percentagens são política inicial, não obrigação de atualizar grupo pequeno antes de ter dois hosts aptos.
3. Drenar antes de trocar engine/pesos. Não alterar buffers de uma sessão ativa. Manter pacote anterior até confirmar nova versão e liberar refcounts.
4. Interromper rollout por regressão de erro >1 ponto percentual, OOM novo, falha de paridade/isolamento/ledger ou orçamento de latência excedido. Comparar baseline da mesma carga; segurança/contabilidade têm tolerância zero.
5. Reverter ponteiro para build/manifesto anterior não revogado e requalificar. Schema de DB usa expansão/contração; migrations incompatíveis exigem ensaio e plano específico, não rollback cego de binário.

Se versão anterior tiver falha de segurança grave, suspender o perfil em vez de restaurá-la automaticamente. TUF e assinaturas auxiliam integridade/freshness; não substituem revisão do código. [TUF](https://theupdateframework.github.io/specification/latest/).

## Incidentes e suporte

| Evento | Contenção | Recuperação e prova |
|---|---|---|
| Ledger diverge | Congelar emissão/admissão afetadas; preservar journal | Reconstruir projeção, conciliar outbox, ajuste auditado; invariantes zero |
| Configuração produz resposta incorreta/OOM | Quarentena daquele digest/profile; parar novas sessões | Reproduzir, corrigir, golden suite e canary; não desativar todo catálogo sem necessidade |
| Nó/conta frauda | Suspender novos leases e credenciais afetadas; preservar evidência mínima | Investigação, contestação e revisão; diferença numérica não condena automaticamente |
| Vazamento de prompt/chave | Revogar, limitar escopo, acionar resposta e usuários afetados conforme política aplicável | Rotação, causa, correção e teste; não prometer apagar cópias no host adversário |
| Relay abusado | Quotas por identidade/sessão/bytes; bloquear destino não autorizado | Expiração de capabilities e prova de encaminhamento restrito |
| Região/operador indisponível | Comunicar indisponibilidade; manter somente sessões autorizadas possíveis | Restore/failover com fencing; reabrir após reconciliação |

Logs de aplicação: 14 dias; traces amostrados: 7 dias; evidência de disputa: até 90 dias no piloto, com ACL e política revisada. Não logar conteúdo por padrão. Journal/deduplicação financeira têm retenção própria para preservar a história; separar identificadores pseudônimos de PII. A política definitiva depende dos mercados/obrigações aprovados antes da abertura, sem presumir jurisdição ou produzir aconselhamento jurídico.

App do contribuidor mostra motivo da recusa, recurso reservado, tarifa/duração, créditos aceitos/pendentes, próxima ação e link de incidente. Pausa local funciona sem controle: imediata quando escolhida, drenagem opcional; bloquear limite de energia não suportado com explicação, sem simular que foi aplicado.

## Encerramento e evolução operacional

Se a empresa original parar, identidade local, ofertas, gateways alternativos e liquidação independente devem continuar operáveis conforme o 18. Sessões daquele operador podem expirar, mas usuários devem verificar/retirar valores finalizados sem sua API. Planejar encerramento do serviço opcional, exportação e drenagem; não garantir sobrevivência da rede financeira externa ou streaming interrompido.

Interoperabilidade entre operadores e retirada independente são gates atuais da rede aberta, conforme [03](03_ARCHITECTURE.md), [18](18_OPEN_NETWORK_AND_COMPUTE_MARKET.md) e EP10 do [12](12_ROADMAP_AND_BACKLOG.md). DHT distribui descoberta, não consistência contábil. TU cooperativo requer regras/registro de serviço compartilhados; não é crédito financeiro entre operadores. Instrumentos adicionais de dívida exigiriam limites e aceitação específicos.

## Custeio e continuidade fechados na revisão 4

A política operacional vigente está consolidada no [24](24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md). Além dos limites de custeio abaixo, a v6 exige piso de renovação essencial, bootstrap rastreável e fase madura sem déficit coberto por nova emissão ou consumo da reserva. Caixa real, fluxo recorrente de TU e capacidade por modelo são critérios separados. Receita comercial considera serviço finalizado, custos atribuídos, repasses e perdas; depósitos não utilizados e TU não são receita monetária.

O [22](22_POLICY_CLOSURE_AND_CONTINUITY.md) exige 30 dias de operação mínima mais sete de encerramento reservados. Recursos cedidos entram com operador, capacidade e prazo; doação prometida sem confirmação não é caixa. Cobertura abaixo de 30 dias bloqueia crescimento; abaixo de 14 limita relays subsidiados; ao atingir a reserva de encerramento, drenar e hibernar. TU não paga automaticamente energia, domínio, link ou operador externo.

Para uma oferta comercial, calcular receita liquidada menos pagamento dos provedores, gateway, rede/verificação, taxas, tributos aplicáveis, perdas e contingência, evitando contar a energia já incluída no pagamento do provedor novamente como despesa da plataforma. Divisão percentual é hipótese da oferta, não prova de margem. Não subsidiar preço baixo com depósitos sacáveis ou receita futura presumida.

Na cooperação, TU existentes circulam para custear READY; emissão complementar continua limitada. Monitorar caixa monetário e reserva de TU separadamente, além de serviço útil por hora contribuída. O [23](23_INTEGRATED_ECONOMY_SIMULATIONS.md) mostra que zero compradores pode coexistir com rateio monetário e que saldo de TU não impede pausa por falta de caixa.
