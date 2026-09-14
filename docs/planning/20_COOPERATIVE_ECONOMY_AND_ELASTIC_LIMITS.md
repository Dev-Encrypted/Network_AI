# Cooperação autônoma, tokens de uso e limites elásticos

**Direção vigente — 13/09/2026.** A rede precisa funcionar para seus participantes mesmo com **zero compradores em dinheiro**. Disponibilizar capacidade útil gera tokens para consumir outros modelos. Vendas comerciais são uma fonte adicional de receita, não condição para a cooperação existir.

Esta revisão corrige a dependência indevida de dinheiro introduzida nos documentos 16/18. Preserva nós e ofertas abertos, GPUs heterogêneas, modelos comunitários, mercado opcional e independência do operador. Pagamento financeiro financiado vale somente para comércio. O [22](22_POLICY_CLOSURE_AND_CONTINUITY.md) completa esta política: circulação de TU, reserva, preços, fila, fraude e governança. O [24](24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md) consolida a política vigente: contratação por necessidade, piso operacional antes de recompor a reserva protegida, alvo normal, queima e equilíbrio recorrente. Os detalhes históricos abaixo não substituem essas regras. O [23](23_INTEGRATED_ECONOMY_SIMULATIONS.md) registra a simulação integrada v4 e a reprovação da configuração sintética para abertura; não testa a política v6. O 21 conserva referências parciais da revisão anterior.

## 1. Resposta à hipótese de pouca demanda

**Sim: capacidade disponível com pouca procura permite limites maiores.** O critério é a procura total e a capacidade compatível do modelo, incluindo uso por créditos, clientes pagantes, memória, rede, contingência e sessões já autorizadas.

| Situação | Política |
|---|---|
| Nenhum comprador, participantes usando a rede | Ganhos e consumo em TU continuam; não exigir depósito financeiro |
| Poucos pedidos e capacidade compatível livre | Ampliar quota de trabalho e concorrência, até limites de segurança |
| Nenhum comprador, mas fila cooperativa cheia | Manter distribuição justa e limites de carga; ausência de vendas não significa ociosidade |
| Modelo compacto ocioso e gigante congestionado | Ampliar acesso ao compacto; não anunciar folga inexistente no gigante |
| Dinheiro disponível, porém modelo sem rota pronta | Não admitir execução que o hardware não sustenta |
| Muitos anúncios, nenhuma capacidade pronta | Não emitir por cadastro/arquivo; não mostrar serviço disponível |

Receber 20 vezes mais saldo permanente porque a rede está vazia criaria compromissos para o horário de pico. A proposta amplia **a oportunidade de usar capacidade agora**. Saldo acumulado segue regras próprias de contribuição e emissão.

## 2. Dois saldos e uma condição temporária de acesso

| Elemento | Como nasce | Para que serve | Limite |
|---|---|---|---|
| **Tokens de uso — TU** | Reserva útil cooperativa aceita e verificada; grants limitados | Consumir ofertas que aceitam a unidade cooperativa | Não são dinheiro, depósito, ativo com saque ou promessa de câmbio |
| **Saldo de pagamentos** | Depósito/receita comercial efetivamente confirmado | Pagar e receber venda de inferência; retirada no ativo escolhido | Nunca aumenta porque houve emissão de TU |
| **Limite elástico** | Folga atual de recursos e divisão entre participantes elegíveis | Mais trabalho/concorrência enquanto houver capacidade | Não é saldo; não acumula, transfere ou vira direito futuro |

TU usa **1.000.000 microTU por TU**, inteiros e namespace de rede. Tokens de texto continuam sendo outra contagem. Pagamentos usam `payment_unit_id` e quantidades atômicas do ativo, com carteira separada. A interface não soma TU e dinheiro numa cifra única e não apresenta o ganho cooperativo como valor sacável.

TU recebido por contribuição pode ser usado em qualquer modelo/oferta que aceite **a mesma unidade cooperativa e sua política de confiança**. Nenhum protocolo obriga um provedor comercial independente a aceitar TU. O catálogo mostra o modo aceito antes de enviar conteúdo. Criar novo pool não lhe dá autorização para imprimir a unidade de toda a rede.

Não haverá conversão automática TU→dinheiro, dinheiro→TU ou troca silenciosa do modo de cobrança. Um comprador pode escolher pagar uma chamada comercial sem ter GPU; um contribuidor pode escolher usar TU sem ter comprado nada. Pagamentos opcionais de associação/patrocínio podem financiar infraestrutura, mas não tornam TU equivalentes a moeda.

## 3. Como ganhar TU sem compradores

