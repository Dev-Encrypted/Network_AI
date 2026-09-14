# Visão de produto

NETWORK AI será uma **rede cooperativa aberta de inferência, com mercado adicional**. Participantes criam nós, publicam modelos, contribuem e ganham TU para usar outras ofertas, mesmo com zero compradores em dinheiro. Vendas geram saldo financeiro separado. Criar nó ou hospedar arquivos não basta para ganhar: a contribuição precisa estar contratada, pronta e verificada. A economia vigente está no [20](20_COOPERATIVE_ECONOMY_AND_ELASTIC_LIMITS.md); a abertura do protocolo, no [18](18_OPEN_NETWORK_AND_COMPUTE_MARKET.md).

A **reserva contratada, carregada, validada e pronta** gera TU pelo tempo verificado, dentro do orçamento de emissão baseado em capacidade. A modalidade comercial recebe pagamentos por recursos contratados. Não remunerar duas vezes o mesmo intervalo. Menor demanda total permite ampliar quota/concorrência; preço, contexto, carteira e termos aceitos permanecem explícitos.

O produto executa inferência: chat, streaming, chamadas de ferramentas e pedidos de agentes. Não organiza treinamento, fine-tuning, mineração ou execução de programas arbitrários enviados aos participantes. A ambição inclui modelos maiores que a memória de uma máquina individual; provar esse caminho é requisito da Fase 0, antes de investir em uma experiência completa.

## Resultado esperado

Um participante com GPU de 24 GiB configura seu limite, aceita uma atribuição e vê qual capacidade está reservada, quanto tempo foi reconhecido e os TU correspondentes. Ele usa seus ganhos em outro modelo disponível na rede. O sistema apresenta a configuração escolhida, disponibilidade e custo; não troca silenciosamente o modelo.

Esse exemplo não restringe a frota. GPUs de diferentes capacidades, fabricantes e gerações e múltiplos modelos são requisitos estruturais; qualificação por combinação e cenários de recusa/recuperação estão no [15](15_HETEROGENEOUS_HARDWARE_AND_CATALOG.md).

“Parte da GPU” significa orçamento de recursos aplicado pelo daemon e pela engine. Em GPUs de consumo isso não equivale a uma partição física isolada, nem garante execução simultânea de jogos sem impacto. Um limite baixo pode impedir o carregamento do modelo atribuído. A interface explicará esse resultado, sem contar arquivos em SSD como capacidade pronta.

## Públicos e jornadas

| Público | Necessidade | Entrega verificável |
|---|---|---|
| Contribuidor individual | Aproveitar ociosidade sem perder controle do computador | Limites, pausa imediata, atribuição visível e recibos explicáveis |
| Pequeno grupo autorizado | Compartilhar GPUs e modelos entre membros conhecidos | Admissão explícita, políticas de dados, cotas e auditoria do grupo |
| Desenvolvedor consumidor | Usar APIs e modelos maiores | Modelo fixo, streaming, cancelamento e estimativa/reserva de crédito |
| Usuário de agente | Executar ferramentas sobre seu próprio projeto | Ferramentas locais, permissões por ação, revisão de mudanças e orçamento |
| Operador de pool/gateway | Equilibrar cobertura, demanda, créditos, pagamentos e custo | Catálogo próprio, orçamento cooperativo de capacidade, fundos comerciais separados, incidentes e conciliação |
| Publicador comunitário | Hospedar e oferecer um modelo escolhido | Manifesto aberto, runtime aceito pelo dono do nó, termos e evidências, sem aprovação global |
| Comprador de API | Encontrar oferta comparável mais barata | Preço total, qualidade/configuração, prazo, confiança e liquidação verificável |

## Escopo das experiências

**Chat e API.** Catálogo mostra revisão/configuração, modalidade habilitada, contexto operacional, modo A/B/C, confiança, região elegível, fila e tarifa vigente. A tela distingue indisponível de disponível com espera. O usuário autoriza um teto de gasto; a reserva não é cobrança definitiva. Histórico persistente é opcional e deve informar local de armazenamento e retenção.

**Contribuição.** CLI primeiro; desktop Tauri depois. Configura VRAM, limite de potência quando suportado, horários, upload/download, SSD e reserva para outras aplicações. Exibe classificação observada, motivo de não elegibilidade, validade da atribuição e janela contabilizada. Energia é controle opcional dependente de driver/privilégio: sua ausência não será escondida como configuração aplicada.

**Pausa e interrupções.** Pausa imediata bloqueia novos pedidos e interrompe o trabalho local; não espera a conclusão de uma sessão. Uma opção separada, “encerrar após as sessões atuais”, faz drenagem até prazo curto. Suspensão, reinicialização, perda de internet e fechamento inesperado são falhas abruptas recuperáveis pela rede. Não aplicar multa automática por uma falha legítima.

**Agente de programação.** O modelo propõe ações, mas o executor é do consumidor. Leitura, edição, terminal, testes, rede e ações destrutivas têm permissões distintas. Contexto enviado é selecionado e inspecionável. Filtragem de segredos reduz exposição, sem garantir que nenhum dado confidencial passe. Detalhes em [08](08_SECURITY_AND_TRUST.md).

## Hipóteses reversíveis

