# Execução do planejamento

Iniciada em 14/09/2026 por solicitação do usuário. A autorização atual permite implementação e validação locais. Os ZIPs de planejamento anteriores permanecem imutáveis.

O trabalho começa pela F0: inventário, resolução de artefatos, harness de medição, simulação econômica v6 e transporte autenticado. A existência de código ou testes de loopback não encerra os critérios que exigem GPU isolada, dois hosts, operadores independentes ou pilotos de 7/30 dias.

Estado inicial observado: RTX 4090 de 24 GB, Intel i9-14900K, aproximadamente 128 GB de RAM, Windows com Ubuntu/WSL2, Python 3.12 disponível, Node 24 e Rust instalados. A GPU está compartilhada com um modelo previamente carregado no LM Studio. Essa sessão não será encerrada como efeito colateral da bancada.

**Entregue neste incremento: bancada F0 executável e evidências locais. O planejamento completo ainda não foi executado.** As afirmações de “não executado” do ZIP v6 descrevem o corte histórico de 13/09; este diretório registra os resultados posteriores.

| Frente | Resultado observado | Limite do resultado |
|---|---|---|
| Inferência local existente | 30/30 respostas esperadas; TTFT visível p50 1,09 s, p95 1,87 s | Modelo comunitário Qwen3.8-27B/Q4 no LM Studio, GPU compartilhada; não qualifica Qwen3-8B BF16 |
| Qwen3-8B oficial | 14 arquivos baixados e verificados; 16,38 GB de pesos; vLLM 0.29.0 instalado e CUDA/BF16 reconhecidos | Lançamento na GPU aguarda memória livre; o modelo existente foi preservado |
| Cargas E01 | 66 fixtures, incluindo warmups, com entradas exatas de 2.048 e 7.168 tokens | Inferência dessas cargas ainda não executada |
| Transporte | libp2p 0.57.0 e Iroh 1.2.0 compilados e exercitados, inclusive builds release | Loopback; falta matriz NAT, relay e dois hosts reais |
| Blocos Petals | BLOOM-560m dividido em dois servidores CPU, paridade de logits e geração; falha e reinício exercitados | Dois processos no mesmo computador; não demonstra Kimi ou WAN |
| Kimi K3 | Seis cabeçalhos de shards inspecionados; seis tensores de um expert carregados em CPU, 17.547.264 bytes | Não houve execução do expert, dequantização, kernel GPU ou inferência completa |
| Economia v6 | 5.600 execuções de 90 dias, com 20 sementes de calibração e 50 de validação | Configuração fictícia reprovada; nenhum crédito real |

O resultado econômico é material: **contabilidade correta não bastou para manter a operação.** No cenário básico, a v6 entregou 15,75% dos pedidos compatíveis com saldo na fase madura, abaixo da meta de 95%. A cobertura contratada e o consumo por grupo não sustentaram a circulação. Consulte o [resultado econômico e suas causas](ECONOMY_V1_RESULTS.md).

Os testes locais incluem 21 testes Python e dois testes Rust, além das execuções reais. `cargo clippy --locked --all-targets -- -D warnings` passou. Quatro testes HTTP adicionais verificam contadores divergentes, stream incompleto e modelo não anunciado nas cargas E01. Isso cobre a bancada e suas invariantes; não equivale a auditoria de uma rede pública.

## Evidências principais

- [Inferência LM Studio](../../benchmarks/runs/2026-09-14-lmstudio-visible-256/report.json), [fingerprints de pesos e backend](evidence/lmstudio-fingerprints.json).
- [Artefatos Qwen3-8B](evidence/qwen3-8b-artifacts.json), [fixtures E01](evidence/e01-fixtures.json), [inventário físico](evidence/hardware-inventory.json).
- [Transporte release](../../benchmarks/runs/2026-09-14-transport-loopback-release/report.json).
- [Petals com falha e retomada](../../benchmarks/runs/2026-09-14-petals-private-cpu-v5-recovery/report.json).
- [Kimi: inspeção](evidence/kimi-k3/inspection.json) e [carregamento parcial CPU](evidence/kimi-k3/cpu-unit-load.json).
- [Economia: resumo e verificação das 5.600 execuções](evidence/economy-v1-summary.json).
- [Verificação de integridade e coerência](evidence/execution-validation.json) e [preflight da GPU](evidence/vllm-preflight.json).
- [Comandos de reprodução](REPRODUCE.md) e [gates ainda abertos](GATES.md).

O primeiro smoke LM Studio, limitado a 64 tokens, foi preservado: dez respostas ficaram truncadas no raciocínio. A medição inicial misturava raciocínio e conteúdo visível; seus tempos não devem ser apresentados como TTFT visível. O run de 256 tokens usa a separação correta. Três tentativas iniciais de integrar o cliente Petals também foram preservadas com seus erros de API; os runs v4/v5 seguintes demonstram o resultado corrigido.

O Petals foi mantido como referência isolada. Foram observados um `assert` de retomada sempre verdadeiro no upstream e um símbolo de otimizador ausente na biblioteca CPU do bitsandbytes. O teste não usa treinamento/quantização nem qualifica retomada por metadados arbitrários. Esses pontos continuam bloqueando uma adoção pública sem revisão adicional.

O pacote `NETWORK_AI_EXECUCAO_F0_2026-09-14_v1.zip` reúne fontes, fixtures, testes, relatórios, resultados brutos e os seis planejamentos históricos. Seu manifesto contém tamanho e SHA-256 de cada arquivo. Pesos, ambientes instalados e caches de compilação ficam fora do ZIP; sua preparação usa os scripts e locks incluídos. A reprodução em uma instalação limpa ainda não foi executada.

No incremento F0 registrado acima, não houve publicação, deploy, commit, push, alteração de firewall, desligamento de aplicações do usuário, emissão de TU ou movimentação financeira. A publicação posterior do código e do artigo no GitHub está documentada em [Publicação](../publication/README.md) e não equivale à abertura da rede de inferência.
