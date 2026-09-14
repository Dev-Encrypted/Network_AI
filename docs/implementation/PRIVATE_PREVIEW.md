# Implementação privada após F0

Este documento acompanha a implementação iniciada após a publicação `v0.1.0-f0`. Os snapshots e resultados econômicos anteriores permanecem preservados.

## Fronteiras da implementação

- Controle NestJS/Fastify e PostgreSQL próprio: identidade, catálogo, permissões, quotes, holds, sessões e journal.
- Gateway e nó em Rust: conteúdo de prompts e streaming seguem diretamente pelo caminho de dados; o banco recebe apenas metadados e recibos.
- Interface Next.js em PT-BR: chat, catálogo, sessões, saldo de laboratório, chaves e gestão de nós.
- Protocolo privado com registro de chave Ed25519, nonce persistente, época de nó, prepare/commit e capabilities ligadas ao digest da requisição.
- Um domínio físico compartilhado não ganha capacidade por registrar dois processos. A admissão bloqueia o domínio no PostgreSQL.

A unidade `LAB_TU` pertence exclusivamente à bancada privada. Não implementa autorização para emitir TU cooperativo real nem transforma os parâmetros reprovados em política pública. Uma eventual carga de teste é um lançamento explícito do emissor de laboratório, com saldo inicial zero e sem saque.

O perfil inicial usa o modelo efetivamente carregado no LM Studio. Seu identificador e digest são preservados. A oferta é experimental; não é promovida à qualificação do Qwen3-8B BF16 ou de um segundo host.

## Decisão de integração

O protocolo privado usa HTTP limitado em loopback para integrar controle e dados, com autenticação de identidade e capability na aplicação. O módulo QUIC F0 permanece uma bancada independente. HTTP neste perfil não qualifica transporte WAN e não pode ser exposto por simples troca para `0.0.0.0`; conexões entre computadores exigem túnel/TLS controlado e sua própria campanha.

Esta decisão permite exercitar contratos, banco e interface no hardware disponível. Não encerra o requisito de gRPC/QUIC, NAT, independência de operadores ou consenso federado do plano de destino.

## Aceite da entrega local

Login e permissões reais; catálogo ligado à presença dos nós; inferência real pelo gateway; pausa e cancelamento; idempotência sem nova cobrança; journal balanceado, imutável para a role de runtime, sem saldo negativo de usuário; recuperação de sessões abandonadas; backup e restauração do banco; testes de concorrência e jornadas no navegador.

Os critérios de abertura e o escopo não implementado devem aparecer no relatório final, sem classificar o projeto inteiro como pronto para produção por passar nesses testes.
