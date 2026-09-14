# Contabilidade de laboratório e limites de confiança

## Unidade e reserva

`LAB_TU` é uma unidade inteira de teste, com 1.000.000 de micro-unidades por unidade visível. Não é o TU cooperativo público, não circula em blockchain, não compra dinheiro e não pode ser sacado. O saldo inicial de novos usuários é zero. O bootstrap do administrador e concessões posteriores são lançamentos explícitos, limitados e auditáveis contra a conta `LAB_ISSUER`.

Preços e contagem de tokens são coisas diferentes. Um token de texto não tem custo universal entre modelos. Cada manifesto fixa preço de entrada, preço de saída e denominador. Com inteiros de 64 bits:

```text
custo = ceil((tokens_entrada × tarifa_entrada + tokens_saida × tarifa_saida) / denominador)
reserva = custo(contexto_maximo - saida_solicitada, saida_solicitada)
```

O teto é conservador e pode ser maior que o uso típico. Usuários não podem gastar saldo reservado por outra sessão. Uma cotação congela manifesto, preços, limite e validade. A sessão não troca para um modelo diferente de forma silenciosa.

## Liquidação

Um recibo concluído deve conter tokens positivos, conclusão do stream, motivo de término e uso dentro dos limites autorizados. O nó assina o recibo; o controle valida identidade, tentativa e época. Este perfil usa contagem **declarada pela engine**, sem prova criptográfica da execução nem tokenização independente.

Se válido, a cobrança é limitada ao hold. Neste experimento, 80% vão para o operador e 20% para a conta de trabalho do laboratório, com arredondamento inteiro da taxa. A diferença da reserva volta ao consumidor. Os percentuais são parâmetros de teste; não foram demonstrados como sustentáveis para uma rede pública.

Falha, cancelamento e interrupção devolvem a reserva integral. Uso inconsistente gera `DISPUTED`, cobrança zero e estado terminal de falha. Trabalho entregue antes de um cancelamento pode ser consumido gratuitamente nessa política privada. Esse subsídio impede tratar o perfil como um mercado resistente a abuso; deve ser revisto antes da abertura, junto com custeio de trabalho parcial e provas de entrega.

Sem compradores ou pedidos, não existe emissão automática por ficar online. Ganhos dos operadores vêm de trabalho liquidado; concessões do laboratório têm origem explícita. A regra candidata de remuneração por cobertura e os limites elásticos ainda precisam de revisão econômica. O saldo de teste não representa cobertura ou capacidade futura garantida.

## Proteções no banco

- Todo journal tem pelo menos duas linhas, cuja soma deve ser zero no commit.
- Triggers projetam as linhas nos saldos. Contas de usuários não podem ficar negativas.
- O usuário de runtime não pode atualizar saldos nem inserir um saldo inicial diferente de zero.
- Journal, linhas, recibos e eventos não podem ser alterados ou apagados por essa role.
- Um journal já confirmado não aceita novas linhas, mesmo que a tentativa de anexação fosse balanceada.
- A chave de negócio identifica reserva e liquidação; retries não criam cobrança adicional.
- A soma global dos saldos deve ser zero; a projeção de cada conta deve corresponder à soma de suas linhas.

Essas regras também foram testadas após restauração de um dump. O proprietário do PostgreSQL ainda tem poderes administrativos e pode modificar o banco. Essa fronteira de confiança pertence ao coordenador privado; não é consenso descentralizado ou registro imutável perante um administrador malicioso.

## Escopo de privacidade e segurança

O caminho de conteúdo não passa pelo NestJS nem pelo PostgreSQL. A engine, o gateway e o agente veem o conteúdo em memória. A interface não injeta HTML do modelo. Não há promessa de computação confidencial em GPUs de desconhecidos. Pesos não são baixados nem executados a partir do manifesto, e o perfil não habilita ferramentas, execução remota de código ou chamadas arbitrárias a URLs fornecidas por consumidores.

O inventário de GPU e o hash do modelo são declarações/configurações do operador com qualificação administrativa local. O sistema não detecta dois domínios falsos para uma mesma GPU em máquinas não confiáveis. Convites, limites por conta e nomes de domínios permitem testar o fluxo, mas não substituem provas físicas, anti-Sybil ou verificação econômica. As [lacunas de abertura](STATUS.md) permanecem registradas.
