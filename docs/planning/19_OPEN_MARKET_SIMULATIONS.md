# Verificação aritmética do mercado aberto

Este documento verifica **somente pagamentos comerciais**, com fundos confirmados. TU cooperativo é outra unidade: pode ser emitido sem compradores sob a política do [20](20_COOPERATIVE_ECONOMY_AND_ELASTIC_LIMITS.md). Os oito casos abaixo usam **UP, unidade fictícia de pagamento apenas para a aritmética**, sem equivalência com TU ou cotação de ativo. Não foram implementados contrato financeiro, blockchain, mercado ou prova de inferência.

| Caso | Entrada fictícia | Resultado calculado | O que permanece fora da prova |
|---|---|---|---|
| M01 | Chamada de 100 UP, divisão 90/6/2/2 | Providers 90, gateway 6, operação 2, reserva 2; total 100 | Transferência real e segurança da liquidação |
| M02 | Pool financiado com 100 UP paga 30 por prontidão verificada | Pool fica com 70, provider com 30; nenhum saldo adicional | Prova de prontidão e confirmação real de fundos |
| M03 | Pool de 100 UP compromete 70 e tenta contratar mais 40 | Há só 30 livres; segunda proposta de 40 recusada | Corridas entre operadores, escrow e gasto duplo |
| M04 | Receita de taxas disponível de 6 UP; grant local de até 2% | Convidado recebe 0,12 UP; 5,88 ficam no fundo | Identidade do convidado e regra de outros pools |
| M05 | Carteira de 200, hold de 120, uso de 80 UP | Libera 40; carteira final 120; destinatários recebem 72/4,8/1,6/1,6 | Medição, contestações e concorrência real |
| M06 | Depósito de 100, 60 em hold, pedido de retirada de 50 | Apenas 40 podem sair; depósito restante cobre os 60 reservados | Finalidade, saída unilateral e falha de gateway |
| M07 | Custo 0,40, taxa 10%, margem desejada 20% | Preço mínimo 4/7 ≈0,571429; vender por 0,50 rende margem de 10% | Custos reais, ocupação, energia, qualidade e demanda |
| M08 | 1.000 nós e 5.000 modelos publicados, sem contraparte financiada | Zero UP de receita financeira; publicação isolada não é contribuição cooperativa contratada | Spam, Sybil e modelos maliciosos |

O relatório [open-market-simulations.json](evidence/open-market-simulations.json) registra entradas, saídas, condições e hashes. A [política de exemplo](evidence/open-market-policy.json) não seleciona ativo, rede de liquidação ou token nativo. O [script](evidence/simulate_open_market.py) usa somente Python padrão e não acessa a rede.

## Como reproduzir

Na raiz do projeto:

```powershell
python .\docs\planning\evidence\simulate_token_economy.py
python .\docs\planning\evidence\simulate_open_market.py
python .\docs\planning\evidence\simulate_cooperative_elastic.py
python .\docs\planning\evidence\verify_planning.py
```

Os scripts refazem respectivamente 18 casos históricos, oito comerciais e 20 cooperativos atuais; o verificador confere documentos, vínculos e hashes. As unidades e os escopos não se misturam. O caso M08 impede receita monetária sem pagador, mas não impede ganho de TU por contribuição útil aprovada.

## Aceite técnico ainda necessário

Executar os testes de descentralização do 18 e EP10: três operadores independentes, troca de gateway/indexador, criação/publicação sem backend da empresa, saldo segregado, duas tentativas de gasto, falhas/reorganização da liquidação, disputa, retirada sem operador original e modelo comunitário de outra configuração. A rede aberta só estará demonstrada quando esses fluxos funcionarem em implementação real.