O participante oferece um recurso à cooperação. O coordenador escolhido propõe um lease com modelo/configuração, parcela de recursos, prazo e taxa em microTU/s. Antes do aceite, reserva TU existentes para pagamento e o teto de emissão complementar autorizado, conforme o 22. Depois de load, validação e readiness, janelas verificadas geram ganho em TU. Não é necessário ter havido uma venda ou um pedido naquele segundo.

```text
ganho_microTU = floor(ms_verificados_acumulados × tarifa_microTU_por_segundo / 1000)
```

Carregar restos entre janelas; tarifa aceita não muda durante o lease, inicialmente de até 15 minutos. READY ocioso pode ser útil para manter um modelo acessível e permitir a próxima sessão. O orçamento de cobertura mínima existe por configuração demandada pela comunidade, incluindo bootstrap controlado de modelos novos.

Não manter remuneração automática para todo modelo que alguém publicar. O recurso precisa integrar uma oferta executável, cobertura aprovada pelos participantes do pool ou uma contingência necessária. Publicação continua aberta; elegibilidade a receber a unidade cooperativa exige regra verificável. Não pagar download, GPU declarada, contêiner sem engine pronta ou cinco identidades da mesma reserva.

Pesos de contribuição vêm de capacidade útil por hardware/modelo/papel: memória utilizável, prefill/decode, slots, comunicação e estado. O custo total da rota limita suas parcelas; não pagar por expert como se cada um fosse uma GPU inteira. No C, falha de outro componente não cancela retroativamente disponibilidade devidamente contratada dos demais; drenar e honrar o compromisso até o prazo.

**Ao consumir TU, o valor sai do saldo do consumidor.** A parcela necessária recompõe a reserva até seu alvo publicado; o restante sai da circulação gastável. Essa destinação não altera o preço da sessão. TU existentes financiam novos contratos de READY; o executor não ganha uma segunda emissão pela mesma chamada/alocação. Circulação, liquidação e estorno são definidos nos documentos 07/22.

## 4. Crédito acumulado sem emissão ilimitada

Existem três controles: orçamento por época/grupo, exposição de serviço acumulada e capacidade física no modelo/horário. Eles operam sem usar receita comercial como requisito.

```text
S = TU de participantes e da reserva, disponíveis ou retidos
L = teto ainda não emitido de leases/reserva/grants já aceitos
J = estornos aprovados de TU queimados ainda não relançados
E = S + L + J
C_ref = capacidade cooperativa prudencial em 7 dias, avaliada a preços de referência fixos
folga_estoque = max(0, 0,35 × C_ref − E)
novo_compromisso <= min(folga_estoque, folga_epoca, folga_grupo)
```

`C_ref` é projeção conservadora da capacidade **já qualificada**, respeitando reservas comerciais, contingência, hardware compartilhado, distribuição por modelo e incerteza. Não somar a mesma GPU em vários modelos. Não aumentar a referência simplesmente reajustando preço. Esta é cobertura de serviço, não reserva financeira nem garantia de atendimento instantâneo.

Emitir transforma `L` em `S`, sem aumentar `E` além do compromisso autorizado. Hold/transferência de TU existentes não reduzem `S`; não entram novamente em L. Estorno da parcela queimada já lançado sai de `J`; estorno por transferência debita fundo existente, sem J adicional. Encerramento de lease libera sua parcela não emitida e holds não gastos. Tudo exige uma fotografia consistente para não contar duas vezes.

Um orçamento inicial de expansão pode remunerar cobertura útil mesmo antes do primeiro consumo, limitado pela oferta qualificada e pelo teto prudencial. Depois, consumo cooperativo, cobertura desejada e estoque orientam novas contratações. **Zero vendas não zera o orçamento de TU.** Zero uso por muito tempo, por outro lado, exige diminuir compromissos futuros para não acumular créditos sem utilidade correspondente.

Hipóteses de controle: alvo de 35%, alerta acima de 50% e incidente acima de 80% da capacidade prudencial. Não renovar promessas acima do limite normal; preservar contratos aceitos. Na queda de capacidade, reduzir expansão e grants, procurar substitutos e comunicar filas. Congelar toda a capacidade necessária indiscriminadamente pode agravar a saída de nós: tratar continuidade como incidente próprio, sem fingir que uma equação repõe GPUs.

TU ganho não expira automaticamente e não sofre corte retroativo. Isso preserva sua quantidade nominal, não preço futuro constante nem disponibilidade perpétua. Novos leases podem oferecer tarifa menor ou deixar de ser propostos; o nó vê essa condição antes de aceitar e pode pausar. Participação voluntária adicional pode continuar sem novo ganho, com acesso elástico quando houver sobra, sem promessa disfarçada de remuneração.

