# Cenários da cooperação sem compradores e dos limites elásticos

Foram executados **20 exemplos determinísticos de aritmética e controle**, com parâmetros fictícios. Eles verificam regras da proposta [20](20_COOPERATIVE_ECONOMY_AND_ELASTIC_LIMITS.md). Não executam GPU, consenso, banco, pagamento, identificação de fraude ou mercado real.

| Caso | Situação | Resultado de referência |
|---|---|---|
| A01 | Zero compradores; 600 s de READY aceito a 1.000 microTU/s | 600.000 microTU ganhos, sem depósito financeiro |
| A02 | 40 tarefas equivalentes/minuto, dez pessoas e depois duas | Quota ilustrativa sobe de 4 para 20 por pessoa; capacidade total continua 40 |
| A03 | Zero compradores, procura cooperativa de 90% e fila de 15 s | Limite de novas sessões extras volta a 1 |
| A04 | Procura regular de 10%, recursos saudáveis e sem fila | Teto 1 até 5 min; 2 após 5 min; 4 após 10 min de estabilidade |
| A05 | Chega outro participante esperando | Novos extras param; preço e prazo já aceitos permanecem |
| A06 | Procura oscila entre 24% e 51% a cada 30 s | Não promove repetidamente o limite; teto permanece 1 |
| A07 | Telemetria vencida ou pressão de recursos de 90% | Perfil inválido bloqueia novas sessões; pressão alta bloqueia extras |
| A08 | Modelo compacto com folga; gigante sem rota | Compacto pode ampliar quota; gigante continua sem capacidade |
| A09 | Conta teria teto 4, mas só existem dois slots qualificados livres | Concorrência admissível não passa de 2 |
| A10 | Emitir parte de ganho já contratado | Exposição S+L+J permanece 1.250 TU; compromisso vira saldo sem duplicação |
| A11 | Nenhum consumo por 14 dias; estoque 1.000 e referência 7.000 TU | Novos budgets limitam estoque a 2.450 TU; não há emissão ilimitada |
| A12 | Durante 30 dias sem vendas, consumo e contribuição de 200 TU/dia | Estoque permanece em 1.000 TU, com circulação cooperativa |
| A13 | Referência de capacidade cai de 7.000 para 3.500 com estoque 2.000 | Folga para promessas novas cai de 450 a zero; saldo ganho não é apagado |
| A14 | 980 TU emitidos por contribuição; receita comercial zero | Até 20 TU de grants, dentro do limite de 2% e dos demais controles |
| A15 | Pool com capacidade segura 100 e nenhuma reserva comercial | Cooperação pode usar 100; com 25 reservados comercialmente, mantém 75 |
| A16 | Comprador tem fundos, mas pede 30 onde teto comercial é 25 | Não invade a parcela cooperativa contratada |
| A17 | Ganhar 30 TU sobre saldo de 100 TU, sem pagamentos | TU passa a 130; saldo financeiro continua zero |
| A18 | Mesma alocação/intervalo solicitada como cooperativa e spot | Segunda remuneração integral é recusada |
| A19 | Teto elástico cai de 4 para 1 | Extras não viram saldo; contexto qualificado continua 8.192 tokens no exemplo |
| A20 | TU insuficiente com dinheiro disponível na outra carteira | Não cobrar dinheiro automaticamente |

A01 pressupõe lease útil verificado e orçamento previamente reservado. A11 recalcula **novas ofertas** por dia, não corta tarifas de contratos aceitos. A12 mantém oferta/consumo constantes: não demonstra sustentabilidade de energia, relays ou suporte. A18 cobre duplicata exata, não resolve detecção de identidade física falsa. A04–A07 exercitam o controlador de referência em traços específicos; não provam sua estabilidade sob toda carga.

## Reprodução e integridade

[Parâmetros](evidence/cooperative-elastic-policy.json), [script](evidence/simulate_cooperative_elastic.py) e [resultados completos](evidence/cooperative-elastic-simulations.json) registram entradas, saídas, limites e hashes.

```powershell
python .\docs\planning\evidence\simulate_cooperative_elastic.py
python .\docs\planning\evidence\verify_planning.py
```

O script usa Python padrão e não acessa rede ou credenciais. Os 18 cálculos do [17](17_TOKEN_POLICY_SIMULATIONS.md) e os oito do [19](19_OPEN_MARKET_SIMULATIONS.md) permanecem como referências separadas: regras antigas não sobrepõem o 20; o modelo financiado do 19 aplica-se a pagamentos comerciais.

## O que falta provar em execução

Piloto com compradores financeiros iguais a zero, participantes contribuindo e usando modelos diferentes; promoção/redução real de quota sob chegada de usuários; contabilização entre operadores; partição do registro; fila justa com workloads desiguais; capacidade perdida durante sessão; impacto de TU acumulados; custo por tarefa útil; infraestrutura custeada sem receita comercial. Esses trabalhos estão no EP11, não foram encerrados pelos cálculos.

## Escopo após a revisão 4

Estas 20 referências foram preservadas com sua política e hashes. Continuam úteis para limites elásticos e exemplos parciais de compromissos/grants. Não representam sozinhas a economia atual: o [22](22_POLICY_CLOSURE_AND_CONTINUITY.md) acrescenta circulação/reserva e governança, substituindo a queima integral usada em parte dos exemplos. O [23](23_INTEGRATED_ECONOMY_SIMULATIONS.md) executa o modelo integrado e registra também resultados desfavoráveis.
