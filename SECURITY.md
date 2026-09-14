# Segurança

O NETWORK AI é uma bancada de pesquisa. Os serviços demonstrados têm escopo local ou privado; não houve auditoria completa de rede pública. Os relatórios não autorizam expor os harnesses como serviço de produção.

## Relatar um problema

Use **Security → Report a vulnerability** no [repositório oficial](https://github.com/Dev-Encrypted/Network_AI/security). Se a opção estiver indisponível, abra uma issue solicitando um canal reservado, sem divulgar credenciais, dados pessoais ou passos de exploração sensíveis.

Informe versão ou commit, componente, ambiente, impacto e reprodução mínima. Não teste nós de terceiros sem autorização. Não há prazo contratual de resposta ou programa de recompensa nesta fase.

## Limites conhecidos

- Identidades de transporte não provam identidade humana, exclusividade de GPU ou correção de inferência.
- A proteção de replay é efêmera; não demonstra persistência após reinício.
- Cancelamento de aplicação libp2p ainda não foi implementado.
- Desconexão HTTP não prova liberação interna de recursos da engine.
- O Petals de referência tem limitações upstream registradas no [relatório](docs/execution/README.md).
- Criptografia em trânsito não garante sigilo contra quem executa a inferência.

Consulte os [gates](docs/execution/GATES.md). Uma revisão de arquivos para publicação não equivale a auditoria do produto.