Grants de onboarding têm teto proposto de até **2% da emissão cooperativa realizada no período**. Em microTU, `grants_emitidos + grants_pendentes <= floor(emissão_contribuidores / 49)`, além dos limites de campanha/exposição. Não financiar esse benefício por um cadastro ilimitado. Dias UTC e parcelas de leases que cruzam épocas ficam registrados; virada do dia não duplica benefício.

## 5. Como aumentar os limites quando sobra capacidade

### Quantidades que podem mudar

- **Orçamento de trabalho por janela:** custo de referência dos pedidos admitidos, considerando modelo, entrada, saída e estado.
- **Concorrência:** número de sessões adicionais, somente quando slots, memória e rota suportarem.
- **Fila/lotes flexíveis:** mais trabalho autorizado com prazo explícito, sem tomar recursos já contratados.

Contexto máximo, arquitetura, precisão e formatos continuam sujeitos à qualificação. Uma GPU de 8 GiB não passa a suportar uma configuração de 80 GiB porque há poucas pessoas. O controlador não amplia automaticamente contexto ou saída além do orçamento de memória medido.

No primeiro piloto, **manter a tarifa de TU por trabalho estável**. Aumentar limites já torna a rede mais usável sem acrescentar instabilidade de preços. Desconto fora de pico pode ser experimento posterior, limitado ao custo/risco medido e fixado na cotação; não será necessário para a cooperação funcionar.

### Divisão da capacidade

`C_safe` é capacidade admissível após descontos de manutenção, overhead, recuperação e contingência, com recursos viáveis em conjunto. A parte comercial confirmada é subtraída uma vez. Dentro da parcela cooperativa, contas elegíveis disputam trabalho por round-robin com déficit de custo, agregando chaves/subcontas conhecidas.

```text
C_coop_agora = C_safe − capacidade_comercial_ja_reservada
quota_ilustrativa_por_pessoa = min(teto_qualificado, C_coop_agora / pessoas_elegiveis)
```

