# Simulação integrada e decisão econômica

**Revisão 4 — executada em 13/09/2026.** Foram realizadas **54 execuções fictícias de 90 dias**, com 11 cenários, controles pareados e sensibilidades. As invariantes do modelo passaram. **A configuração fictícia de tarifas, demanda e comportamento foi reprovada para abertura**, porque houve hibernação econômica no cenário básico. Não é evidência de equilíbrio, rentabilidade ou operação real.

Os mecanismos escolhidos estão no [22](22_POLICY_CLOSURE_AND_CONTINUITY.md). O propósito deste ensaio é confrontar decisões com falhas, sem ajustar números até produzir uma aparência de sucesso.

## 1. Artefatos e reprodução

| Artefato | Função |
|---|---|
| [Política e entradas](evidence/integrated-economy-policy.json) | Regras selecionadas e valores fictícios separados |
| [Simulador](evidence/simulate_integrated_economy.py) | Python com biblioteca padrão; não inicia infraestrutura |
| [Resultados completos](evidence/integrated-economy-simulations.json) | Sementes, métricas, estados e 90 registros diários por execução |
| [Primeiro rascunho rejeitado](evidence/rejected-draft/integrated-economy-simulations.json) | Reserva sem circulação; script e política originais preservados no diretório |
| [Verificador do pacote](evidence/verify_planning.py) | Integridade, hashes, documentação e referências; não aprova o produto |

Na raiz do projeto:

```powershell
python -X utf8 docs/planning/evidence/simulate_integrated_economy.py
python -X utf8 docs/planning/evidence/verify_planning.py
```

33 execuções principais = 11 cenários × sementes 17, 29 e 43. Nove controles desligam a reciclagem do consumo, conservando as demais regras e saldos iniciais. Doze sensibilidades combinam reserva-alvo de 24/168 horas com limiar comportamental de saída de 15%/60%, nas mesmas três sementes. O rascunho rejeitado não entra na contagem de 54.

Sorteios são derivados de SHA-256 por semente, evento e participante. Uma mudança de política não muda o fluxo exógeno de chegadas/falhas usado na comparação. A composição dos participantes ativos muda endogenamente. São cenários construídos e sementes de desenvolvimento; não houve validação estatística com amostra independente de comportamento real.

## 2. O que o modelo representa

18 provedores fictícios: 12 pequenos e seis grandes. Há seis contas adicionais sem GPU, todas com saldo inicial finito e sem renda/grants adicionais no ensaio. Cada conta deseja trabalho mesmo quando está sem saldo; isso permite registrar exclusão, em vez de apagá-la da demanda.

Um nó pequeno entrega quatro unidades de trabalho compacto por hora. Três papéis grandes juntos entregam duas unidades do modelo grande; papéis grandes excedentes podem executar compacto. Esses números são convenções de simulação, **não throughput de GPUs, quantidade de VRAM ou prova de Kimi distribuído**. Perder o gigante preserva uma rota compacta viável.

Preços fictícios: compacto custa 1 TU por unidade e grande custa 8 TU. READY vale 0,5 TU/h para nó pequeno e 1,5 TU/h para grande. O estoque inicial básico é 2.800 TU dos participantes e 400 TU da reserva, com história sintética de 7.600 TU emitidos a contribuidores e consumo anterior declarado. Não é uma distribuição autorizada para a rede real.

O modelo usa uma hora como passo econômico. Uma intenção de tamanho 1/2/4 representa um lote de requisições unitárias independentes; lotes podem ser atendidos em partes. Isso **não** representa dividir arbitrariamente uma inferência, KV ou saída de tokens. A intenção não atendida abandona o sistema após seis horas. Essa fila de intenções não é a fila de API aceita, cujo prazo e hold são outros.

Saída econômica: a cada 48 horas, um provedor compara remuneração recente com sua tarifa e utilidade recente do saldo. Abaixo do limiar, pode se ausentar por 72 horas; o sorteio e a regra constam do código. Não é uma estimativa empírica de usuários. A regra faz a oferta reagir ao resultado econômico, em vez de assumir que todos continuarão online gratuitamente.

