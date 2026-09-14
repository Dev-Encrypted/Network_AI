# Evidências públicas e contas derivadas

Coleta em 13/09/2026. Este diretório contém metadados, configurações, índices e verificações do planejamento. **Não contém pesos de modelos, credenciais ou resultados de inferência.**

## Organização

| Arquivo | Conteúdo e origem |
|---|---|
| `{namespace}--{modelo}.json` | Snapshot selecionado da API pública Hugging Face: `source`, horário UTC, revisão completa, licença, gating, arquivos, tamanhos e hashes informados |
| `{modelo}.config.json` | Configuração upstream resolvida na revisão coletada |
| `{modelo}.index.json.gz` | Índice de pesos daquela revisão; JSON comprimido sem perda, sem pesos |
| `{modelo}.summary.json` | Derivação do config/index: arquitetura, camadas, exemplos de nomes e número de shards por camada |
| [repository-status.json](repository-status.json) | API GitHub: manutenção/licença detectada e falhas de acesso; `pushed_at` não é garantia de saúde |
| [engine-commits.jsonl](engine-commits.jsonl) | Commits resolvidos de Petals/Hivemind/vLLM/SGLang; pins de pesquisa, não builds aprovados |
| [compression-index.json](compression-index.json) | Tamanho e SHA-256 do JSON original e gzip; round trip conferido antes de substituir índices brutos por gzip |
| [calculated-projections.json](calculated-projections.json) | Cálculos reproduzidos de bytes/GiB, disponibilidade, capacidade e custos ilustrativos |
| [validation-report.json](validation-report.json) | Verificações documentais executadas; não testes de produto |
| [verify_planning.py](verify_planning.py) | Verificador de documentos, metadados e contas; sem execução de inferência |
| [token-economy-policy.json](token-economy-policy.json) | Primeira política de serviço preservada como histórica; referência atual em cooperative-elastic-policy.json |
| [simulate_token_economy.py](simulate_token_economy.py) | Referência aritmética determinística da economia proposta, sem serviços ou dependências externas |
| [token-economy-simulations.json](token-economy-simulations.json) | 18 casos com entradas fictícias, resultados, limites e hashes da política/simulador |
| [open-market-policy.json](open-market-policy.json) | Hipótese exclusivamente comercial de repasses em UP fictícia, distinta de TU; rede/ativo não selecionados |
| [simulate_open_market.py](simulate_open_market.py) | Oito cálculos de referência, sem execução financeira real |
| [open-market-simulations.json](open-market-simulations.json) | Resultados, limites e hashes do simulador/política de mercado |
| [cooperative-elastic-policy.json](cooperative-elastic-policy.json) | Referência parcial da revisão 3; limites elásticos preservados, circulação/reserva completadas pela revisão 4 |
| [simulate_cooperative_elastic.py](simulate_cooperative_elastic.py) | 20 exemplos determinísticos de cálculo/controlador; sem sistema real |
| [cooperative-elastic-simulations.json](cooperative-elastic-simulations.json) | Resultados e hashes da referência cooperativa; limitações por caso |
| [integrated-economy-policy.json](integrated-economy-policy.json) | Decisões da revisão 4 e entradas econômicas fictícias claramente separadas |
| [simulate_integrated_economy.py](simulate_integrated_economy.py) | Modelo integrado: estoque, circulação, oferta, demanda, coortes, comércio, caixa, falhas e saída de provedores |
| [integrated-economy-simulations.json](integrated-economy-simulations.json) | 54 execuções de 90 dias, sete referências de fronteira e gate econômico reprovado para os valores fictícios |
| [closure-register.json](closure-register.json) | Registro vigente v6: decisões, dependências e critérios pendentes; abertura não aprovada |
| [operating-policy-v6.json](operating-policy-v6.json) | Especificação candidata v6 estruturada; não é configuração de runtime |
| [verify_v6_policy_reference.py](verify_v6_policy_reference.py) | Executa aritmética e condições pontuais da correção; não implementa ledger ou simulação de mercado |
| [v6-policy-reference-checks.json](v6-policy-reference-checks.json) | 19 referências verificadas, incluindo contraexemplo v5 e limitações explícitas |
| [rascunho rejeitado](rejected-draft/integrated-economy-simulations.json) | Primeira versão sem circulação, preservada com script/política originais no mesmo diretório; não é política atual |
| [mermaid-validation.json](mermaid-validation.json) | Resultado da análise sintática dos diagramas; fontes `.mmd` em `diagrams/` |
| [SHA256SUMS.txt](SHA256SUMS.txt) | Integridade local do README e documentos/evidências, exceto o próprio arquivo de hashes |

Alguns nomes mantêm o prefixo do namespace também nos arquivos auxiliares. Llama 3.1-70B possui somente snapshot da API: o acesso aos demais arquivos foi gated, sem tentativa de contornar autorização.

## Procedência e revalidação

API de modelo: `https://huggingface.co/api/models/{id}?blobs=true`. A revisão retornada está no campo `sha`; arquivos de config/index foram resolvidos por revisão, evitando `main` como dependência de execução. URLs de leitura podem ser reconstruídas como `https://huggingface.co/{id}/resolve/{sha}/config.json` e `model.safetensors.index.json`.

`weight_bytes` soma os `.safetensors` do inventário upstream. Tamanho e hash LFS são **alegações do publicador** até baixar e conferir o conteúdo. Headers/índices não permitem afirmar que pesos foram verificados ou executados. Números `.0` em alguns snapshots representam somas de bytes inteiros dentro da faixa exata; cálculos derivados usam inteiros.

Os sete índices originalmente ocupavam cerca de 134 MB decimais. Gzip reduz o pacote e preserva os mesmos bytes de JSON ao descomprimir; o registro de compressão permite verificar isso. Não é quantização nem compressão de pesos.

Para reproduzir a análise, ler o snapshot do modelo, descomprimir seu índice, mapear `weight_map` por prefixo de camada e associar os nomes aos tamanhos do inventário. Conferir hashes e revisar qualquer mudança de revisão antes de reutilizar resultados. `total_size` do índice descreve tensores, enquanto tamanho dos arquivos inclui headers.

Licenças e páginas de engines foram lidas separadamente: um detector GitHub `null`/`NOASSERTION` não conclui ausência de licença. O [registro de fontes](../13_REFERENCES_AND_EVIDENCE.md) explica esses casos e as limitações.

Este conjunto não é manifesto de publicação assinado do NETWORK AI. O SHA-256 local detecta mudanças no pacote, mas não constitui assinatura de um publicador autorizado nem prova de cálculo correto.

A partir da raiz, executar `python docs/planning/evidence/simulate_integrated_economy.py` e `python docs/planning/evidence/verify_planning.py`. Os scripts anteriores permanecem reproduzíveis nos seus arquivos: o [17](../17_TOKEN_POLICY_SIMULATIONS.md) é histórico, o [19](../19_OPEN_MARKET_SIMULATIONS.md) trata comércio e o [21](../21_COOPERATIVE_SIMULATIONS.md) contém referências parciais. O [23](../23_INTEGRATED_ECONOMY_SIMULATIONS.md) analisa a revisão integrada. Nenhum ensaio prova hardware, consenso, liquidação real ou rentabilidade.