| ID | Hipótese inicial | Consequência | Revisão |
|---|---|---|---|
| H01 | Operadores independentes, ofertas abertas e liquidação verificável | Nenhum gateway/indexador obrigatório; banco local não cria saldo global | Demonstrar troca de operador e ausência do servidor original antes de abertura |
| H02 | Linux x86-64, NVIDIA RTX 3090/4090 de 24 GiB como bancada inicial | AMD, Apple e Windows não recebem selo de equivalência | Matriz de driver/engine e testes por plataforma |
| H03 | Dois locais privados com conectividade controlada no piloto | Menor exposição a fraude e vazamento | Admissão pública após gates de segurança e economia |
| H04 | TU cooperativo e saldo financeiro separados | Cooperação sem compradores; somente pagamento comercial tem retirada no ativo recebido | Validar registro cooperativo independente e integração comercial sem conversão automática |
| H05 | Qwen3-8B BF16 é candidato de integração A; Petals é referência experimental C | Uma engine de serviço inicialmente; pesquisa distribuída isolada | Substituir candidato se os testes objetivos falharem |
| H06 | Contexto inicial de 8.192 tokens totais e uma sessão por worker A da bancada | Mantém orçamento de memória conservador | Aumentar somente com medições e nova configuração de catálogo |
| H07 | Sem equipe, orçamento e frota confirmados | Roteiro por dependências, sem datas artificiais | Estimar esforço após a Fase 0 e inventário real |
| H08 | Criar nó é aberto; ganho exige reserva útil aceita | READY cooperativo pode gerar TU sem vendas; registro sozinho não gera | Orçamento por capacidade/exposição e limites elásticos por demanda total |

Qwen3-8B tem pesos publicados e licença Apache-2.0; a escolha é uma decisão de integração, não uma alegação de liderança em qualidade. [Model card oficial](https://huggingface.co/Qwen/Qwen3-8B).

## Invariantes de produto

1. Saldo comum não torna modelos, precisões, revisões ou grupos de confiança intercambiáveis.
2. Tempo remunerado exige capacidade solicitada, reservada e verificada; nenhum pagamento por VRAM autodeclarada.
3. Capacidade total, velocidade de uma sessão e throughput agregado são métricas diferentes.
4. Registro aberto aceita publicadores independentes; catálogo qualificado identifica avaliador, evidência e condições. Publicação sozinha não comprova disponibilidade.
5. Rede comunitária não oferece confidencialidade perante o administrador da GPU. O modo de confiança precisa ser escolhido antes de enviar conteúdo.
6. Créditos não armazenam computação ociosa e não garantem cota ilimitada em horários de pico.
7. Nenhum benchmark de terceiros será apresentado como medição da NETWORK AI.

## Classificação de maturidade

Usar a mesma taxonomia em todos os documentos:

| Classe | Significado | Exemplos |
|---|---|---|
| A — componente existente | Há implementação reutilizável, ainda exigindo configuração e validação local | Execução completa em vLLM; PostgreSQL; armazenamento S3 |
| B — engenharia de integração | Contrato e comportamento podem ser implementados com técnicas conhecidas | Daemon, autorização por sessão, scheduler, ledger e catálogo |
| C — pesquisa/validação experimental | Viabilidade, custo ou desempenho ainda não estão demonstrados para o alvo | K3 em participantes de 24 GiB pela internet; migração de estados híbridos; defesa forte contra nós coniventes |

Essa taxonomia não corresponde aos nomes dos modos de execução A/B/C. A classe de maturidade sempre aparece por extenso para evitar ambiguidade.

No backlog, E identifica engenharia previsível, I destaca a integração/compatibilidade de componentes existentes e R identifica pesquisa. São rótulos de tipo de tarefa, não modos de execução nem certificação de prontidão.

## Sucesso e critérios de revisão

O primeiro sucesso técnico é executar e comparar uma sessão distribuída de referência, medir o custo de comunicação e determinar o encaixe dos componentes Kimi. O primeiro sucesso de produto é uma rede privada que abre uma sessão, reserva saldo de teste, transmite a resposta, cancela e concilia sem divergência.

Avançar à comunidade pública somente se houver previsibilidade mínima de disponibilidade, recuperação, custo e exposição de dados. Se a internet residencial não permitir K3 com interatividade aceitável, preservar a linha de pesquisa e considerar clusters participantes com interconexão adequada. Isso altera a composição da oferta; não comprova o modo distribuído residencial.

Ficam fora desta etapa naming definitivo, domínio, marca, identidade visual, landing page e código de produto. O pacote especifica o trabalho seguinte; nenhuma configuração está declarada como operacional na NETWORK AI.

## Contrato econômico da revisão 4

A experiência deve explicar quanto uma hora contratada de contribuição compra em cada modelo de referência, por que um nó pode estar elegível sem reserva remunerada, e qual a fonte do ganho: TU existentes ou emissão autorizada. Gastar TU pode financiar a próxima reserva útil sem virar dinheiro. O [22](22_POLICY_CLOSURE_AND_CONTINUITY.md) define a regra e os critérios de retomada; o [23](23_INTEGRATED_ECONOMY_SIMULATIONS.md) registra também as condições em que a cooperação falhou no modelo fictício.

Pouca demanda amplia limites apenas onde existem recursos compatíveis e saldo. Catálogo aberto não equivale a todos os modelos carregados ou licenciados para qualquer uso. Decisões de planejamento estão fechadas; a configuração econômica ensaiada ainda não serve de promessa pública.
