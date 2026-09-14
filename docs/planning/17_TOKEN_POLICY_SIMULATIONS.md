# Simulações aritméticas da política de tokens

**Cálculos históricos preservados:** estes 18 casos pertencem à primeira revisão da economia de serviço. O [20](20_COOPERATIVE_ECONOMY_AND_ELASTIC_LIMITS.md) apresenta fundamentos cooperativos e o [21](21_COOPERATIVE_SIMULATIONS.md) cobre 20 referências da revisão 3. A política vigente está consolidada no [24](24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md). Algumas regras de estoque e grants foram retomadas, mas o conjunto antigo — inclusive o teto diário 95% e limite ocioso 2× — não é configuração ativa. O comércio financeiro tem escopo separado nos [18](18_OPEN_NETWORK_AND_COMPUTE_MARKET.md)/[19](19_OPEN_MARKET_SIMULATIONS.md).

Revisão de **13/09/2026**. Foram executados **18 cenários determinísticos**, com resultados reproduzíveis usando Python padrão e entradas fictícias. O resultado `passed_arithmetic` significa que as contas satisfizeram as condições declaradas. Não significa que a rede foi implementada, que fraude foi resolvida ou que hardware, demanda e financiamento foram validados.

As regras e sua interpretação estão no [16](16_TOKEN_ECONOMY_AND_FAIR_DISTRIBUTION.md). Parâmetros ficam em [token-economy-policy.json](evidence/token-economy-policy.json), cálculo em [simulate_token_economy.py](evidence/simulate_token_economy.py) e entradas/saídas completas em [token-economy-simulations.json](evidence/token-economy-simulations.json). O relatório vincula por SHA-256 a política e o script que produziram os resultados.

## Resultados

| Caso | Situação | Resultado calculado | Interpretação e limite |
|---|---|---|---|
| T01 | 2.000 tokens de entrada + 500 de saída em três perfis fictícios | 4 / 16 / 80 TU | Saldo comum compra quantidades diferentes por modelo; não são preços de modelos reais |
| T02 | Autorizar até 1.000 de saída e produzir 500 | Holds de 6 / 24 / 120 TU; liberações de 2 / 8 / 40 TU | Reserva máxima e cobrança efetiva são distintas; concorrência real de banco não foi testada |
| T03 | Dos 2.000 tokens de entrada, 500 têm cache confirmado no compacto | Consumo de 3,625 TU dentro do hold de 6 TU | O desconto cabe no teto; confirmação de cache depende de implementação |
| T04 | Fragmentar um segundo em 1.000 recibos, a 1.501 microTU/s | Acumulado correto: 1.501 microTU; arredondamento isolado incorreto: 1.000 | Carregar resto evita perda por fragmentação; não verifica autenticidade de recibos |
| T05 | Orçamento de rota de 420 TU, pesos 1:2:4; dividir peso 4 em 2+2 | 60 / 120 / 240 TU; duas parcelas finais somam os mesmos 240 | Não há vantagem aritmética ao dividir peso real; identidade falsa capaz de inventar peso continua risco |
| T06 | `C_ref=1.000`, saldo 200, compromissos 50 e estornos pendentes 10 TU | Exposição 260; folga de estoque 90; com folga diária de 70, compromisso máximo 70 TU | Os limites de estoque, fluxo e grupo atuam simultaneamente |
| T07 | Com folga inicial de 90 TU, aceitar dois leases de até 60 | Primeiro cabe; segundo dispõe de apenas 30 TU | Comprometer antes de emitir evita prometer a mesma folga duas vezes; corrida entre transações ainda exige teste real |
| T08 | Emitir parte de lease, criar hold ou lançar estorno já aprovado | Exposição continua 260 TU; hold mantém estoque de 200 TU | Movimentos internos não podem esconder obrigações; valores já lançados saem do campo pendente |
| T09 | Durante sete dias, resgatar 20 TU/dia e começar com 300 | Emissão fixa de 100/dia leva a 860; teto de 19/dia leva a 293 | Baixa demanda torna emissão fixa insustentável no exemplo; saída de GPUs não está modelada |
| T10 | Queda de demanda durante lease aceito a 1.000 microTU/s por até 900 s | Após 450 s verificados: 450.000 ganhos + 450.000 comprometidos | Previsão nova não reduz tarifa aceita retroativamente |
| T11 | Exposição constante de 300 TU; capacidade cai de 1.000 para 500, 300 e zero | Normal → alerta → crítico → sem capacidade | Detecta deterioração sem emissão nova; não cria GPUs de reposição |
| T12 | Reajustar preço público em 10%, sem mudar hardware nem cesta de referência | `C_ref` permanece em 1.000 TU de referência | Não mascarar risco elevando artificialmente o denominador para 1.100 |
| T13 | Capacidade por janela: 90 pedidos compactos e 10 gigantes; chegam 50 gigantes | Atende 10; 40 esperam ou recebem indisponibilidade; capacidade compacta pode ficar livre | Saldo agregado não garante substituição de modelo ou disponibilidade específica |
| T14 | 100 unidades de serviço, com 60 cooperativas + 20 pagas | Restam 20; alternativa 90+20 é rejeitada por exceder capacidade | Receita comercial e resgate compartilham recursos; não prova rentabilidade em dinheiro |
| T15 | 980 TU emitidos por contribuição e grants limitados a 2% do total realizado | Grants máximos de 20 TU; total de 1.000 TU | Sem contribuição emitida, esse limite não cria concessão; demais tetos também se aplicam |
| T16 | Ganhar 30 TU por reserva e gastar 4 em autochamada, sem bônus de trabalho | Saldo líquido incremental cai de 30 para 26 TU | Não há emissão adicional pela chamada; manipulação da previsão de demanda continua fora da prova |
| T17 | Exemplo do ledger: ganhar 600.000 microTU, reservar 400.000, consumir 250.000, estornar 50.000 | Disponível final 400.000; consumo líquido 200.000 | Preserva a soma original e a mudança de nome NC→TU, sem teste de serviço real |
| T18 | Duas contas elegíveis com 10.000 e 100 TU, tarefas iguais e dez oportunidades alternadas | Cinco tarefas para cada uma | Saldo não muda a rotação neste exemplo; não prova justiça em cargas heterogêneas ou identidades adversárias |

