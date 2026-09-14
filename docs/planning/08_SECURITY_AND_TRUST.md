# Segurança e confiança

## Garantias oferecidas

O sistema protege acesso, limita recursos, verifica integridade de artefatos e mantém trilhas de contabilização. **Não oferece confidencialidade perante o administrador de uma GPU comunitária**, nem prova universal de inferência correta. Particionar um modelo pode dificultar algumas observações, mas ativações podem revelar conteúdo; não tratar divisão de camadas como criptografia de dados.

Usar OWASP ASVS 5.0 como base de verificação do controle/web/API e um modelo específico para host não confiável, supply chain e agente. ASVS não certifica correção numérica nem protege o operador contra si mesmo. [ASVS](https://owasp.org/www-project-application-security-verification-standard/).

## Políticas de confiança

| Política | Quem executa | Exposição e garantia | Condição de admissão |
|---|---|---|---|
| COMMUNITY | Participantes não previamente confiáveis | Operador do host e endpoints que terminam TLS podem observar dados; resultado sujeito a verificação probabilística | Consentimento explícito antes do envio, limites conservadores e sem segredos por padrão |
| AUTHORIZED_GROUP | Membros aprovados por grupo | Confiança organizacional/pessoal; não existe proteção técnica completa contra administrador | Membership, políticas de retenção e região, revogação e auditoria |
| PRIVATE_LOCAL | Máquina do usuário ou infraestrutura sob seu controle | Conteúdo permanece no domínio escolhido, salvo integrações autorizadas | Nenhum fallback público automático; política local de ferramentas |
| CONFIDENTIAL_VERIFIED | Hardware/software com atestação qualificada | Garantia depende da TCB, attestation, canal e limitações da plataforma | Evidência fresca, CPU/GPU suportadas, runtime medido e chave vinculada ao canal |

O último modo fica desabilitado até haver demonstração completa. Verificar cadeia NVIDIA/CPU, nonce, medidas de software, digest do modelo/configuração, configuração do driver, modo confidencial, revogação e vínculo da chave de sessão. Uma atestação de GPU sem proteção do gateway/CPU que recebe o prompt não produz confidencialidade ponta a ponta. [NVIDIA Trusted Computing](https://docs.nvidia.com/nvtrust/index.html).

## Ativos e adversários

Ativos: prompts, código, respostas, chaves de conta/nó/publicador/carteira, fundos em escrow, orçamento de GPU, rede/SSD, estado, ledger e reputação. Adversários incluem consumidor abusivo, contributor/publicador hostil, relay/indexador/gateway malicioso, coordenador comprometido, árbitros coniventes e conteúdo que injeta instruções. Na rede aberta do [18](18_OPEN_NETWORK_AND_COMPUTE_MARKET.md), aprovação de publicador/runtime é escolha de cada nó/pool, não autoridade global sobre modelos.

O modelo inclui colaboração entre adversários e identidades duplicadas. Não pressupõe que uma chave criptográfica corresponda a uma pessoa, uma GPU ou um domínio independente de falha.

## Matriz de ameaças e controles

| ID | Origem e ataque | Controle preventivo/detectivo | Risco residual e teste |
|---|---|---|---|
| S01 | Nó/gateway rouba prompt ou código | Política visível, minimização, grupos autorizados/local, sem logs de conteúdo | Host comunitário continua capaz; testar inspeção no host e documentar exposição |
| S02 | Nó altera ativações/logits/resposta | Frames autenticados; paridade de referência, replicação seletiva e quarentena | Nó assina dado falso validamente; injetar corrupção e desvios numéricos |
| S03 | Contributor falsifica presença/readiness | Leases, probes da engine, prazos e classificação observada | Pode reconhecer/terceirizar desafios; testar daemon online sem modelo |
| S04 | Fraude de crédito por múltiplos nós na mesma GPU | Budget por identidade/cluster, testes simultâneos, correlação e progressão de limites | UUID/IP não provam unicidade; simular Sybil e reserva cruzada |
| S05 | Replay de sessão/recibo/cobrança | Capability por peer/attempt/epoch; nonce, sequência e constraints de idempotência | Duplicação física de compute pode ocorrer; ledger deve manter efeito único |
| S06 | Peso/tokenizer/model code malicioso | Registro aberto separado de confiança; publicadores/runtimes escolhidos pelo nó, hashes, revisão e isolamento | Parser/kernel pode ter falha; publicar não autoriza execução automática |
| S07 | Update malicioso ou rollback para versão vulnerável | Assinaturas, anti-rollback, root offline e release gradual | Chave de release comprometida exige revogação/recovery; ensaio de comprometimento |
| S08 | Consumidor esgota VRAM/CPU/rede | Limites no ingresso e no nó, prefill chunked, batch/context cap, filas bounded | Driver pode travar; testar OOM, geração longa e clientes lentos |
| S09 | Relay vira proxy aberto/amplificador | Reserva autenticada, peers vinculados, quotas de bytes/conexões, sem destinos arbitrários | Metadados de tráfego visíveis; testar flood e peer não autorizado |
| S10 | Worker ganha privilégios do host | UID isolado, filesystem mínimo, sem Docker socket/privileged, sem código do consumidor | Driver/GPU têm superfície de ataque; testar escapes conhecidos da configuração concreta |
| S11 | Cache/VRAM vaza entre sessões | Prefix cache por tenant, IDs não adivinháveis, reset/zero quando aplicável e reciclagem de processo | Administrador pode inspecionar memória; teste A escreve canário, B não o obtém |
| S12 | Backend comprometido inventa saldo/autorizações | TU exige orçamento/hold confirmado no registro de serviço; dinheiro exige fundos finais/escrow; projeções locais conciliadas | Consenso não prova recurso físico; conluio de verificadores/validadores e governança exigem testes |
| S13 | Administrador edita journal/apaga evidências | Journal append-only para app, WAL/backups, export assinado fora do domínio e registro de mudanças | Superuser DB pode adulterar: imutabilidade lógica não é prova absoluta; simular restore/adulteração |
| S14 | Prompt injection manda agente exfiltrar/executar | Executor local com políticas fora do modelo, rede/terminal restritos, confirmação de ações sensíveis | Filtro de texto não elimina injection; testar README, tool output e páginas maliciosas |
| S15 | Conta/API key roubada consome saldo | MFA/passkeys para administração, sessões curtas, API keys com escopo/hash e quotas | Consumo até revogação/limite é possível; testar revogação e acesso cruzado |
| S16 | Publicação multimodal faz SSRF/decompression bomb | Fetcher restrito, limites de pixels/frames/bytes, sem URLs privadas e redirect revalidado | Decoders têm bugs; mídia adversarial e metadados de cloud |
| S17 | Coordenadores concorrentes duplicam atribuições | Owner lease e fencing persistidos em PG; versão de recurso no Prepare | Rede particionada pode atrasar revogação; teste split-brain e epoch velho |
| S18 | Nós/validadores coniventes constroem reputação falsa | Verificadores independentes, amostragem sigilosa, diversidade de operadores e limites de exposição | Reputação não elimina conluio; medir custo/probabilidade da fraude |

## Superfície exposta das engines

Não publicar diretamente RPCs de torch.distributed, Ray, NCCL, Petals ou ggml-rpc na internet. O daemon expõe somente operações tipadas e autorizadas; a engine roda em rede local/namespace privado. Proibir qualquer contrato equivalente a `execute(method, arbitrary_args)` ou desserialização de objetos Python.

A documentação vLLM descreve endpoints operacionais e caminhos que não compartilham toda a proteção de `--api-key`. Usar proxy/guard com allowlist, desabilitar modo de desenvolvimento, dynamic LoRA e servidores de ferramentas. O RPC llama.cpp é explicitamente apresentado como frágil/inseguro para rede aberta. [vLLM security](https://docs.vllm.ai/en/latest/usage/security/), [llama.cpp RPC](https://github.com/ggml-org/llama.cpp/blob/master/tools/rpc/README.md).

O worker aceita configuração aprovada, contexto/tokens e operações limitadas de load/prefill/decode/cancel. Não recebe comandos shell, módulos, URLs de plugins, pickle, `torch.load` arbitrário ou código de treinamento. Não executar funções de ferramenta no contributor, mesmo que a engine ofereça esse recurso.

## Identidades, chaves e revogação

Separar credencial da conta, identidade do daemon, assinatura de sessão, assinatura de artefato e assinatura de atualização. Chaves privadas do nó ficam no mecanismo de proteção do SO, sem sair nos logs. Identidade por Ed25519 é uma proposta; algoritmo e encoding precisam de vetores e bibliotecas consolidadas, nunca criptografia própria.

Autenticar o canal, além da mensagem: capability destinada a um PeerId exige posse da chave desse peer e associação à identidade admitida. Emitir certificados/tokens de escopo mínimo e prazos curtos. Rotação planejada usa prova de posse da chave antiga/nova e janela de convivência; chave perdida exige recuperação da conta e requalificação do nó.

Distribuir keysets/revogações versionados, assinados e com prazo. Sessões em partição só podem continuar até seu deadline já autorizado; revogação instantânea global não é garantida. Em incidentes críticos, gateway/control deixam de admitir, relays bloqueiam o peer e nós conectados cancelam. TTL limita o risco dos nós desconectados.

Atualizações seguem modelo TUF: root protegida, papéis de targets/snapshot/timestamp, expiração, anti-rollback e revogação. Versão recuperável anterior não pode estar revogada por vulnerabilidade crítica. A distribuição de um manifesto validamente assinado também precisa passar pelo estado atual de autorização do publicador. [TUF specification](https://theupdateframework.github.io/specification/latest/).

## Isolamento do host e dados

Daemon não recebe acesso geral a arquivos do usuário; guarda artefatos, identidade e logs em diretórios próprios. Supervisor inicia imagens allowlisted com filesystem read-only, diretório temporário limitado, usuário sem privilégio e devices mínimos. Não montar o home, chaves SSH, Docker socket ou rede interna inteira no worker. Privilégios de instalação e eventual controle de potência ficam em helper mínimo, fora do processo de inferência.

CUDA e containers não fornecem isolamento perfeito de frações de GPU de consumo. Validar suporte real a limites e limpeza; diante de estado corrompido, reciclar processo e requalificar. Quando não houver isolamento multitenant suficiente, servir um tenant por processo/slot e aplicar política mais restrita. Esse limite reduz utilização e deve entrar no custo.

Tráfego usa TLS/QUIC autenticado; relay encaminha bytes cifrados entre endpoints sempre que o desenho permitir. Gateway que termina TLS permanece na fronteira de conteúdo. Tokenizers/templates e código de integração fazem parte da TCB. Não enviar segredos em URL, headers de tracing, exceções, nomes de métricas ou logs de benchmark.

## Validação probabilística e custo

Na cooperação do [20](20_COOPERATIVE_ECONOMY_AND_ELASTIC_LIMITS.md), ausência de compradores não é falha nem dispensa verificação. Limitar emissão comprometida, grants e reservas por capacidade útil; registros financeiros não servem como prova de contribuição. Testar autochamadas que tentam manipular a previsão e identidades que tentam multiplicar cotas. Perda de telemetria/quorum nunca deve parecer folga e aumentar limites.

Usar três fontes: tarefas sintéticas de referência, replicação seletiva de sessões autorizadas e testes direcionados após anomalias. Começar no piloto comunitário com hipótese de 1% de replicação integral, além do budget de até 1% de probes. O custo pode exceder 2% total por diferenças de hardware, retries e tráfego: medir custo, não só contagem de tarefas.

Só replicar conteúdo em workers cuja confiança/região já foi autorizada pelo consumidor. Um verificador externo gratuito não ganha direito de ver prompts privados. Preferir blocos/tarefas sintéticas quando não houver autorização para duplicar a sessão real.

Normalizar checkpoint, dtype, seed, ordem, batching e tolerância antes da comparação. Uma saída amostrada diferente, diferença pequena de logits ou erro de template não basta para classificar fraude. Quarentena pode reduzir exposição enquanto se investiga; confisco retroativo de todo saldo não é mecanismo automático. Registrar causa, evidências, revisão e reteste.

## Agente de programação no consumidor

| Permissão | Default | Ampliação |
|---|---|---|
| Ler arquivos | Somente workspace selecionado; respeitar exclusões e symlinks | Diretórios extras escolhidos pelo consumidor |
| Editar | Produzir diffs no workspace; manter recuperação | Aplicação conforme política do usuário, sem sobrescrever mudanças externas |
| Terminal/testes | Sandbox local, timeout, quota e cwd restrito | Executores adicionais explícitos; comandos são código não confiável |
| Rede | Negada ou allowlist por integração | Destinos/credenciais mínimos; bloquear metadata/LAN se fora do escopo |
| Ações destrutivas | Exigem autorização específica e resultado revisável | Nenhuma autorização derivada de conteúdo do repositório/modelo |
| Publicar/push/deploy | Desabilitado por padrão | Consentimento do consumidor e credencial de escopo mínimo |

Excluir por padrão `.env`, chaves privadas, credenciais de cloud, cookies, bancos locais, histórico de shell e arquivos fora da seleção. Mostrar quais arquivos/trechos serão enviados e para qual trust policy. Filtragem é imperfeita; contexto de código também pode ser confidencial sem conter segredo reconhecível.

Tool calls devem seguir schema, ter IDs estáveis, auditoria local e controle de reexecução. Retentativa de modelo não repete ferramenta executada. Saída de terminal, documentação, tickets e páginas são dados de baixa confiança; não podem mudar permissões, modelo, destino ou teto financeiro. O executor valida ações independentemente da justificativa textual do modelo. [OWASP Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/).

## Retenção e resposta a incidentes

Prompts/código não são registrados por padrão. Histórico opcional precisa de consentimento, proteção, exportação e exclusão; preservar thinking history exigida por um modelo não implica logá-la centralmente. Recibos guardam IDs pseudônimos, contadores, timestamps, versão da regra e digests/HMACs com propósito definido. Evitar hash simples de prompt curto, que permite teste por dicionário.

Piloto: logs operacionais 14 dias; rastros amostrados 7 dias; evidências de disputa 90 dias com acesso restrito. Ledger mantém histórico imutável conforme política de retenção aprovada e sem conteúdo das sessões; desvincular dados pessoais quando aplicável. Prazos finais dependem de jurisdição/obrigações da operação, não de conveniência técnica.

Incidente de modelo/engine: o operador retira a configuração de seu catálogo qualificado, impede novos loads/Starts locais e publica alerta assinado; não controla a existência de anúncios em todos os peers. Drenar/cancelar conforme contrato, preservar evidência e revalidar. Chaves comprometidas exigem rotação; ledger local exige reconciliação com fundos/contratos finalizados. Não confiscar fundos de outros operadores por decisão do gateway. Ver [11](11_OPERATIONS_AND_ECONOMICS.md).

O EP10 acrescenta gasto duplo entre gateways, replay entre redes/contratos, recibo forjado, cliente que recusa assinar, reorg/finalidade, saída independente, eclipsing/Sybil em descoberta e indevida aprovação de runtime. Não publicar prompts nem hashes simples de conteúdo curto na cadeia. Assinatura tipada, depósito e reputação não provam inferência correta por si; a oferta identifica confiança, árbitro e perda máxima.

Gate público: todos os ataques S01–S18 possuem teste/revisão de controle e risco residual registrado; nenhuma vulnerabilidade crítica explorável permanece aberta; correção numérica e mecanismos econômicos passam seus gates próprios. Não usar “ASVS aprovado” como substituto dessa cobertura.

## Decisão de atestação e exposição da revisão 4

No pool cooperativo de referência, o [22](22_POLICY_CLOSURE_AND_CONTINUITY.md) exige duas atestações concordantes entre três verificadores de operadores distintos, excluindo vínculos declarados com o provedor. Novo participante começa com alocação pequena, recibos pendentes por 24 horas e revisão; completar sete dias não amplia orçamento automaticamente. Todos os novos participantes compartilham teto de 5%; perfil não comprovado tem limite de emissão de 1%; limites sobrepostos não se somam.

Publicar evidências, conflito, decisão e recurso em sete dias. Suspeita suspende novas atribuições do perfil; não confisca todo o saldo. Conluio de operadores maduros continua podendo comprometer a veracidade física. O simulador assume detecção zero num cenário e só verifica o envelope de emissão, sem alegar detector implementado ou proteção absoluta contra Sybil.
