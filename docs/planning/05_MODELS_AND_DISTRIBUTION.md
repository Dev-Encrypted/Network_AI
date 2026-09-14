# Modelos, memória e distribuição

Os modelos pesquisados são candidatos de bancada, não lista fechada. O [18](18_OPEN_NETWORK_AND_COMPUTE_MARKET.md) permite publicadores comunitários e distingue registro aberto, oferta executável e selo por operador. Aprovação de código/engine aqui é política do nó/pool que aceita executar, não autorização global para um modelo existir.

## Resultado da verificação Kimi

**Kimi K3 existe e tem pesos oficiais publicados.** O repositório descreve 2,8 trilhões de parâmetros totais, 104 bilhões ativos, 93 camadas, 69 KDA + 24 Gated MLA, 896 experts roteados, 16 selecionados por token e dois compartilhados. Usa AttnRes, Stable LatentMoE, SiTU-GLU e MoonViT-V2. O contexto declarado é 1.048.576 tokens; isso não será o contexto operacional automaticamente ofertado pela NETWORK AI. [Repositório oficial](https://github.com/MoonshotAI/Kimi-K3), [configuração oficial](https://huggingface.co/moonshotai/Kimi-K3/blob/f831ab66814297da540d832a5235f8e904f29d06/config.json).

A configuração declara MXFP4 em pesos selecionados, com escalas e exclusões de módulos; o anúncio também descreve ativações MXFP8. Não é correto multiplicar todos os parâmetros por quatro bits e tratar o resultado como VRAM. Nem todos os tensores têm a mesma precisão, e o runtime pode repacotar ou expandir pesos.

O caminho de referência deve incluir os estados recorrentes KDA, convoluções, cache MLA, resíduos AttnRes, posição da sequência, amostragem e fronteiras de prefix cache. Transportar somente o hidden state convencional não define uma implementação distribuída correta de K3.

## Matriz de candidatos e revisões observadas

As revisões abaixo foram resolvidas na API oficial do Hugging Face em 13/09/2026. São pins de pesquisa. **Nenhum modelo está aprovado no catálogo NETWORK AI.** Tamanhos são somas de arquivos `.safetensors` informadas pela API; não houve download/verificação dos pesos completos. Headers e índices têm metadados, não prova de execução.

| Modelo e revisão exata | Formato/arquitetura | Arquivos de pesos | Bytes informados | GiB aproximados |
|---|---|---:|---:|---:|
| Qwen/Qwen3-8B — `b968826d9c46dd6066d109eabc6255188de91218` | Dense Qwen3, BF16 | 5 | 16.381.516.776 | 15,256 |
| Qwen/Qwen3-32B — `9216db5781bf21249d130ec9da846c4624c16137` | Dense Qwen3, BF16 | 17 | 65.524.328.560 | 61,024 |
| meta-llama/Llama-3.1-70B-Instruct — `1605565b47bb9346c5515c34102e054115b4f98b` | Dense Llama, BF16 upstream | 30 | 141.107.497.872 | 131,417 |
| moonshotai/Kimi-Linear-48B-A3B-Instruct — `e1df551a447157d4658b573f9a695d57658590e9` | KDA/MLA MoE, BF16/F32 | 20 | 98.248.224.120 | 91,501 |
| moonshotai/Kimi-K2.5 — `4d01dfe0332d63057c186e0b262165819efb6611` | KimiK25, MoE/MLA + visão, INT4 misto | 64 | 595.177.988.208 | 554,303 |
| moonshotai/Kimi-K2.6 — `7eb5002f6aadc958aed6a9177b7ed26bb94011bb` | KimiK25, INT4 misto | 64 | 595.177.988.208 | 554,303 |
| moonshotai/Kimi-K2.7-Code — `74797c9c62378b951a1f6fcf5c4631024e9b8bef` | KimiK25, INT4 misto | 64 | 595.177.988.208 | 554,303 |
| moonshotai/Kimi-K3 — `f831ab66814297da540d832a5235f8e904f29d06` | KDA/Gated MLA/AttnRes/LatentMoE + visão, MXFP4 misto | 96 | 1.560.936.091.448 | 1.453,735 |

Os metadados de cada linha estão em [evidence](evidence/README.md), incluindo `source`, timestamp, revisão, lista de arquivos e hashes LFS quando informados pelo publicador. Os índices registram `total_size` ligeiramente menor que a soma dos arquivos porque esta inclui headers. Não interpretar contagens de tensores empacotados U8/I32 do Hub como parâmetros ativos ou qualidade do modelo.

Fontes de arquitetura e uso: [Qwen3-8B](https://huggingface.co/Qwen/Qwen3-8B), [Qwen3-32B](https://huggingface.co/Qwen/Qwen3-32B), [Llama 3.1](https://huggingface.co/meta-llama/Llama-3.1-70B-Instruct), [Kimi Linear](https://huggingface.co/moonshotai/Kimi-Linear-48B-A3B-Instruct), [K2.5](https://github.com/MoonshotAI/Kimi-K2.5), [K2.6](https://huggingface.co/moonshotai/Kimi-K2.6), [K2.7-Code](https://huggingface.co/moonshotai/Kimi-K2.7-Code), [K3](https://huggingface.co/moonshotai/Kimi-K3).

## Matriz de integração e tamanho mínimo

Cruzar esta matriz com a [matriz heterogênea](15_HETEROGENEOUS_HARDWARE_AND_CATALOG.md). Várias capacidades de memória, fabricantes e modelos estão previstos, com qualificação por combinação. O perfil 24 GiB é a primeira bancada, não requisito universal.

| Candidato | Licença/procedência | Engine e hardware | Unidade/estado e menor nó | Trabalho e gate |
|---|---|---|---|---|
| Qwen3-8B BF16 | Oficial; Apache-2.0 | vLLM; testar Ampere/Ada separadamente | Modelo inteiro; KV GQA; hipótese de orçamento 20 GiB numa placa 24 GiB | Primeiro A, texto e tools; medir 8K/1 sessão |
| Qwen3-32B BF16 | Oficial; Apache-2.0 | vLLM em B; não cabe inteiro em 24 GiB | TP/PP conforme suporte; ao menos 4×16 GiB só por soma de pesos, sem garantia de layout | Comparação A/B em hardware de referência; C requer integração específica, não suportado por inferência do nome |
| Llama-3.1-70B | Oficial, acesso manual e licença Llama 3.1 | Petals documenta família; versão/quantização precisam ser reproduzidas | Blocos + embeddings/head; KV. NF4 é transformação separada, não o checkpoint BF16 da tabela | Referência C se acesso concedido e obrigações atendidas; alternativa de bancada BLOOM suportada, sem substituir a avaliação K3 |
| Kimi Linear 48B-A3B | Oficial; MIT | vLLM/SGLang conforme revisão qualificada | 27 camadas, estados KDA/MLA; ≥6 budgets de 16 GiB apenas por soma BF16 | Proxy para estados híbridos; não valida LatentMoE/AttnRes/visão do K3 |
| K2.5 | Licença MIT modificada, oficial | Receitas vLLM/SGLang e caminho KTransformers | 61 camadas; 384 experts, 8 selecionados; MLA e visão; shard MoE maior ≈9,14 GiB | Medir bloco INT4 em 24 GiB; loaders parciais, parser, visão e paridade |
| K2.6 | Licença MIT modificada, oficial | Mesma classe arquitetural declarada do K2.5; validar engine/build próprios | Estado MLA/visão; pesos diferentes, apesar do mesmo tamanho | Qualificação funcional separada; nenhuma mistura de revisões |
| K2.7-Code | Licença MIT modificada, oficial | Classe KimiK25; receita de serving e parser a qualificar | Mesma estrutura de armazenamento observada; qualidade/custo de coding não derivados de parâmetros | Suite de tools/código e contexto preservado; não assumir equivalência ao K2.6 |
| K3 | Kimi K3 License, oficial | vLLM e SGLang têm suporte/receitas de cluster; Ampere/Ada 24 GiB não qualificados | Shard de camada até 15,824 GiB em disco; estados híbridos e buffers adicionais | Pesquisa prioritária de kernel, load parcial, fronteiras AttnRes, rede e recuperação |

Tamanhos mínimos baseados em soma são **limites inferiores de armazenamento**, não configurações executáveis. A menor unidade admitida pela engine e os buffers podem exigir nó maior. Redução de precisão ou offload muda a configuração e precisa de validação própria.

K2.5/K2.6/K2.7-Code permitem redistribuição sob suas condições e exigem exibição de nome quando ultrapassados os limiares previstos, além dos avisos. K3 tem também uma condição específica para Model as a Service: receita agregada do licenciado e afiliadas superior a US$ 20 milhões em 12 meses consecutivos exige acordo separado antes do uso comercial abrangido. A condição de destaque visual é distinta: mais de 100 milhões de usuários ativos mensais ou US$ 20 milhões de receita mensal. Registrar essas obrigações no catálogo de licenças; não chamar K3 de MIT simples. [K3 License](https://github.com/MoonshotAI/Kimi-K3/blob/main/LICENSE), [K2.5](https://huggingface.co/moonshotai/Kimi-K2.5/blob/main/LICENSE), [K2.6](https://huggingface.co/moonshotai/Kimi-K2.6/blob/main/LICENSE), [K2.7-Code](https://huggingface.co/moonshotai/Kimi-K2.7-Code/blob/main/LICENSE).

## Memória: categorias que não podem ser somadas duas vezes

```text
VRAM necessária por atribuição =
  pesos residentes e suas escalas
  + KV/SSM/convoluções/resíduos persistentes
  + buffers de prefill/decode e comunicação
  + workspace de kernels e gráficos CUDA
  + concorrência adicional efetivamente reservada
  + margem do allocator/fragmentação

VRAM utilizável = min(limite do participante, memória observada segura)
                  - reserva adicional para aplicações externas, se ainda não descontada
```

O schema identifica se o limite já exclui a reserva do usuário para impedir desconto duplo. O daemon mantém um único orçamento por domínio físico de GPU; não admite leases cuja soma ultrapasse o limite. MIG só pode representar isolamento quando hardware/configuração realmente o suportam. Múltiplos processos e UUIDs autodeclarados não provam unicidade física.

**Exemplo calculado, não medido:** Qwen3-8B possui 36 camadas, 8 KV heads, head dimension 128. KV BF16 convencional por token = `2 × 36 × 8 × 128 × 2 = 147.456 bytes`. Para 8.192 tokens totais e uma sessão: **1,125 GiB**. Pesos informados 15,256 GiB + KV 1,125 + hipótese 2 GiB de buffers + 1 GiB de allocator/runtime = **19,381 GiB**. Budget de 20 GiB numa GPU nominal 24 GiB deixa 4 GiB externos. Os 3 GiB de overhead são hipótese a medir. Uma segunda sessão ou chunk de prefill maior pode inviabilizar esse budget. [Config fixada](https://huggingface.co/Qwen/Qwen3-8B/blob/b968826d9c46dd6066d109eabc6255188de91218/config.json).

MLA não deve receber a fórmula de KV GQA expandido sem verificar layout da engine. KDA mantém estado recorrente de tamanho relacionado à geometria, mas prefix caching e especulação podem multiplicar slots/snapshots. AttnRes acrescenta dependências entre camadas. A receita SGLang distingue pools KDA e MLA e diferentes quantidades de slots. [SGLang K3](https://docs.sglang.io/cookbook/autoregressive/Moonshotai/Kimi-K3).

**RAM:** considerar staging de download, mmap/page cache, tokenizer, processo, tensores em trânsito e possíveis cópias descompactadas. Para o primeiro nó A, hipótese de 32 GiB de RAM; para laboratório de K3 parcial, 64 GiB, ambos sujeitos à medição de pico. Não qualificar offload de um modelo de 1,56 TB com essas hipóteses.

**SSD:** guardar apenas atribuição + cache opcional + área temporária. Pico de atualização pode exigir versão anterior e nova simultaneamente; se não houver espaço, baixar após drenagem ou recusar update, sem apagar o que está em uso. Um publicador que repacota K3 pode precisar de múltiplas cópias do checkpoint em armazenamento temporário; planejar capacidade em TB antes da operação.

## Granularidade real dos arquivos

A análise dos índices fixados observou:

| Origem | Resultado | Consequência para downloads |
|---|---|---|
| K3 | Cada camada de linguagem mapeia a um shard; 93 camadas e 96 arquivos totais | Hospedar a camada pode aproveitar o alinhamento. Os arquivos extras cobrem componentes adicionais; 96 arquivos não significam 96 estágios |
| K2.5/K2.6/K2.7-Code | Cada camada de linguagem mapeia a um shard; 61 camadas, 64 arquivos | Download parcial por camada é plausível no armazenamento, mas o loader da engine precisa aceitá-lo |
| Qwen3-8B/32B e Kimi Linear | Algumas camadas aparecem em até dois shards | Um `allow_patterns` por nome de arquivo pode baixar pesos alheios à atribuição |

Um expert dentro de um shard K3 não é um objeto HTTP autônomo. O maior shard informado tem **16.990.916.912 bytes**. Baixar somente tensores específicos exige range reads a partir de headers, integridade por chunks e suporte do loader, ou repacotamento autorizado. O índice de nomes não basta para validar bytes parciais. Tratar HTTP Range como otimização, não como verificação de conteúdo. [Índice K3 fixado](https://huggingface.co/moonshotai/Kimi-K3/blob/f831ab66814297da540d832a5235f8e904f29d06/model.safetensors.index.json).

## Manifesto imutável

Manifesto v1 tem envelope `{payload, manifest_id, signatures[]}`. `payload` contém somente a especificação imutável; não contém seu próprio digest, assinaturas nem o estado mutável de aprovação do catálogo. Cada assinatura tem `publisher_key_id`, `algorithm` e `value`. Fixar JSON Canonicalization Scheme (RFC 8785), SHA-256 e Ed25519, com bibliotecas consolidadas e vetores entre Rust/Python/TS. [JCS](https://www.rfc-editor.org/rfc/rfc8785).

Definição exata: `manifest_id = hex_lower(SHA256(UTF8("networkai/model-manifest/v1") || 0x00 || UTF8(JCS(payload))))`. `configuration_id` referencia esse mesmo digest. Assinar os bytes `UTF8("networkai/model-manifest-signature/v1") || 0x00 || digest_binario_32_bytes`; verificar também autoridade e revogação do key ID. Chaves/assinaturas usam encoding base64url sem padding, declarado no schema. Reassinar o mesmo payload não muda sua configuração; aprovar/retirar uma configuração é evento de catálogo separado.

Representar bytes/créditos e inteiros grandes como strings decimais; dimensões limitadas podem ser inteiros JSON exatos. Rejeitar chaves duplicadas, Unicode inválido, NaN e schema não suportado antes da canonicalização. Preservar strings Unicode, sem normalização implícita. O exemplo YAML abaixo é somente rascunho de campos, não envelope canônico assinável.

| Campo obrigatório | Semântica/validação |
|---|---|
| schema_version, manifest_id | Versão suportada; digest recalculado |
| upstream_repo, revision, provenance | Revisão completa e cadeia upstream→transformação→publicação |
| license_id, license_digest, notices, redistribution_policy | Texto versionado, permissões e restrições por destino/grupo |
| architecture, graph_revision, component_abi | Grafo e dependências, inclusive módulos auxiliares e estados |
| tokenizer, chat_template, parsers | IDs, hashes e revisão; compatibilidade de tools/reasoning |
| weight_format, quantization, compute_dtype, cache_dtype | Algoritmo, bits, group size, escalas, exceções e kernels |
| artifacts[] | Caminho seguro, bytes, SHA-256 integral, chunks/hash, mirrors autorizados |
| components[] | Tensores, dependências, intervalos de camadas e artefatos necessários |
| engine_builds[], hardware_profiles[] | Engine/commit/image digest, CUDA/driver, ISA/SM, ABI e qualificações |
| capabilities | Texto/visão/áudio/tools/structured output efetivamente testados |
| memory_profiles[] | Pesos, estados por sessão/contexto, buffers, RAM/SSD, margem e origem da estimativa |
| publisher_key_id, signature | Chave autorizada, algoritmo, cadeia/estado de revogação |

Exemplo de referência **não publicável**, pois hashes de bytes e build ainda não foram medidos:

```yaml
schema_version: networkai.model-manifest.v1
status: draft
upstream_repo: Qwen/Qwen3-8B
revision: b968826d9c46dd6066d109eabc6255188de91218
architecture: Qwen3ForCausalLM
license_id: Apache-2.0
weight_format: safetensors
quantization: none
compute_dtype: bfloat16
cache_dtype: bfloat16
operational_limits:
  total_tokens: 8192
  max_concurrency_per_worker: 1
artifacts: REQUIRED_FROM_VERIFIED_BYTES
components: REQUIRED_FROM_REVIEWED_GRAPH
engine_builds: REQUIRED_AFTER_GPU_QUALIFICATION
memory_profiles: REQUIRED_AFTER_MEASUREMENT
publisher_key_id: REQUIRED_AUTHORIZED_KEY
signature: REQUIRED
```

Manter separadas disponibilidade/licença do modelo upstream, aprovação do pacote e capacidade instantânea. Revisões nunca recebem overwrite; um rollback troca o ponteiro de catálogo para outro manifesto aprovado. Uma revogação pode impedir uso de manifesto assinado, sem alterar seus bytes históricos.

## Downloads e cache

1. Controle propõe componentes e budget de SSD; daemon valida licença, assinatura, dependências e espaço antes de aceitar download.
2. Daemon baixa manifesto e metadados pequenos; só aceita caminhos relativos normalizados, sem symlinks, traversal ou URLs arbitrárias fora da allowlist.
3. Download vai para área `.partial` por digest, com limite de banda e checkpoint de chunks. Resume requer mesma revisão, tamanho e validator; mudança de ETag/digest reinicia a parte afetada.
4. Conferir hash de cada chunk quando disponível e SHA-256 integral antes de promover arquivo. ETag S3 não é tratado como SHA-256.
5. Renomear atomicamente para cache por conteúdo; iniciar load apenas após todos os componentes obrigatórios verificados.
6. Leases de arquivo/refcounts impedem eviction de artefatos carregados ou em abertura. Recuperar referências após crash por diário local e inventário dos processos.
7. Limpeza usa LRU dentro da quota para objetos sem referências; nunca remover versão usada por sessão. `ENOSPC` é erro administrável, não justificativa para apagar diretórios externos.

P2P futuro transfere chunks do mesmo conteúdo e preserva checksums/assinaturas. Peers não escolhem quais modelos podem ser publicados nem alteram licenças. Cache extra não recebe remuneração de VRAM; distribuição de arquivos teria produto/incentivo separado, se algum dia for necessário.

Não executar `trust_remote_code` recebido livremente do Hub. Receitas K3 usam esse recurso: revisar módulos necessários, fixar revisão, empacotar código aprovado numa imagem assinada, desabilitar downloads de código em runtime e limitar rede. Se não for possível operar com componente auditado, o candidato fica bloqueado para comunidade. Safetensors reduz a superfície de desserialização, mas não elimina bugs de parser/kernels. [vLLM K3](https://vllm-project.github.io/2026/07/27/k3.html), [Safetensors](https://huggingface.co/docs/safetensors/index).

## Plano específico de integração Kimi

| Etapa | Trabalho concreto | Evidência de conclusão |
|---|---|---|
| K01 — referência | Obter pacote licenciado; fixar engine, kernels, template e parser; executar K3 completo em cluster suportado | Imagem/digests, logs de load, VRAM/RAM e corpus de saídas, tools e modalidades |
| K02 — menor unidade | Identificar módulos por camada; medir load isolado dos casos KDA e MLA, camada densa, experts, head e visão em RTX 3090/4090 | Pico de memória e latência por unidade; resultado explícito de kernel não suportado/expansão |
| K03 — fronteira | Especificar resíduos AttnRes anteriores, normalizações, offsets, short-conv/KDA, layout MLA e parâmetros de amostragem | Golden tensors e grafo de dependências; nenhuma dependência oculta na chamada remota |
| K04 — pipeline privado | Implementar stage executor/load parcial, driver, buffers e microbatch; ligar dois estágios em LAN | Paridade de logits/estados em cada fronteira e geração completa |
| K05 — WAN e recuperação | Medir rotas maiores, latência, relay, sessão longa, nó lento; replay/checkpoint dos estados híbridos | Curvas de custo/latência, falha de cada componente e capacidade mínima de rota |
| K06 — produto | Tools/reasoning history, imagens quando habilitadas, accounting e quotas | Configuração de catálogo somente após todos os gates funcionais e operacionais |

Kimi Linear é um laboratório útil para parte de K02/K03, mas não comprova K3. K2.5 pode reduzir risco do load INT4/MLA e da visão; K3 exige trabalho adicional em KDA, AttnRes, LatentMoE e SiTU. Não esconder esse trabalho sob “adicionar um adaptador”.

As receitas vLLM indicam grandes GPUs, build CUDA/driver específico e dependências em desenvolvimento; SGLang distingue células verificadas das que ainda aguardam validação. Isso sustenta um plano de referência B, não uma afirmação de viabilidade C em GPUs de 24 GiB. [vLLM recipe](https://recipes.vllm.ai/moonshotai/Kimi-K3), [SGLang cookbook](https://docs.sglang.io/cookbook/autoregressive/Moonshotai/Kimi-K3).

## Validação numérica e funcional

Fixar o mesmo checkpoint, tokenizer, template, precisão, geração e corpus na referência e na distribuição. Comparar primeiro a mesma quantização, para não misturar erro de transporte/particionamento com erro da compressão. Medir logits, erro relativo L2, máximo absoluto, top-k e estados de fronteira; usar seeds controladas, sem exigir igualdade de texto amostrado.

Proposta inicial de gate: erro relativo L2 ≤0,02 em logits BF16 e diferença absoluta máxima ≤0,2, sujeitos à calibração prévia contra repetição da própria referência; não aumentar tolerância depois de ver o resultado para aprovar uma implementação. Para quantização, estabelecer envelope antes da execução com perda de qualidade aceitável por corpus. Casos de top-1 quase empatados exigem análise de margens.

Testar prefill inteiro versus chunked, prefix hit/miss, sessões intercaladas, cancelamento, replay do mesmo prefixo e recomposição após falha. Cobrir 2K, 8K, 32K e contextos maiores somente quando houver memória; 1M é experimento separado. Tools precisam preservar IDs, JSON/schema e mensagens de raciocínio quando o contrato do modelo exigir. Validar chamadas antes de executar qualquer ferramenta, sempre no consumidor. Ver gates completos no [10](10_BENCHMARKS_AND_CAPACITY.md).
