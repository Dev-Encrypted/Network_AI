# Plano operacional consolidado e critérios de abertura

**Revisão 6 — 13/09/2026. Especificação corrigida; produto e piloto ainda não executados.** Este é o documento vigente para economia, contratação, continuidade e sequência de abertura. Substitui a revisão 5 deste mesmo arquivo, preservada no ZIP v5. Os documentos 07/09 detalham seus contratos; 20/22 conservam fundamentos e decisões anteriores. Em conflito, aplicar esta revisão. As 54 execuções do 23 continuam sendo evidência da v4, sem aprovação econômica.

## 1. Alternativa escolhida e motivo

Adotar uma **rede cooperativa com contratação de capacidade útil, créditos internos que circulam e mercado opcional entre contrapartes identificadas**. A contratação e o consumo têm orçamentos distintos, reconciliados no mesmo registro. A emissão financia entrada controlada e crescimento aprovado; não deve mascarar déficit recorrente.

| Alternativa | Decisão e consequência |
|---|---|
| Pagar todo nó online | Rejeitada: cadastro e oferta excedente não demonstram necessidade nem capacidade de resgate |
| Pagar somente tokens produzidos | Rejeitada como regra cooperativa: não remunera cobertura pronta e contraria a proposta do produto |
| Crédito mútuo com saldos negativos | Adiado: acrescenta risco de inadimplência, limites de crédito e cobrança antes de validar a cooperação |
| Expiração compulsória, rendimento por saldo ou moeda negociável | Fora do piloto: alteram direitos e incentivos sem corrigir falta de hardware ou de custeio |
| Disponibilidade contratada, circulação e reservas segregadas | Escolhida: preserva a proposta, limita compromissos e permite testar equilíbrio sem compradores |
| Um único meio de pagamento obrigatório para toda a rede | Rejeitado: o contrato da oferta declara a liquidação; o núcleo cooperativo não depende de uma cadeia financeira |

Não substituir suporte universal por uma promessa de catálogo já operacional. Qualquer participante pode publicar ofertas e criar um nó compatível; cada configuração precisa de runtime, licença, memória, rede e rota completa qualificados. Modelos gigantes distribuídos continuam pesquisa central em F0, com aprovação por arquitetura.

## 2. Corrigir primeiro o fluxo de TU

Na v5, todo consumo recompunha primeiro a reserva protegida. **Contraexemplo:** o fundo operacional está vazio, faltam 100 microTU na reserva protegida e entram 100 microTU de consumo finalizado. A v5 coloca tudo na reserva e deixa zero para renovação normal. Isso pode provocar DEFENSE por falta de liquidez, mesmo depois de um pagamento de uso. É uma falha da prioridade, não prova de que toda configuração v5 fracassaria.

Preservar dois compartimentos da mesma unidade:

| Controle | Finalidade | Regra |
|---|---|---|
| COOP_WORKING | Pagar contratações normais | Possui piso de renovação essencial e alvo de operação |
| COOP_CORE_RESERVE | Sustentar rotas essenciais em contingência | Proibido para expansão normal, grants e despesas em dinheiro |
| COOP_CONTINUITY | Apresentar o total coletivo | Agregado sem lançamentos próprios; não somar novamente no estoque |
| Caixa de operação | Pagar despesas externas efetivas | Dinheiro ou cessões em espécie identificadas, separados de TU |
| Fundos comerciais | Depósitos e direitos dos clientes/provedores | Nunca são caixa livre do núcleo ou cobertura de emissão |

Valores retidos para contratos, sessões e restituições são indisponíveis para novas promessas. Os alvos abaixo referem-se a saldo livre para compromissos futuros; obrigações já cobertas por holds não entram outra vez no custo futuro. Todos os saldos livres e retidos continuam em S.

### Dimensionar piso e alvos

O plano de capacidade publica custo por intervalo, rotas essenciais, réplicas normais, compromissos já cobertos, prazo de recomposição e evidência. Usar arredondamento conservador para reservar orçamento.