A divisão acima serve para visualizar **tarefas de custo igual**. A execução real usa custo de referência e orçamento multidimensional; não trata todas as chamadas ou modelos como equivalentes. Saldo autoriza consumo, mas não entra como peso para passar na frente. DRF é referência de comparação, sem transportar suas garantias para uma rede hostil por simples analogia. [Ghodsi et al., NSDI 2011](https://www.usenix.org/conference/nsdi11/dominant-resource-fairness-fair-allocation-multiple-resource-types).

**Exemplo fictício:** se um grupo oferece 40 tarefas equivalentes/minuto, 10 participantes elegíveis dividem aproximadamente 4 por pessoa. Com duas pessoas, podem chegar a 20 por pessoa, respeitando saldo, duração e slots. As 40 tarefas totais não aumentaram: cada pessoa acessa uma fração maior da mesma capacidade. Se 10 unidades já estiverem comercialmente reservadas, a divisão cooperativa usa as 30 restantes.

### Estados e estabilidade

| Estado proposto | Condições observadas | Concorrência máxima por conta/grupo |
|---|---|---:|
| Normal | Perfil saudável, sem folga sustentada demonstrada | 1 |
| Folga | Pressão regular abaixo de 50%, sem fila, durante 5 min | Até 2 |
| Folga ampla | Após alcançar 2×, pressão regular abaixo de 25% e sem fila por mais 5 min | Até 4 |
| Congestionado | Pressão acima de 85% ou espera elegível acima de 10 s | 1 para novas admissões, com fila/cotas |
| Inválido/degradado | Telemetria essencial vencida, OOM, rota inválida ou perda de capacidade | Bloquear extras; suspender novas sessões se não houver prova de recursos |

Esses números são **tetos iniciais, não garantias**. O limite final é o menor entre conta, configuração, slots físicos e orçamento de trabalho. Pressão combina procura regular com CPU/GPU, memória/estado e rede; percentual de utilização da GPU sozinho não basta. A procura regular deve ser distinguida do trabalho extra já emprestado para não ligar/desligar o modo apenas porque o próprio empréstimo ocupou a GPU.

Reavaliar periodicamente a cada 30 s; eventos de fila concorrente ou perda de recurso invalidam a autorização de novos extras imediatamente, sem esperar o próximo ciclo. Subir limite no máximo um nível após uma janela estável de 5 min. Reabrir extras só após estabilização. Métricas vencidas não significam capacidade livre. Uma chegada real de usuários ativa a redistribuição sem esperar uma janela de promoção.

O limite maior não fica guardado para amanhã. Cada chamada recebe teto e prazo no aceite, sem mudança de preço posterior. Quando a procura aumenta, parar novas sessões extras e deixar as aceitas terminar no envelope contratado. Extras têm prazo inicial máximo de 60 s e carga admitida que caiba nele; requests maiores usam o perfil regular. Informar esta escolha ao cliente, sem cortar silenciosamente uma sessão longa para recuperar capacidade. Queda física de nó continua sujeita à política de falha/estorno.

## 6. Acesso, concentração e fraude

O participante não precisa comprar tokens para começar a contribuir. Após disponibilidade verificada e ganho liquidado, pode consumir. Um convidado sem GPU pode receber grant limitado; em todos os casos, chamadas precisam de TU ou da modalidade comercial explicitamente escolhida. Propostas de uso totalmente gratuito por sobra ficam fora do primeiro piloto para não acumular um terceiro mecanismo de distribuição antes de medir o básico.

Manter oportunidade de novos contribuidores dentro do orçamento, com rotação entre ofertas equivalentes. Não pagar mais por muitas identidades ou por declarar GPU rara. Modelos particulares podem ser publicados livremente; remuneração cooperativa depende de utilidade/cobertura aceita, não de quantos modelos o nó anuncia.

Testar autochamadas, famílias de contas, modelos falsos, double booking, nós que só respondem a probes, inflação de tokens processados e conluio entre verificadores. Emitir por tempo útil contratado e consumir sem bônus de trabalho elimina um caminho de autoemissão, mas não prova resistência a toda fraude. IP compartilhado não deve condenar usuários automaticamente. Um ataque pode causar demanda e reduzir limites; o controlador precisa preservar seus tetos mesmo quando não sabe identificar o atacante.

Redes cooperativas com créditos de contribuição já têm precedentes: o FAQ do AI Horde descreve kudos e distingue esse mecanismo de dinheiro. Nossa política de disponibilidade, saldo e fila exige validação própria; não copiamos sua prioridade por saldo nem presumimos sua arquitetura descentralizada. [FAQ oficial do AI Horde](https://github.com/Haidra-Org/AI-Horde/blob/main/FAQ.md).

## 7. Comércio adicional sem consumir a cooperação inteira

Cada participante escolhe se oferece recursos à cooperação, ao comércio ou a ambos, por parcelas/intervalos explicitamente reservados. Uma alocação que gera TU cooperativo não recebe simultaneamente pagamento integral por spot. Uma operação legítima pode conter partes distintas; cada uma tem modo e fonte de recompensa próprios.

Política de referência para um pool misto: **pelo menos 75% de `C_safe` para cooperação e até 25% para novos compromissos comerciais**, por grupo/janela. São hipóteses que cada pool anuncia e seus membros aceitam, não uma regra que toma recursos de outros operadores. Se não há reserva comercial, a cooperação pode usar 100% da capacidade segura. Recursos de recuperação já foram descontados antes desses percentuais.

O empréstimo termina antes de uma reserva comercial previamente aceita precisar da capacidade. Sessão cooperativa extra só entra se seu prazo couber nesse intervalo; promessa comercial futura não é “sobra” disponível indefinidamente. Não vender a mesma parcela duas vezes nem retirar de uma sessão em andamento capacidade que já lhe foi autorizada.

Receita comercial divide-se entre providers, gateway, operação e reservas conforme a oferta. Os exemplos 90/6/2/2 do 18/19 valem para **pagamentos**, não para emissão de TU. Um pool pode gastar receita real em relays, verificadores, backup ou capacidade de contingência, aumentando a utilidade geral. Não lançar a mesma receita como ganho sacável do provider e fundo livre do pool.

Quando não existem compradores, os participantes continuam pagando sua energia e internet, e alguém precisa sustentar descoberta, ledger, relays e suporte: operadores voluntários, rateio, doações ou orçamento inicial identificado. Crédito de uso não paga automaticamente uma fatura externa. Infraestrutura pode ser descentralizada e custeada pelos próprios nós; a estimativa deve registrar quem suporta cada custo.

## 8. Consistência descentralizada dos dois saldos

Identidade, anúncios e execução continuam abertos conforme o 18. O journal local de um gateway não pode inventar TU aceitos por todos. A unidade cooperativa usa registro compartilhado verificável com regras de emissão, gasto, epoch, configuração e evidências, mantendo separado o ledger financeiro.

A decisão de integração está fechada no 22: CometBFT v0.38.26 como referência de bancada, com aplicação TU determinística via ABCI. Fixar build e revisar segurança antes da execução; não desenvolver consenso novo. O caminho financeiro é separado; sua falha não bloqueia TU saudável. Escolha de tecnologia não equivale a implantação aprovada.

Laboratório: quatro organizações validadoras independentes, peso igual e confirmação por três. É fase federada; criar nó de inferência e publicar oferta continua aberto. O 22 define candidatura, rotação, prazos de mudança, recurso e recuperação. Não equivale ao consenso aberto do Bitcoin; implementar e exercitar essas regras antes da abertura. Consenso não prova que recibos físicos são verdadeiros. [CometBFT](https://raw.githubusercontent.com/cometbft/cometbft/v0.38.x/spec/consensus/consensus.md).

Consenso pode impedir gasto duplo conforme suas hipóteses. Ele não prova que a GPU trabalhou. Atestadores de disponibilidade, seus conflitos de interesse e limites de emissão continuam explícitos. Diante de partição sem confirmação segura, não inventar novos saldos: finalizar sessões já autorizadas quando possível, deixar recibos pendentes e retomar após reconciliação. Não afirmar que operação offline irrestrita preserva saldo global.

## 9. Contratos e interface

Usar `billing_mode: cooperative | commercial`, fixado na cotação. No cooperativo: `coop_network_id`, `max_cost_microtu`, `cooperative_hold_id`, tarifa de referência e versão do limite. No comercial: `payment_unit_id`, `max_payment_atomic`, autorização de fundos, divisão e política de disputa. Uma sessão tem um único modo; operações compostas precisam de sessões/parcelas autorizadas separadamente. Payload que mistura modos é rejeitado; falta de saldo em um não muda automaticamente para o outro.

Oferta informa `accepted_billing_modes`, configuração, recursos, confiança, prazo e evidência. Lease informa `reward_mode`, tarifa e parcelas de financiamento: `issuance_budget_id`, `continuity_hold_id` ou `funding_position_id`, uma fonte por parcela. Soma das parcelas não excede a remuneração única contratada. O registro explica duração, peso útil, regra, eventual não remuneração e contestação.

Na interface, mostrar: “Tokens de uso”, “Saldo de pagamentos” e “Limite atual”. Exemplo: “Até 4 sessões enquanto houver folga; novos pedidos extras podem ser limitados quando a fila aumentar”. Mostrar contexto máximo e custo por modelo à parte. Não vender o teto de 4 como capacidade garantida nem exibir tokens de teste como dinheiro.

## 10. Plano de validação e decisões

| Etapa | Entrega | Evidência exigida |
|---|---|---|
| Especificação atual | Dois saldos, emissão por disponibilidade, limites elásticos, fontes de custo e simulações | Coerência entre documentos; cálculos reproduzíveis; parâmetros identificados como hipóteses |
| Bancada | Perfis distintos de GPU/modelo, recursos reais e dois modos de cobrança | Capacidade segura medida; mesma alocação não ganha duas vezes; conta cooperativa funciona sem depósito |
| Piloto cooperativo de 7 dias | Zero vendas, contribuição, TU e consumo em outro modelo | Ganhos/consumos corretos, limite aumenta com folga e cai sem alterar sessão aceita |
| Estresse e piloto de 30 dias | Procura variável, desconexões correlacionadas, ataques e estoque acumulado | Sem saldo negativo/gasto duplo, sem emissão fora de compromisso, filas e custos medidos |
| Mercado opcional | Venda e retirada reais dentro do escopo aprovado | Ledger de pagamentos conservado; TU não vira saque; cooperação mantém parcela prometida |
| Abertura da rede | Operadores alternativos, governança de registro explicitada e saída independente | Não depender do gateway original; declarar quais componentes ainda têm admissão/autoridade restrita |

Medir trabalho útil por TU, tarefas resgatadas por hora de contribuição, tempo de fila por coorte, disponibilidade por modelo, custo elétrico, falsos positivos de fraude, custo operacional e benefício de aumentar limites. Não classificar crescimento de saldo sozinho como sucesso.

O [21](21_COOPERATIVE_SIMULATIONS.md) registra cenários sem compradores, saturação cooperativa, ociosidade localizada, promoção gradual, retorno de demanda, estoque, grants, dois saldos e capacidade comercial. EP11 no [backlog](12_ROADMAP_AND_BACKLOG.md) transforma as incertezas em critérios de implementação. Um plano bem pensado explicita seus limites e como será corrigido quando medições contrariarem suas hipóteses.
