# Tecnologias e decisões arquiteturais

## Status das escolhas

As decisões abaixo consolidam a direção de implementação. Elas não certificam um build executado. Bibliotecas, imagens, drivers, modelos e protocolos serão fixados por versão e digest no primeiro incremento. Os hashes observados em [engine-commits.jsonl](evidence/engine-commits.jsonl) são referências de pesquisa, não combinações binárias já aprovadas.

Cada ADR explicita problema, escolha, alternativa, limite, validação e evolução. Alterações futuras devem citar o ADR substituído e a evidência que motivou a mudança.

Revisão de 13/09/2026: rede aberta, cooperação sem compradores e mercado adicional são requisitos atuais. ADR-001/004 descrevem operação local; ADR-012 cobre identidade/ofertas; ADR-013 trata dinheiro e ADR-014 define TU cooperativo e limites elásticos. Escolhas de laboratório não limitam ofertas de outros operadores.

## ADR-001 — Controle de um pool/gateway em monólito modular

**Problema:** contas, leases e ledger precisam de transações e limites de responsabilidade sem custo precoce de microserviços. **Escolha:** TypeScript/NestJS, módulos de identidade, catálogo, admissão, placement, sessões, ledger e administração; workers de outbox/conciliador podem usar o mesmo código em processos separados. [Módulos NestJS](https://docs.nestjs.com/modules).

**Alternativas:** microserviços desde o início adicionariam coordenação e falhas; backend todo em Python misturaria ciclos de release da engine e do negócio. **Limite:** o monólito não recebe tensores nem executa kernels. **Validação:** testes de dependências e transações; medição de latência de admissão. **Evolução:** extrair um módulo apenas quando custo de escala, isolamento ou equipe justificar, mantendo seus contratos.

## ADR-002 — Daemon e gateway em Rust

**Problema:** supervisão persistente, controle de recursos, downloads e comunicação precisam funcionar independentemente de crashes Python. **Escolha:** daemon Rust, CLI Rust e bibliotecas comuns para framing, identidade e transporte; gateway de inferência usa as mesmas bibliotecas num binário separado.

**Alternativas:** um daemon Python é mais rápido para prototipar, mas acopla dependências de serving à operação do host; uma terceira linguagem não traz benefício suficiente. **Limites:** Rust não implementará operações do modelo no MVP; segurança de memória não protege contra administrador malicioso. **Validação:** kill/restart, suspensão, cache, limites de buffers, fuzz de frames e cancelamento. **Evolução:** adaptadores de SO e transporte substituíveis, protocolo estável com worker.

## ADR-003 — Um caminho de engine no serviço inicial

**Problema:** suportar várias engines antes de medir aumenta a matriz de falhas. **Escolha:** worker Python com adaptador vLLM para modos A/B. Qwen3-8B BF16 é o candidato de início; Petals roda em ambiente de laboratório independente para C. SGLang participa da comparação Kimi da Fase 0, não é uma segunda engine do catálogo MVP por padrão.

**Alternativas:** Petals integral limita catálogo/manutenção; SGLang é alternativa real se ganhar nos critérios Kimi; llama.cpp é adequado a formatos/hardware distintos; TensorRT-LLM pode beneficiar clusters NVIDIA. **Limite:** vLLM genérico não fornece um worker de “camada K3 sobre libp2p”. **Validação:** paridade, VRAM, API, cancellation e benchmark. **Evolução:** contrato `EngineAdapter` do [09](09_DATA_MODEL_AND_APIS.md), sem lógica financeira no adaptador.

Fontes: [vLLM](https://github.com/vllm-project/vllm), [SGLang](https://github.com/sgl-project/sglang), [Petals](https://github.com/bigscience-workshop/petals), [llama.cpp RPC](https://github.com/ggml-org/llama.cpp/blob/master/tools/rpc/README.md).

## ADR-004 — PostgreSQL autoritativo local e Redis efêmero

**Problema:** perda de cache ou concorrência não pode criar crédito. **Escolha:** PostgreSQL com SQL parametrizado, migrations SQL versionadas, `pg` no backend, inteiros de 64 bits, locks ordenados e transações explícitas. Redis armazena presença, índices de fila e cache reconstruível. Redis indisponível reduz desempenho; DB decide admissão e saldo. [Isolamento PostgreSQL](https://www.postgresql.org/docs/current/transaction-iso.html).

**Alternativas:** Redis como saldo é rejeitado; registros externos dos ADR-012/014 resolvem autorização cooperativa e liquidação financeira independentes, não correção da inferência nem banco operacional. **Limites:** PostgreSQL não cria saldo global; retry serializável e inteiros exatos são obrigatórios. **Validação:** concorrência, crash, restore e reconciliação com eventos finalizados de liquidação. **Evolução:** projeções e particionamento, preservando journal local e autoridades externas correspondentes a TU e dinheiro.

Redis 8 tem opções de licenciamento que devem ser selecionadas conscientemente; manter uso como serviço independente e verificar a versão concreta. Valkey é alternativa se licenciamento/operação do Redis não forem adequados. Não congelar uma versão antiga sem patches para evitar essa decisão. [Licenças Redis](https://redis.io/legal/licenses/).

## ADR-005 — Protobuf/gRPC e transporte P2P limitado

**Problema:** daemon, worker e controle têm linguagens e ciclos diferentes. **Escolha:** Protobuf versionado para mensagens de controle, gRPC/TLS entre controle e daemon por conexão de saída, e gRPC sobre socket local entre daemon e worker. Para tensores do modo C, protocolo próprio de dados limitado sobre streams QUIC, com `Transport` substituível.

**Candidato P2P:** rust-libp2p com QUIC, descoberta inicialmente autorizada pelo diretório, AutoNAT/DCUtR e Circuit Relay qualificados. Iroh é comparador da Fase 0 pela integração Rust e transporte já utilizado por PRIME-IROH. [libp2p QUIC](https://libp2p.io/docs/quic/), [hole punching](https://libp2p.io/docs/hole-punching/), [Iroh](https://github.com/n0-computer/iroh).

**Alternativas:** HTTP/gRPC serve bem controle e A/B, mas não se presume ideal para todos os tensores; um P2P novo sem biblioteca é rejeitado. **Limite:** UDP pode estar bloqueado; hole punching não vence todo CGNAT. Prever túnel de saída TLS/TCP 443 com relay autenticado e quotas; medir seu custo. Não usar circuit relay como proxy aberto. **Validação:** matriz real NAT/perda/jitter e cópias GPU↔CPU. **Evolução:** escolher um único stack após comparação; não acoplar mensagens do produto à DHT da bancada Petals.

## ADR-006 — Artefatos por conteúdo e HTTP primeiro

**Problema:** membros não precisam baixar um checkpoint inteiro quando hospedam poucos componentes. **Escolha:** S3/HTTP, manifestos assinados, revisão exata, arquivos seguros, índices de componentes, resume/ranges verificados e cache endereçado por conteúdo. P2P de arquivos é evolução independente da inferência.

**Alternativas:** distribuição BitTorrent/IPFS desde o MVP adiciona admissão e controle de licenças; baixar o repo inteiro desperdiça espaço e tráfego. **Limite:** hash upstream informado não equivale a bytes verificados; code payload não é aceito automaticamente. **Validação:** corrupção, queda, quota e eviction durante uso. **Evolução:** peers distribuem chunks autenticados pelo mesmo manifesto, sem mudar o catálogo. [Safetensors](https://huggingface.co/docs/safetensors/index), [TUF](https://theupdateframework.github.io/specification/latest/).

## ADR-007 — Web e desktop separados do daemon

**Problema:** experiência não pode duplicar supervisão ou decisões de crédito. **Escolha:** React/Next.js na web; Tauri/React depois da CLI, consumindo API local de escopo restrito. Next.js é interface/BFF, não outra autoridade de saldo. Tauri não aceita comandos shell arbitrários vindos do webview. [Segurança Tauri](https://v2.tauri.app/security/).

**Alternativas:** Electron amplia runtime e superfície sem necessidade comprovada; só web não administra adequadamente recursos locais. **Limites:** webview tem risco de XSS e IPC; desempenho das engines continua dependente de SO/driver. **Validação:** permissões, origem de IPC, pausa e estado real do daemon. **Evolução:** reutilizar componentes visuais e SDK, não importar módulos internos do ledger.

## ADR-008 — Linux de referência, Windows em qualificação

**Escolha:** Linux x86-64 em primeiro lugar; NVIDIA 24 GiB de duas gerações testadas separadamente. Python 3.12 e Node.js 24 LTS são hipóteses de base do desenvolvimento; engines podem exigir outro Python/CUDA dentro de imagens isoladas. Rust stable fixado via toolchain. Não usar `latest` em uma configuração aprovada.

Isso limita a primeira qualificação, não o produto. A matriz extensível por fabricante, VRAM, SO e modelo está no [15](15_HETEROGENEOUS_HARDWARE_AND_CATALOG.md). Revalidar ciclo de suporte do runtime ao congelar o build. [Node.js releases](https://nodejs.org/en/about/previous-releases).

**Alternativas/limites:** Windows nativo não possui automaticamente todos os caminhos de serving; WSL2 compartilha GPU com Windows e tem limites de memória, pinned memory, gerenciamento e observabilidade. Não instalar driver Linux dentro do WSL como se fosse host físico. **Validação:** instalação, jogos concorrentes, sleep/resume, restart do WSL, limites e cancelamento. **Evolução:** qualificação por matriz de hardware/SO. [CUDA WSL](https://docs.nvidia.com/cuda/wsl-user-guide/index.html).

## ADR-009 — Observabilidade e implantação simples

**Escolha:** Docker/Compose, OpenTelemetry para rastros sem conteúdo, Prometheus para métricas e Grafana para painéis. Métricas não incluem IDs de sessão como labels de alta cardinalidade; correlação detalhada usa logs restritos com retenção limitada. Cada imagem de engine tem SBOM, digest, matriz de driver e evidência de testes.

**Alternativas:** Kubernetes só depois de necessidade de orquestração/HA de múltiplos hosts e equipe capaz de operá-lo; NATS só quando outbox + workers se tornarem gargalo medido de distribuição de eventos. **Limites:** Compose não fornece HA do banco nem segurança do host por si só. **Validação:** restore, upgrade e rollback com sessões. **Evolução:** contratos e imagens iguais permitem mudar implantação sem reescrever negócio.

## ADR-010 — Primeira economia de serviço, revisada pelo ADR-014

**Histórico:** a primeira versão previa crédito por reserva útil sem saque. O ADR-013 introduziu mercado, mas vinculou indevidamente todo ganho a dinheiro. O ADR-014 corrige isso: cooperação continua sem compradores e o saldo comercial é separado. Exemplos históricos não são depósitos reais.

**Limites preservados:** tempo contínuo e unicidade física não são perfeitamente demonstráveis em hosts hostis; crédito acumulado não armazena a computação ociosa. Validar fraude, pico, custo, estoques e continuidade de resgate.

## ADR-011 — Confiança e agente local

**Escolha:** comunitário, grupo autorizado, privado/local e confidencial qualificado são políticas diferentes. Ferramentas de agentes executam no ambiente do consumidor; participant workers executam somente inferência aprovada. **Alternativas:** sandbox no contributor para código do consumidor amplia o escopo e é rejeitada no MVP.

**Limites:** container, TLS e assinatura não escondem dados do administrador do host. **Validação:** abuso de capability, isolamento de sessões, injeção de prompt e updates maliciosos. **Evolução:** computação confidencial somente com atestação de CPU/GPU, software e vinculação da chave ao canal. [NVIDIA](https://docs.nvidia.com/nvtrust/index.html), [OWASP prompt injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/).

## ADR-012 — Identidade, ofertas e liquidação independentes

**Escolha:** chave local, anúncios/manifestos assinados, múltiplos indexadores/gateways, descoberta P2P com importação direta e liquidação financeira existente a selecionar para o comércio. O registro de serviço é independente, conforme ADR-014. O [18](18_OPEN_NETWORK_AND_COMPUTE_MARKET.md) define papéis e fluxos. **Alternativa:** consenso nativo/token próprio somente por decisão específica e bancada. **Limite:** cadeia prova regras financeiras, não resposta de IA; RPC, finalidade, upgrade e disponibilidade de saída precisam ser avaliados. **Validação:** três operadores, remover servidor original, rejeitar gasto duplo e verificar retirada independente.

## ADR-013 — Pagamento comercial financiado

**Escolha:** receita comercial vem de clientes ou contratantes com fundos confirmados. Reserva comercial e spot são modos distintos, sem dupla remuneração da mesma alocação. Pagamentos transferem unidades financeiras entre partes; não emitem TU de cooperação nem oferecem saque de TU.

**Escopo corrigido:** esta regra vale para dinheiro; a dependência anterior de compradores para todo crédito foi removida pelo ADR-014. **Limite:** preço menor depende de custo, qualidade, taxas e utilização. **Validação:** conservação de fundos, escrow, reembolso, retirada e capacidade comercial realmente reservada.

## ADR-014 — Cooperação sem compradores e limites por capacidade

**Problema:** a rede deve gerar utilidade recíproca mesmo com vendas zero e distribuir a capacidade ociosa. **Escolha:** TU emitido por READY útil contratado/verificado, com orçamento S+L+J/capacidade do [20](20_COOPERATIVE_ECONOMY_AND_ELASTIC_LIMITS.md); o ADR-015 completa a destinação do consumo entre circulação e queima. Saldo financeiro permanece separado. Limites temporários 1×/2×/4× ampliam admissão sob folga real, sem emissão adicional ou reajuste automático de tarifa.

**Alternativas:** saldo ilimitado por estar online acumula promessa sem capacidade; exigir dinheiro para todo ganho inviabiliza a cooperação solicitada. Desconto fora de pico fica para experimento posterior.

**Autoridade selecionada:** CometBFT/ABCI, referência de bancada v0.38.26, quatro organizações independentes e confirmação por três. Admissão/rotação estão no 22; piloto federado, sem equivalência ao consenso aberto do Bitcoin. Nenhum consenso novo. Falha do módulo financeiro não deve impedir TU com registro saudável; perda de confirmação segura bloqueia novos gastos.

**Limites:** consenso não prova GPU; crédito não paga custos externos nem garante modelo/horário. Parâmetros são hipóteses. **Validação:** E15/E16, 7 dias sem compradores e 30 dias com demanda/churn/ataques, sem dupla contagem de recursos, emissão ou fundos. Preservar preço/prazo de sessões aceitas ao reduzir extras. **Evolução:** revisar tarifas futuras, orçamento, governança e algoritmo conforme evidência; nunca converter TU em dinheiro por mudança de nome.

## Monorepo proposto

Estrutura futura; estes diretórios de produto ainda não foram criados.

```text
network-ai/
  apps/{web,control-api,desktop,cli}/
  services/{node-daemon,inference-worker,session-gateway,scheduler}/
  packages/{contracts,sdk,model-manifest,config,ui}/
  crates/{node-core,transport,artifact-cache,session-auth}/
  adapters/engines/{vllm}/
  adapters/models/
  infra/{compose,deployment,observability}/
  tests/{unit,integration,contracts,security,gpu,network,load}/
  benchmarks/{specs,fixtures,results}/
  docs/{planning,adr,architecture,operations}/
```

`services/scheduler` começa como módulo/worker do control-api. `crates` evita duplicação entre daemon, CLI e gateway. O código de pesquisa Petals/SGLang terá ambiente isolado em bancada futura, sem virar dependência transitiva de produção.

A rede aberta acrescenta módulos/contratos de `offer-registry`, `market-discovery`, `settlement-adapter` e `escrow`, sem obrigar novos serviços por nome. O [24](24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md) seleciona x402 batch-settlement/EVM em Base Sepolia com USDC de teste como referência do EP10. Contrato concreto, release e facilitadores ainda precisam de qualificação; nada foi implantado ou movimentado.

| Componente | Responsabilidade e dependências permitidas | Contrato | Testes exigidos |
|---|---|---|---|
| web | Interface; sdk/ui/config | HTTP público e SSE | Jornadas, acessibilidade, saldo/fila/erros visíveis |
| control-api | Identidade, catálogo, sessão, políticas e ledger em módulos | HTTP controle; gRPC nós; outbox | Transações, autorização por objeto, integração DB |
| desktop | React/Tauri; sdk e IPC restrito do daemon | API local autenticada | IPC/origem, permissões, pausa e upgrade |
| cli | Comandos de contribuição; node-core/sdk de controle | Mesmo IPC/protocolo do desktop | Contrato, flags, retorno de erro e sinais |
| node-daemon | Chaves, leases, recursos, downloads e supervisor | NodeControl e WorkerControl | Crash, resource budget, rede, atualização |
| inference-worker | Engine numérica e medição local | EngineAdapter/WorkerControl | Paridade, estados, cancelamento e VRAM |
| session-gateway | Ingresso HTTP/SSE, limites e forwarding | Session API e transport | Streaming lento, replay, contagem e falha |
| scheduler | Placement e seleção; usa repositórios por interface | Propostas, Prepare/Commit/Abort | Cobertura, fairness, leases, topologia e churn |
| contracts | Fontes Protobuf/OpenAPI e geração por linguagem | Versões independentes | Compatibilidade e fixtures entre linguagens |
| sdk | Cliente público; depende só de contracts/config | HTTP/SSE | Subconjunto compatível e erros |
| model-manifest | Schema, canonicalização e verificadores | Manifest v1 | Assinatura, hash, limites e roundtrip |
| config | Schema de configuração não secreta | Config versionada | Migração e validação |
| ui | Componentes React sem regras financeiras | Props acessíveis/localizadas | Interações e renderização |
| adapters/engines | Bridges para APIs internas da engine | EngineAdapter | Suites da engine selecionada |
| adapters/models | Templates, limites e grafo aprovados | ModelConfiguration | Tokenização, tools, modalidades e ABI |
| infra | Implantação, backups, dashboards | Digests/config por ambiente | Restore, rollback, health e secrets |
| benchmarks/tests | Fixtures e executores de validação | Protocolo do documento 10 | Reprodutibilidade e evidência arquivada |

Dependências proibidas: UI→ledger interno; ledger→engine; engine→DB de contas; contratos→apps; daemon→código do frontend; adaptador→emissão de créditos. Enforce por imports/crates e teste de arquitetura. O worker pode relatar contadores, nunca aprovar sua própria remuneração.

## Versionamento e compatibilidade

Protobuf usa namespace `networkai.node.v1`; não reutilizar números de campo, reservar os removidos, tratar enum desconhecido como incompatibilidade segura. IDs de request/evento são estáveis. Additions opcionais compatíveis exigem teste cruzado entre N e N−1; comportamento financeiro novo exige feature flag/capability explícita, nunca inferência por campo ausente.

Daemon anuncia intervalo de protocolos, worker ABI, plataformas e feature bits. O controle escolhe a interseção; se vazia, nó vai a `UPDATE_REQUIRED`, sem novas atribuições. Build da engine, layout KV/SSM, tokenizer e quantização fazem parte da configuração: atualização binária incompatível não migra estado em memória.

HTTP público tem `/v1`, esquema de erro versionado e testes com clientes escolhidos. Semântica de preço/ledger é versionada separadamente. Atualização de contrato financeiro não altera a tarifa de um lease já aceito nem de uma sessão já reservada. Detalhes e exemplos em [09](09_DATA_MODEL_AND_APIS.md).

## ADR-015 — Circulação, continuidade e autoridade explícita

Problema: queima integral, emissão travada por estoque e saída de provedores podem impedir o próprio consumo de saldos antigos. Escolha: consumo recompõe reserva de TU até alvo publicado e queima excedente; READY usa primeiro TU existentes, depois emissão complementar previamente autorizada. Nenhuma dupla remuneração ou mudança da tarifa aceita. S inclui toda a reserva; L só emissão futura; J só reversão aprovada de TU queimados ainda não lançada.

O [22](22_POLICY_CLOSURE_AND_CONTINUITY.md) fixa a reserva inicial de referência, qualificação de preços, fila, atestação, governança 4/3 com CometBFT/ABCI e caixa 30+7 dias. O [23](23_INTEGRATED_ECONOMY_SIMULATIONS.md) mostra ganho nos nove controles de circulação e rejeição da configuração fictícia para abertura. Consequência: não lançar tarifas antes da calibração e do teste real; preservar redução de escopo, hibernação e retomada verificável.

## ADR-016 — Contratação por necessidade, reserva protegida e referência comercial

Estado: decisão v5 refinada pelo ADR-017. A segregação e o adaptador de referência permanecem; a prioridade de recomposição e a sequência de abertura foram corrigidas.

O [24](24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md) especifica a próxima bancada: contratação por necessidade mensurável, rotação entre ofertas equivalentes e separação de CORE_RESERVE/WORKING dentro de TU. A reserva protegida não financia expansão normal. Os testes do 23 são da v4 e não validam essa mudança.

Para comércio, selecionar x402 batch-settlement/EVM, Base Sepolia e USDC de teste como referência de qualificação. Isso encerra a comparação aberta para iniciar B045, sem aprovar contrato/deployment, facilitador ou operação com valor real. Depósito não utilizado e cobrança contestada têm tratamentos distintos. Falha de qualificação exige nova decisão explícita, preservando cooperação sem compradores.

## ADR-017 — Piso operacional, equilíbrio recorrente e abertura por modalidade

Problema concreto: repor primeiro CORE_RESERVE pode deixar WORKING sem fundos para o próximo lease essencial. Escolha: consumo recompõe piso operacional, reserva protegida e restante do alvo normal, depois queima. Piso deriva das renovações e do atraso de liquidação; alvo operacional nunca fica abaixo dele. Expansão exige preservação do piso, reserva recomposta, demanda, rota completa e custeio.

O [24](24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md) consolida a regra vigente. Bootstrap não recebe saldo sintético de fundador. Aprovação econômica exige fase madura sem emissão ordinária ou aporte extraordinário, além de conservação e acesso por modelo/coorte. Crédito mútuo com dívida e expiração compulsória ficam fora do piloto; não resolvem os problemas físicos identificados.

x402 é um adaptador comercial opcional, não condição do TU ou da primeira bancada privada. Um vendedor responde pela rota completa e financia subcontratos; divisão atômica entre redes não foi prometida. Desenho do adaptador precede escrow e disputa; qualificação completa vem depois deles. As [19 referências v6](evidence/v6-policy-reference-checks.json) conferem apenas aritmética e condições limitadas. Consequência: nenhuma abertura ou tarifa pública está aprovada pela revisão documental.