Caixa inicial: 67 unidades monetárias fictícias; custo mínimo de uma por dia e contribuição voluntária de uma por dia no cenário básico. Portanto, **zero compradores não significa zero custo ou zero financiadores da operação**. No cenário comercial existe outro ledger; seus recursos não são convertidos em TU ou contados automaticamente como caixa operacional livre.

## 3. Resultados principais

Atendimento é trabalho útil entregue dividido por todo trabalho desejado durante 90 dias, inclusive desejos sem saldo. Não é taxa de sucesso da API, SLA ou demanda comercial atendida. Hibernação é soma de horas de pausa econômica/capacidade/caixa; não inclui a pausa explícita por falta de quorum. Cada coluna mostra extremos das três sementes, não intervalo de confiança.

| Cenário | Trabalho desejado atendido | Máximo de horas hibernando, de 2.160 |
|---|---:|---:|
| Básico, sem compradores | 26,19%–32,83% | 1.350 |
| Pouquíssima procura por 15 dias, depois retorno | 6,06%–6,54% | 1.941 |
| Estoque inicial elevado | 26,61%–33,35% | 1.350 |
| 95% da procura pelo grande por dez dias | 39,29%–48,60% | 632 |
| Falha correlacionada de aproximadamente metade dos nós | 27,56%–31,41% | 1.253 |
| Todos os nós ausentes por dois dias | 29,49%–37,13% | 1.166 |
| Registro sem quorum por um dia | 29,03%–33,65% | 1.196 |
| Capacidade comercial mista | 30,52%–33,54% | 1.118 |
| Financiamento operacional interrompido | 26,19%–32,83% | 1.350 |
| Fraude experimental com detecção presumida zero | 25,81%–32,79% | 1.350 |
| Choque combinado severo | 36,23%–47,92% | 803 |

O cenário básico atende aproximadamente 32,85%–42,23% dos desejos dos provedores e 4,88%–5,58% dos desejos das contas sem renda recorrente. A média global esconde essa diferença. Crédito inicial finito não sustenta uso contínuo de quem não contribui, recebe grant ou escolhe contratar serviço comercial.

Quando a contribuição ao caixa cessa, o modelo preserva sete unidades de encerramento e registra 504 horas de pausa por caixa. Tokens existentes não pagam a despesa externa. As demais pausas podem preceder esse esgotamento.

Na fraude experimental, a detecção foi explicitamente fixada em zero. Houve emissão falsa limitada pelo envelope simulado: até 14,461741 TU no cenário de fraude e 23,190383 TU no choque combinado. Isso comprova apenas a restrição contábil sob a classificação de admissão assumida; não comprova que o atacante seria detectado nem limita captura de verificadores já qualificados.

## 4. Efeito isolado da circulação

Os controles abaixo usam o simulador final, incluindo as mesmas correções de rotas e lotes. Somente a reciclagem do consumo é desligada. Isso evita atribuir à circulação o efeito de outras correções feitas desde o primeiro rascunho.

| Cenário | Semente | Com circulação | Sem circulação | Diferença em pontos percentuais |
|---|---:|---:|---:|---:|
| Estoque alto | 17 | 33,35% | 1,23% | +32,12 |
| Estoque alto | 29 | 26,61% | 1,39% | +25,22 |
| Estoque alto | 43 | 28,47% | 25,21% | +3,27 |
| Saída correlacionada | 17 | 31,41% | 30,75% | +0,66 |
| Saída correlacionada | 29 | 31,29% | 22,65% | +8,64 |
| Saída correlacionada | 43 | 27,56% | 26,67% | +0,89 |
| Choque combinado | 17 | 36,23% | 1,23% | +35,00 |
| Choque combinado | 29 | 41,31% | 1,39% | +39,92 |
| Choque combinado | 43 | 47,92% | 1,28% | +46,64 |