- Piso operacional F: custo das próximas renovações essenciais ainda não cobertas durante H.
- H: maior entre seis horas de referência e o atraso conservador de liquidação cooperativa acrescido de um lease máximo. Medir o atraso; antes de haver dados, usar o limite do contrato sob ensaio e declarar a hipótese.
- Alvo operacional W*: maior entre F e o custo das próximas 24 horas de operação normal aprovada ainda não coberta.
- Alvo protegido R*: custo de 72 horas do conjunto essencial de contingência qualificado. Não usa o custo de toda a frota anunciada.

Seis, 24 e 72 horas são referências de bancada, não valores ótimos. A medição pode exigir mais liquidez; nesse caso recalcular os alvos e provar que cabem no teto de exposição, ou reduzir o escopo antes da abertura. Não manter um teto de 24 horas para WORKING quando o piso necessário for maior.

### Prioridade de recomposição

Para consumo finalizado q e saldos livres W/R, fazer uma transação determinística:

    a = min(q, max(0, F - W))
    p = min(q - a, max(0, R* - R))
    w = min(q - a - p, max(0, W* - W - a))
    b = q - a - p - w
    W_depois = W + a + w
    R_depois = R + p
    q = a + p + w + b
    S_depois = S_antes - b

Ordem: **piso operacional → reserva protegida → restante do alvo operacional → queima do excedente**. O piso protege a próxima renovação; a reserva continua protegida contra expansão.

No contraexemplo, se F=60 e W*=100, a nova regra destina 60 ao operacional e 40 ao protegido. Não há emissão nessa transferência. Se q não cobre sequer o piso, admitir a insuficiência e limitar novos contratos; a fórmula não fabrica o que falta.

Gravar versão, saldos anteriores, alvos e parcelas por destino na liquidação. Reembolso reverte as origens sem reemitir TU reciclados; depois da finalização, reparação depende do fundo responsável. Devolução não pode ultrapassar a parcela original nem ser aplicada duas vezes. Mudança de alvo não redistribui valores já finalizados.

## 3. Contratar capacidade sem gastar toda a oferta

Escolher primeiro as rotas completas que atendem cobertura e demanda justificadas, incluindo memória de sessão, prefill, decode, comunicação, carregamento e contingência. Somente depois selecionar fornecedores e reservar as fontes de pagamento.

O orçamento identifica três motivos: cobertura essencial, expansão demandada ou experimento limitado. Saldo disponível, autochamadas, número de identidades e volume bruto de tokens não criam um quarto motivo.

Remuneração continua:

    ganho = duração READY verificada × tarifa aceita da capacidade atribuída

Carregar restos de arredondamento entre janelas. READY ocioso expressamente contratado recebe; anúncio, download e capacidade não contratada não recebem automaticamente. Todos os componentes de uma rota dividem seu orçamento, sem multiplicar a tarifa ao fragmentar identidades.

Entre ofertas equivalentes, aplicar rotação auditável por operador conhecido, capacidade útil e oportunidade já recebida. Publicar taxa de seleção, espera e motivos de recusa por classe. A regra não garante trabalho para todos ao mesmo tempo. Novos participantes usam o envelope limitado já definido no 22; fraude e identidade física continuam riscos mensuráveis.

Expansão ou sua renovação exige, cumulativamente:

1. Procura independente e compatível que justifique a capacidade adicional.
2. Contratos já aceitos preservados e nenhuma dupla reserva física.
3. Fonte normal coberta, mantendo o piso operacional após a nova reserva.
4. Reserva protegida recomposta e custeio externo suficiente.
5. Orçamento por grupo/época e limites de emissão respeitados.

Não retirar sessões válidas para recompor um indicador. Quando um critério falhar, suspender novas expansões, drenar ao prazo e recalcular o plano. Se uma rota distribuída deixa de existir, honrar os leases dos componentes úteis até sua drenagem; não renovar fragmentos sem utilidade aprovada.

