# Publicação e artefatos de pesquisa

Repositório: [Dev-Encrypted/Network_AI](https://github.com/Dev-Encrypted/Network_AI). Primeira versão pública: **v0.1.0-f0**, uma prévia de pesquisa. A publicação do código não habilita operação pública da rede.

## Fontes e evidências

O Git contém artigo, capítulos técnicos, código, testes, fixtures, relatórios e logs dos runs F0. Os grandes dados econômicos comprimidos e os ZIPs históricos ficam na [release v0.1.0-f0](https://github.com/Dev-Encrypted/Network_AI/releases/tag/v0.1.0-f0).

O pacote completo da execução anterior é preservado byte a byte:

| Campo | Valor |
|---|---|
| Arquivo | `NETWORK_AI_EXECUCAO_F0_2026-09-14_v1.zip` |
| Tamanho | 86.326.026 bytes |
| SHA-256 | `5d6afd3b991b9938b9f8840266f2fef7fb5c10324f11265b6f8fc7872a55eca1` |
| Entradas | 202, incluindo manifesto com 201 arquivos |

O pacote inclui seis ZIPs históricos do planejamento e os dois arquivos `runs.jsonl.gz`, totalizando os 5.600 casos econômicos. Ele foi gerado antes da organização desta publicação: seu README e alguns scripts são snapshots anteriores. Para a versão pública atual das fontes e licenças, use o tag Git da release.

Não há pesos, ambientes instalados, caches de compilação ou credenciais no escopo de distribuição. Os relatórios históricos incluem caminhos do ambiente de bancada; eles não são parâmetros obrigatórios para novos participantes.

## Restaurar dados sem substituir o código atual

Com o ambiente Python instalado, conforme [Reprodução](../execution/REPRODUCE.md):

```powershell
.venv\Scripts\python benchmarks/scripts/restore_evidence.py --download
.venv\Scripts\python benchmarks/scripts/verify_execution.py
.venv\Scripts\python benchmarks/scripts/summarize_economy.py
```

Se já tiver baixado o ZIP, use `--archive caminho-do-arquivo.zip` no lugar de `--download`. No Linux, use `.venv/bin/python`.

O restaurador confere SHA-256 e tamanho do download, aceita apenas oito caminhos conhecidos e preserva arquivos existentes com o hash esperado. Não extrai o README, código, licenças ou documentos antigos sobre os atuais. Um arquivo existente com conteúdo diferente provoca erro, sem substituição automática.

O verificador de checkout `python benchmarks/scripts/verify_repository.py` funciona sem baixar os assets. O verificador de execução depende dos artefatos completos e confere a coerência das evidências; não aprova os critérios de operação pública.

## Autoria e direitos

Atribuição: **Dev-Encrypted**. Código original: [Apache 2.0](../../LICENSE). Documentação original: [CC BY 4.0](../../LICENSES/CC-BY-4.0.txt). Os [termos de escopo](../LICENSING.md) explicam sua aplicação aos snapshots e a preservação dos direitos de terceiros.
