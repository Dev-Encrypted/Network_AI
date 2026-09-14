# Economia: primeiro ensaio de eventos

**Resultado: a configuração fictícia testada foi reprovada.** O programa executou 1.600 casos de calibração e 4.000 de validação, com 90 dias por caso. As 20 sementes de calibração e 50 de validação são distintas; preços, parâmetros, 16 cenários e cinco variantes foram registrados antes dos resultados. A validação usou o mesmo código e os mesmos parâmetros da calibração.

O [resumo verificável](evidence/economy-v1-summary.json) identifica os hashes do protocolo e dos arquivos brutos. O [protocolo registrado](../../benchmarks/economy-study-v1.json) tem SHA-256 `7853701865fd848517958132c04ee0220924969ca0d121474054789db59f7598`.

## O que foi executado

O simulador usa eventos individuais de pedidos, contratos de 900 segundos, fila de 120 segundos, revisão de recibos de 24 horas — 72 horas no cenário de atraso —, cancelamentos, falhas e reversões de cobranças finalizadas. Os saldos começam em zero. A emissão por READY é comprometida em `L` antes da contratação; saldo reservado continua em `S`; somente a reversão aprovada de TU queimado entra em `J`. Reembolsos de valores reciclados precisam reservar recursos existentes.

Os últimos 30 dias suspendem a emissão ordinária. O dinheiro operacional é um contador separado, com contribuição regular explicitamente hipotética e cenário de perda desse custeio. Nenhum comprador em dinheiro é necessário no cenário básico. Não houve crédito real emitido ou transferência financeira.

Os 5.600 casos passaram nas invariantes contábeis e de reserva de recursos implementadas. **Zero casos passaram em todos os critérios econômicos implementados.** A igualdade dos lançamentos não garante circulação, cobertura nem acesso.

## Comparação no cenário básico

Taxa agregada de conclusão visível dos pedidos compatíveis com saldo durante a fase madura, nas 50 sementes de validação. A meta registrada é 95%; recusas por capacidade permanecem no denominador.

| Variante no ambiente comum de eventos | Conclusão | Resultado |
|---|---:|---|
| v4: disponibilidade, fundo único | 47,36% | Reprovada |
| v5: demanda, fundo único | 15,75% | Reprovada |
| v5: disponibilidade, fundos separados | 70,32% | Reprovada; também usa reserva protegida |
| v5: demanda, fundos separados | 39,90% | Reprovada; também usa reserva protegida |
| v6: demanda, recomposição do piso primeiro | 15,75% | Reprovada |

Essas são decomposições de política no novo simulador. Não são reexecuções idênticas do programa horário histórico da v4 e não o substituem.

## Causa observada

O cenário fictício mantém uma rota compacta e uma rota grande como cobertura essencial. A rota grande exige três provedores, a 2 TU/h por provedor; a compacta custa 1 TU/h. São 168 TU/dia de cobertura contínua, antes de qualquer expansão. O cenário gera 96 desejos de uso/dia, com preços de 2 TU e 8 TU e participação de 25% do modelo grande.

A demanda desejada não vira automaticamente consumo financiado. Os provedores compactos recebem uma parcela pequena dos pagamentos e muitos pedidos ficam sem saldo. Provedores grandes acumulam TU que não retornam na mesma velocidade à operação. A emissão inicial sustenta parte desse desequilíbrio; quando termina, a cobertura cai. Priorizar o piso operacional corrige a ordem de recomposição, mas não cria o fluxo que está faltando.

Na semente de calibração 1001 da v6, o grupo grande termina com 3.933,5 TU livres e o grupo compacto com 8,25 TU, enquanto o último dia registra zero custo de contratos novos. É um exemplo rastreável da concentração e da paralisação, não uma previsão sobre participantes reais.

## Consequência para a execução

FC02 permanece aberto. Não transformar os preços, recompensas ou cobertura desse experimento em configuração pública. A próxima calibração precisa tratar a combinação de cobertura essencial, janelas contratadas, demanda efetivamente financiada e liquidez por grupo. Modelos de pouca procura podem exigir cobertura agendada ou contratada por interessados; o anúncio de um modelo não obriga o fundo comum a mantê-lo disponível continuamente.

Isso precisa ser ensaiado com novos parâmetros e novas sementes de validação. As 50 sementes usadas aqui já foram observadas e não devem ser reapresentadas como validação inédita de uma revisão ajustada a esses resultados. Nenhum saldo existente seria reduzido retroativamente.

## Limites do experimento

Velocidades, preços, disponibilidade, retenção e caixa são hipóteses. Atestação e quorum entram como condições simuladas; não houve consenso federado ou comprovação de hardware. Os limites elásticos 1/2/4 ainda não estão integrados. O critério de retomada em 24 horas precisa de um avaliador explícito do instante em que **todos** os pré-requisitos voltam. O resultado `synthetic_candidate_passed` dos arquivos brutos se refere somente aos critérios implementados; o resumo marca `full_policy_acceptance_evaluated=false`.

Os dados publicam demanda sem saldo, filas e recusas, fontes de pagamento, saldos livres/retidos, séries diárias, seleção de provedores e consumo/contribuição por grupo. Não há aprovação de economia real, de preço de mercado ou de abertura pública.