## O que os resultados exigem do projeto

O mecanismo deve limitar compromissos antes do pagamento, preservar preços aceitos e manter referência de capacidade independente de reajuste público. Mesmo assim, três problemas não desaparecem com uma fórmula: a oferta pode cair, consumidores podem concentrar pedidos em configurações escassas e o operador precisa pagar despesas em dinheiro.

O caso T09 é uma projeção de fluxo sob oferta constante. Não deve ser apresentado como controlador completo: reduzir novas remunerações pode provocar saída de fornecedores. Os casos T11/T13 demonstram por que são necessários contratos vigentes honrados, contingência, reserva operacional real e limites por configuração. Bloquear emissão sozinho não garante atendimento.

O caso T05 pressupõe peso útil já verificado. T16 pressupõe demanda não manipulada no mecanismo que escolhe leases futuros. T18 usa tarefas iguais e uma fila simples. Essas hipóteses são justamente objetos dos experimentos de fraude, scheduling e experiência do piloto, não conclusões resolvidas pelos cálculos.

## Reprodução

Na raiz do projeto, com Python disponível:

```powershell
python .\docs\planning\evidence\simulate_token_economy.py
python .\docs\planning\evidence\verify_planning.py
```

O primeiro comando refaz os 18 casos e grava o resultado. O segundo verifica o pacote, inclusive os hashes da política e do simulador e o resultado documentado. Não há dependências externas, conexão a serviços, execução de modelos, criação de ledger de produto ou alteração de saldo real.

## Evidência ainda necessária

O EP09 do [12](12_ROADMAP_AND_BACKLOG.md) prevê medir pesos de capacidade, rejeição e espera por coorte, custo de verificação, impacto de churn, consumo por modelo e utilidade por perfil de contribuinte. Simular e medir demanda variável com saídas correlacionadas de nós antes de adotar percentuais públicos. Calibrar a cesta de referência e seus erros de previsão com runs reais; incluir cenários de indisponibilidade de um operador dominante.

As tarifas 1/4/20 de entrada e 4/16/80 de saída, os limites 35/50/80% e as cotas 2/5% são **parâmetros propostos**, não dados extraídos de outros projetos nem decisões comerciais irreversíveis.