### Estados de operação

| Estado | Entrada | Conduta |
|---|---|---|
| NORMAL | Rotas essenciais financiáveis por WORKING e emissão autorizada; registro/custeio saudáveis | Contratar mínimo; expansão somente com os cinco critérios |
| DEFENSE | Próximo lease essencial não cabe nessas fontes, ou falha exige substituição de contingência | Registro confirma incidente e permite CORE_RESERVE apenas para rotas essenciais previstas |
| RECOVERY | Condições mínimas voltaram; orçamento está em recomposição | Renovar gradualmente; exigir estabilidade por 24 h para normalizar expansão |
| HIBERNATING | Falta rota completa, financiamento mínimo ou custeio operacional | Interromper novas promessas afetadas, drenar, preservar saldos e checkpoints |
| Registro sem quorum | Não há confirmação segura | Bloquear novos gastos independentemente do estado econômico |

Cada uso protegido exige incidente, política, rota, prazo e hold exclusivos. Não depender de uma liberação manual por chamada. Sem orçamento para o conjunto essencial inteiro, operar apenas o subconjunto previamente qualificado e custeado. Retomada exige recursos, quorum, liquidez e custeio; ausência permanente deles não tem recuperação automática.

## 4. Fechar a conta em três dimensões

**Conservação contábil, equilíbrio recorrente e capacidade de atendimento são condições diferentes.**

### Estoque e emissão

S inclui TU livres/retidos de participantes e dos dois compartimentos. L contém apenas emissão futura já comprometida. J contém apenas reversões de TU queimados aprovadas ainda não lançadas. Transferência de TU existentes continua em S.

    E = S + L + J
    emissão_nova_autorizável <= max(0, 0,35 × C_ref_7_dias - E)

Manter também tetos de grupo/época, dotação coletiva de até emissão a contribuidores/19 e grants de até emissão a contribuidores/49. Reciclagem não gera outra dotação ou base de grants. Esses parâmetros prudenciais permanecem hipóteses, sem promessa de resgate imediato ou valor financeiro. C_ref usa recursos qualificados conjuntamente e preços de referência fixados; reajustar a tarifa pública não aumenta capacidade.

### Fluxo recorrente cooperativo

Para o escopo maduro, comparar consumo finalizado efetivamente reciclado com pagamentos normais de READY e demais obrigações aprovadas em TU. Excluir nova emissão, transferências da reserva protegida, doações extraordinárias e saldo inicial da fonte recorrente.

    cobertura_recorrente = TU reciclados no período / custo normal do período em TU

Cobertura inferior a 1 aponta déficit naquele escopo; reduzir novas contratações, rever demanda e custos ou explicitar subsídio com prazo. Não aumentar preços somente para fazer a equação passar: preço maior pode reduzir uso. A reserva dá tempo para recuperar; não transforma déficit permanente em equilíbrio.

Exigir no próximo ensaio uma fase madura de 30 dias, escopo e carga fixados, com nova emissão ordinária desativada, sem aporte extraordinário e sem redução dos saldos operacional/protegido para encobrir déficit. Falha rejeita a configuração autossustentável ensaiada. Crescimento aprovado pode usar emissão limitada em outra fase; misturar as fases esconderia o problema.

A fase madura também deve mostrar a evolução dos saldos dos participantes. Usar seu estoque inicial até deixá-los sem acesso não demonstra equilíbrio, mesmo que os fundos coletivos terminem cheios. Comparar demanda e liquidez por coorte ao início e ao fim; uma deterioração contínua impede aprovação de sustentabilidade. Cenários com saída/entrada de participantes ficam identificados separadamente do regime de composição fixa.

### Disponibilidade por modelo e acesso por coorte

