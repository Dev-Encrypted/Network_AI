# Runs publicados

Os relatórios, amostras e logs F0 de 14/09/2026 são versionados aqui, inclusive as tentativas que falharam. O [registro de execução](../../docs/execution/README.md) identifica quais resultados são válidos para cada conclusão.

Os dois arquivos `runs.jsonl.gz` do estudo econômico ficam no pacote completo da [release de pesquisa](../../docs/publication/README.md), para manter o clone do código pequeno. Seus SHA-256 constam nos respectivos `report.json`.

Para usar o verificador econômico completo, restaure os artefatos com o comando documentado na publicação. Ele verifica o pacote e extrai apenas os dois arquivos brutos e os seis ZIPs históricos que ainda não existem, preservando fontes e documentação atuais.

Novos experimentos devem usar nomes e diretórios novos. Não sobrescreva o histórico nem trate uma simulação como medição de hardware.
