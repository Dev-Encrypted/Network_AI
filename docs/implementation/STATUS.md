# Cobertura da entrega privada

Esta matriz registra a implementação v0.2 e evita confundir uma bancada funcional com a conclusão de toda a rede proposta. Data da campanha local: 14/09/2026. Um computador físico, uma RTX 4090 compartilhada e o modelo já carregado no LM Studio.

| Frente | Entregue | Limite |
|---|---|---|
| Interface | Login, chat real, modelos, sessões, saldos, chaves, administração e layout móvel | Conversa somente na memória da aba; sem anexos ou ferramentas |
| Identidade | Senhas com scrypt, chaves individuais revogáveis, cookies e autorização por conta | Acesso privado provisionado; sem MFA, SSO ou recuperação por e-mail |
| Catálogo | Manifestos imutáveis, origem/licença/hash, candidato e qualificação administrativa | Adaptador de texto; sem instalação automática ou execução de qualquer arquitetura |
| Agentes | Ed25519 persistente, convite único, heartbeat, pausa, retomada e época | Loopback; inventário e capacidade declarados, sem atestação física |
| Admissão | Transação serializável, justiça entre filas elegíveis, slots por domínio, prepare e claim | Coordenador único; domínios definidos pelo administrador |
| Inferência | Gateway e nó Rust, streaming, limite de corpo, timeout e cancelamento | Engine local real; sem transporte WAN integrado ou paralelismo entre hosts |
| Créditos | LAB_TU inteiro, reserva, liquidação 80/20 experimental, estorno e idempotência | Sem dinheiro, saque, cobertura cooperativa ou parâmetros econômicos aprovados |
| Registro | Journal balanceado, projeção protegida e histórico sem edição pela role de runtime | Administrador do banco permanece confiável; sem consenso distribuído |
| Falhas | Restart de nó com fencing da época, devolução, outbox e reconciliação | Geração não é retomada no token interrompido; janela de execução limitada |
| Operação | Migrações por checksum, processos próprios, logs locais, backup e restauração isolada | Sem HA, serviço Windows instalado, atualização automática ou implantação pública |

## Evidência produzida

Os testes de integração usam PostgreSQL real em banco temporário, separado do laboratório. Cobrem saldo inicial, autorização, grants idempotentes, proteção e balanço de journal, concorrência, reserva única, isolamento entre contas, expiração, dois processos no mesmo domínio, justiça entre usuários, replay, claim único, recibo divergente, uso inconsistente e fencing de época.

As jornadas no Chromium verificam login, mensagem com resposta real, cobrança, chave criada e revogada, pausa/retomada, catálogo, logout, interface de 390 px sem overflow da página e bloqueio das rotas internas pelo proxy. Inspeção visual foi feita em desktop e celular. A verificação automatizada de acessibilidade tem escopo de página e não constitui certificação WCAG.

Foram conectados dois agentes Rust reais no mesmo domínio físico, usando um perfil de operador sem senhas de banco ou autoridade de assinatura. Duas chamadas simultâneas terminaram sem sobreposição do slot físico único. O agente temporário foi revogado ao final. Essa evidência continua limitada a um computador.

O teste de inferência percorre a API real e valida tokens, hold, cobrança, replay sem nova execução e cancelamento com devolução. A falha de processo foi injetada no agente deste projeto durante uma execução: o nó voltou em outra época e a sessão anterior foi encerrada sem cobrança. Em outra campanha, o controle ficou indisponível por quatro segundos; o nó entregou o fluxo com recibo pendente, reenviou a outbox e liquidou a sessão original após a recuperação.

O dump foi restaurado em banco novo e conferido quanto a journal, soma dos saldos, projeção e proibição de atualizar saldo pela role de runtime. A cópia do banco em uso permaneceu intacta.

As saídas detalhadas de cada execução ficam em `.runtime/private-lab/`. Um [relatório público resumido](validation.json) inclui apenas dados da campanha, sem credenciais, prompts, respostas ou logs privados. Os testes F0 e seus artefatos históricos são independentes desta campanha.

## Trabalho ainda necessário para a rede de destino

1. **Hardware e transporte:** múltiplas GPUs e hosts físicos, LAN/WAN/NAT/relay, orçamento de memória medido, adaptação de carga e integração QUIC/gRPC qualificada.
2. **Modelos:** execução distribuída no produto, componentes/expert routing, multimodalidade e compatibilidade por engine/revisão, incluindo as pendências Qwen BF16 e Kimi registradas em F0.
3. **Confiança:** verificação de trabalho e tokenização, operadores adversariais, anti-Sybil, licenças verificadas por oferta, políticas para conteúdo e privacidade em máquinas de terceiros.
4. **Economia:** corrigir a baixa circulação e a cobertura, incluir todos os limites elásticos e critérios de recuperação, validar novas sementes e custos observados. Concessões LAB_TU e estorno de trabalho parcial não são a solução econômica pública.
5. **Continuidade:** consenso/federação, failover de coordenadores, rotação de autoridades, restauração conjunta de dados e chaves em outros hosts e pilotos com operadores independentes.
6. **Mercado:** custódia e contabilidade financeira próprias, cobrança por API, disputas, impostos e operação comercial. Nenhuma venda ou pagamento foi ativado nesta versão.

Esses pontos não são aprovados por passar em testes locais. Os [critérios FC01–FC06](../execution/GATES.md) continuam sendo os requisitos de avanço. A entrega v0.2 permite usar e desenvolver o produto em laboratório sem afirmar que o planejamento inteiro está concluído.