Circulação melhorou esses nove pares. A amplitude do ganho e as pausas restantes impedem concluir que ela basta, que seja ótima em qualquer população ou que elimine a necessidade de liquidez inicial. A decisão adotada é conservar o mecanismo e reprovar a configuração econômica ensaiada para abertura.

## 5. Sensibilidade do choque combinado

| Reserva-alvo | Limiar de saída | Atendimento mínimo–máximo |
|---|---:|---:|
| 24 horas | 15% | 31,63%–46,77% |
| 24 horas | 60% | 36,08%–45,08% |
| 168 horas | 15% | 34,24%–46,78% |
| 168 horas | 60% | 31,72%–45,11% |

Mais reserva não melhora todas as sementes/coortes. Mudar o limiar de saída também muda a composição dos nós disponíveis, com efeitos que não são monotônicos. O alvo de 72 horas é uma escolha provisória de bancada, não um ótimo descoberto por este ensaio. Nenhum desses resultados habilita uma tarifa pública.

## 6. Invariantes e referências de fronteira

As 54 execuções verificaram conservação de estoque, ausência de saldo negativo, emissão dentro de compromisso autorizado, transferência sem emissão, holds encerrados, teto do envelope de fraude assumido e separação do ledger financeiro. Foram 233.280 verificações agregadas de partição de capacidade e 2.017.223 mutações de ledger de referência. Essas contagens medem o script, não testes distribuídos independentes.

| Caso | Verificação de referência |
|---|---|
| C01 | Repetição sequencial não aplica novo hold; saldo insuficiente não debita |
| C02 | Pagar com reserva existente não emite TU |
| C03 | Divisão financeira inteira conserva valores pequenos de 1 a 100 unidades |
| C04 | Compromisso vira saldo sob o mesmo teto de exposição |
| C05 | Parcela reciclada mais queimada iguala cobrança sem emissão nova |
| C06 | Estorno debita a parcela reciclada do fundo e reverte somente a parcela queimada |
| C07 | Falta da rota grande preserva compacto; nenhum nó significa nenhum serviço |

Os 20 casos do [21](21_COOPERATIVE_SIMULATIONS.md) continuam como referências parciais de limites, grants e dois saldos da revisão anterior. Seus exemplos de consumo integralmente queimado não definem a destinação atual. Os 18 casos históricos e oito comerciais também não são testes do produto.

## 7. O que continua sem prova e a decisão resultante

O script não executa CometBFT, banco concorrente, GPU, modelo, detector de fraude, rede WAN, pagamento ou saque. Quorum é uma entrada booleana. Não mede cancelamento/retenção em milissegundos, fila de API de 120 segundos, KV, memória fragmentada, temperatura, qualidade da resposta ou isolamento de código comunitário. A partilha comercial é agregada, sem ensaiar exclusão física por recurso/intervalo.

Não há geração de grants na simulação integrada, aquisição de clientes, mercado secundário, custo elétrico real, modelos de carga calibrados ou doações espontâneas de TU para reativar uma reserva vazia. O caso C06 é contabilidade sequencial; reembolso após gasto do fundo depende das reservas/condições de contrato especificadas. Fraude de operadores maduros, Sybil real e comportamento econômico não foram resolvidos pelo gerador de cenários.

**Decisão:** a configuração fictícia falha no gate básico de ausência de hibernação econômica. A simulação de uma hora também não pode aprovar o SLO de requisições elegíveis do 22. Antes de abrir: medir custos e comportamento, limitar reservas ao serviço útil necessário, recalibrar por coorte/modelo, validar em sementes separadas e cumprir os pilotos reais. Emissão ilimitada, corte de saldo ou promessa de compradores futuros não são correções aceitas.

O planejamento agora define como remunerar, consumir, governar, restringir e retomar. A validade econômica dos parâmetros só será afirmada após passar pelos critérios definidos, com resultados desfavoráveis preservados.