Cruzamento entre quem contribui, os modelos que pretende consumir e as rotas disponíveis é obrigatório. Muitos créditos de modelos compactos não criam uma rota para o gigante. Registrar demanda por configuração, liquidez dos participantes e limites físicos; uma soma global de TU ou VRAM não aprova cobertura.

Contar pedidos desejados, pedidos com saldo e configuração suportada, e pedidos aceitos separadamente. Falta de rota temporária e recusas 429/503 não desaparecem do denominador compatível. Reportar também falta de saldo, concentração e participantes sem oportunidade de contribuição.

Para cada classe, publicar quantas chamadas de referência uma hora contratada compra, a qualidade/configuração e a distribuição de espera. A comparação só vale com modelo, tokenizer, precisão, contexto, cache, tamanho da saída e carga fixados. Métricas de latência e goodput ajudam a medir trabalho dentro do contrato. [Benchmarking do vLLM](https://raw.githubusercontent.com/vllm-project/vllm/main/docs/benchmarking/cli.md).

## 5. Entrada da rede sem saldo fictício

Não presumir uma reserva inicial pronta. A bancada privada começa com infraestrutura custeada e hardware cedido com prazo, sem criar saldo para fundadores.

1. Qualificar capacidade e estabelecer C_ref conservador com evidência.
2. Autorizar primeiros leases curtos dentro dos tetos de emissão; emitir apenas após READY verificado. Recibos novos aguardam revisão conforme a fonte.
3. Formar fundos por dotações limitadas, consumo útil finalizado e doações voluntárias de TU existentes, todas identificadas. Chamadas de laboratório têm orçamento experimental explícito.
4. Conferir simultaneamente fundos livres, holds, TU dos participantes e L/J dentro do teto. Não copiar o saldo inicial sintético da v4 para um gênese real.
5. Só abrir o piloto depois de atingir os alvos aprovados e demonstrar que os participantes conseguem consumir.

Não exigir compra para contribuir, nem devolução compulsória do que foi ganho. Se a formação dos fundos não fecha dentro do teto e da demanda observada, reduzir escopo ou prolongar a bancada; não criar uma exceção silenciosa de emissão.

## 6. Pouca demanda, concorrência e GPUs diferentes

Manter limites temporários 1/2/4 por configuração, com promoção gradual e sinais recentes. Mais folga permite mais uso simultâneo por quem tem saldo. Não aumentar contexto, emitir bônus permanente, mudar preço ou tomar a contingência como throughput livre. Na presença de fila, remover novos extras antes de afetar direitos aceitos.

Fila deve ter prazo, tamanho e backpressure; tentativas repetidas precisam de orçamento para não agravar sobrecarga. Essa preocupação é consistente com as práticas de tratamento de sobrecarga do Google SRE. [Referência primária](https://sre.google/sre-book/handling-overload/).

Perfis de GPU, sistema, engine, modelo, quantização e rede continuam separados. Manter três caminhos: modelo inteiro em nó, cluster próximo e distribuição experimental entre participantes. Provar paridade, estado, recuperação e desempenho do caminho C antes de anunciá-lo; a pesquisa de Kimi/modelos gigantes começa em F0.

TU continua unidade interna de uso. Tokens de texto são unidades de medição do modelo; uma chamada é cobrada pela tabela de sua configuração. Imagem, áudio e outras modalidades declaram suas próprias unidades. Não adotar equivalência universal entre um TU e um token de qualquer modelo.

## 7. Comércio com responsabilidade definida

Preservar **x402 batch-settlement/EVM, Base Sepolia, USDC de teste e SDK TypeScript como primeira referência de integração opcional**. O esquema documenta autorizações cumulativas e liquidação em lotes para chamadas recorrentes. [Documentação oficial](https://docs.x402.org/schemes/batch-settlement).

Essa escolha é de adaptador, não de moeda da rede nem requisito do TU. Nenhum contrato, facilitador, release ou saque está qualificado neste pacote. Outros operadores podem oferecer outros meios explicitamente, sem somar saldos ou promover uma oferta não qualificada ao selo do pool.

O contrato comum deve identificar comprador, vendedor responsável pela rota, configuração, preço máximo, unidade, fontes de fundos, medição, finalização, retirada, responsável por disputa e perda máxima. A carteira autoriza depósito e reposição com teto próprio; preço máximo por chamada não é autorização de depósito ilimitado.

No primeiro caminho comercial, **um vendedor assume a rota inteira perante o cliente**. Ele pode ser o próprio nó ou um operador de rota. Subcontratar componentes exige orçamento e contratos financiados antes dos respectivos aceites. O coordenador não ganha licença para custódia ilimitada; centralização ou custódia do vendedor precisa aparecer nos termos. Manter concorrência entre vendedores e gateways.

Não prometer divisão atômica entre componentes, redes ou moedas diferentes. Não cobrar o cliente duas vezes por retry e não deixar de pagar READY contratado de um componente por falha de outro. Repasses, taxas e quem cobre a perda devem caber no orçamento da oferta.

Retirada de depósito não reclamado e reparação de serviço já cobrado são obrigações distintas. O protocolo não prova qualidade da inferência. [Especificação EVM](https://github.com/x402-foundation/x402/blob/main/specs/schemes/batch-settlement/scheme_batch_settlement_evm.md).

Qualificação comercial exige teto com sessões concorrentes, persistência de vouchers, replay, cobrança parcial/streaming, reinício, reconciliação, disputa e retirada com gateway original desligado. Fonte de reparação e responsável precisam existir antes da oferta pública. Uma falha mantém o adaptador desabilitado; não bloqueia cooperação saudável.

A conta comercial usa receita de serviço finalizada menos remuneração de provedores, processamento de pagamento, infraestrutura atribuída, suporte e provisão de perdas. Depósito não utilizado, TU e dinheiro de terceiros não são receita. Comparar API mais barata somente com mesma configuração/qualidade, carga, latência e margem medida. Não fixar percentuais de repasse sem esse cálculo.

## 8. Confiança e regras estáveis

Manter o registro cooperativo federado de referência do 22: quatro organizações independentes, poder igual, quorum de três e integração CometBFT/ABCI existente. O nó de inferência é aberto; a função de validador possui admissão explícita. Isso não equivale à validação permissionless do Bitcoin.

A confirmação autoriza transições contábeis, não prova hardware ou cálculo. Atestação 2/3, revisão de novatos, limites agregados e direito de contestação permanecem. Antes de executar, qualificar release, dependências e operadores; não há consenso novo neste plano.

Aviso ordinário mínimo de 48 h, no máximo uma nova tabela por dia e variação inicial de até 10% por configuração. Alterações de direitos/emissão/governança seguem sete dias e quorum do 22. Contratos aceitos permanecem na versão acordada. Incidente pode suspender novas admissões sob regras existentes, sem apagar saldo.

## 9. Experimento que aprova ou rejeita a economia

A correção de prioridade recebe verificações pontuais em [v6-policy-reference-checks.json](evidence/v6-policy-reference-checks.json). Elas demonstram aritmética e contraexemplos limitados; não simulam mercado, comportamento humano, GPU ou consenso.

O próximo ensaio integrado deve:

1. Representar eventos e períodos reais dos contratos, filas, revisão de recibos, finalização, saídas e reembolsos. Declarar toda simplificação restante.
2. Comparar, com as mesmas cargas/choques, a v4 e as três variantes de decomposição previstas na v5. Acrescentar a v6 completa, mantendo uma comparação v5/v6 que mude somente a prioridade de recomposição.
3. Usar 20 sementes de calibração e 50 distintas de validação, publicadas antes dos resultados, por 90 dias sintéticos. A fase madura dos últimos 30 dias testa circulação sem nova emissão ou subsídio extraordinário.
4. Incluir zero compradores com uso, zero uso, demanda concentrada, retenção de TU, chegada/saída correlacionada, novos modelos, demora de liquidação, perda de fundos operacionais, fraude sem detecção e retorno de recursos.
5. Publicar séries por modelo/coorte, estoque livre/retido, custo normal, fontes de financiamento, espera, recusas, taxa de seleção e relação contribuição/consumo. Não escolher a melhor semente nem mudar o preço de referência para aprovar o teste.

Reimplementar os controles no mesmo ambiente de eventos e identificar as adaptações ao protocolo experimental. Não reetiquetar as 54 execuções históricas como se já contivessem revisão de recibos, piso operacional ou fase madura sem emissão.

Aceite básico: nenhuma violação contábil ou de recurso; zero hibernação econômica na carga aprovada; pelo menos 95% dos pedidos compatíveis com saldo dentro do contrato; fase madura sem déficit encoberto; relação de troca e acesso por coorte compatíveis com o envelope publicado. Publicar também demanda sem saldo e recusas, mesmo quando o SLO for atingido.

Choques podem causar degradação declarada. Retomar em até 24 h após recursos, quorum, liquidez e custeio mínimos voltarem, sem reinicializar saldos. Se não houver uma configuração que passe, a conclusão é reduzir escopo ou rejeitar a hipótese ensaiada, não afrouxar o indicador depois.

## 10. Responsáveis, ordem e critérios de abertura

Papéis abaixo precisam ser atribuídos a pessoas/organizações reais. Nenhuma equipe, compra ou financiamento foi presumido.

| Etapa | Responsável | Evidência necessária | Estado atual |
|---|---|---|---|
| FC01 — Contratos e coerência | Arquitetura + ledger | Regras vigentes, fontes S/L/J, prioridade e contratos sem conflito | Revisão documental e referências pontuais |
| FC02 — Economia e liquidez | Economia + scheduler | Simulação fiel, fase madura e coortes aprovadas | Ensaio integrado v6 pendente |
| FC03 — Capacidade e troca | Inferência + medição | GPU/modelo/rede medidos, custos e relação contribuição/consumo | Hardware/rastros reais pendentes |
| FC04 — Comércio opcional | Pagamentos + operação do vendedor | Adaptador, finalização, repasses, disputa e saída qualificados | Referência selecionada; integração pendente |
| FC05 — Confiança e continuidade | Segurança + operadores independentes | Fraude, quorum, partição, restauração e substituição de gateway exercitados | Operadores e testes reais pendentes |
| FC06 — Custeio e piloto | Operação + finanças | 30 dias de operação e sete de encerramento cobertos; pilotos 7/30 dias aprovados | Recursos não confirmados e piloto não executado |

Sequência principal: FC01 → medições FC03 e ensaio FC02, com retorno explícito à calibração → FC05 → FC06. Pesquisa de inferência gigante e desenhos de identidade/registro começam em F0. Não condicionar a primeira bancada privada de inferência a integrar pagamentos ou montar quatro organizações; não anunciar essa bancada como rede descentralizada operacional.

FC04 tem trilha independente e só libera comércio quando os critérios comuns também passam. Contrato e escolha do adaptador vêm antes da implementação de escrow; qualificação completa vem depois dos testes de fundos e disputa. Isso elimina dependências circulares entre escolha e prova.

O custeio inclui energia assumida pelos participantes, controle, verificação, relay, distribuição de pesos, suporte e substitutos. Cessão em espécie informa prazo e capacidade. Antes da abertura, confirmar os 30+7 dias; abaixo de 30 dias congelar expansão custosa, abaixo de 14 restringir caminhos caros, e preservar o fundo de encerramento.

**Conclusão de engenharia desta revisão:** o desenho foi corrigido e consolidado. Resultados pontuais não aprovam sustentabilidade ou operação pública. A próxima decisão de abertura depende dos ensaios integrados e das medições, mantendo explícitas as condições para reduzir oferta ou pausar.
