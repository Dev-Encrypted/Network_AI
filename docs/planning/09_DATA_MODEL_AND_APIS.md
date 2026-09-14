# Dados, contratos e interfaces

## Convenções

O modelo relacional descreve **um operador**, não um banco global da rede. O [18](18_OPEN_NETWORK_AND_COMPUTE_MARKET.md) acrescenta identidade aberta, ofertas independentes, depósito e liquidação verificável. O [20](20_COOPERATIVE_ECONOMY_AND_ELASTIC_LIMITS.md) acrescenta registro cooperativo de TU independente dos pagamentos. Sem servidor da empresa, outros operadores devem verificar autorizações de serviço e, quando aplicável, fundos financeiros. Dados locais não criam saldo global.

Especificação de referência, ainda sem migrations ou servidor implementados. IDs de entidades são UUIDs; identidades de conteúdo são SHA-256; revisão upstream é o commit completo. Timestamps locais são `timestamptz` de observação. Transições consensuais usam altura e tempo de bloco aceitos pelo protocolo; nunca o relógio local do banco como decisão global. Quantidades de bytes/créditos usam `bigint`, com checks de não negatividade e limites; APIs JSON serializam esses inteiros como strings decimais.

O crédito cooperativo usa `coop_network_id` e unidade `TU`, com 1.000.000 microTU por TU. Campos de serviço adotam sufixo `microtu`; pagamentos usam `payment_unit_id` e sufixo `payment_atomic`, sem conversão ou soma entre unidades; contadores `prompt_tokens`, `completion_tokens` e `max_output_tokens` continuam representando tokens processados pelo modelo. Credenciais de autenticação e capabilities também não são TU. O [16](16_TOKEN_ECONOMY_AND_FAIR_DISTRIBUTION.md) define essa distinção e a política econômica.

IDs e assinatura não conferem autorização por si. Todo acesso é filtrado por conta/tenant/grupo e ação. Chaves de API são armazenadas por hash forte e prefixo identificador; o segredo é mostrado somente na criação. IP, UUID de GPU e serial observado são atributos auxiliares de risco, não identidade física autoritativa.

## Modelo relacional inicial

| Entidade | Campos/chaves essenciais | Restrições, índices e relações |
|---|---|---|
| accounts | id PK, status, created_at, policy_version | Status enum; índice status; pseudônimo separado de PII |
| account_identities | id PK, account_id FK, issuer, subject | UNIQUE(issuer,subject); não confiar só em email |
| api_keys | id PK, account_id FK, key_hash, scopes, expires_at, revoked_at | UNIQUE(key_hash), índice account/status; escopos validados |
| trust_groups | id PK, owner_account_id FK, policy_version, region_policy | Política imutável por versão; não atualizar sessões antigas |
| trust_memberships | group_id FK, account/node_id FK, role, valid_range | Identidade de membro tipada e FK real; unicidade por período; índices group e membro |
| nodes | id PK, account_id FK, status, protocol_range, key_version | Índices owner/status; revogação separada de offline |
| node_keys | id PK, node_id FK, public_key, valid_from/to, revoked_at | UNIQUE(public_key); histórico de rotação; algoritmo allowlisted |
| resource_domains | id PK, node/cluster owner, observed_bytes, user_budget_bytes, version | Budget ≤capacidade observada validada; índice owner; lock/fencing nas reservas |
| resource_observations | id PK, domain_id FK, measured_at, observer, capabilities | Índice(domain,measured_at DESC); observações append-only com retenção |
| benchmark_runs | id PK, domain_id FK, fixture_digest, engine_digest, metrics, verifier | Reprodutibilidade e resultado aprovado separados; índice(domain,configuration,time) |
| hardware_profiles | id PK, vendor, architecture, memory_kind, properties, schema_version | Atributos observados; sem presumir unicidade física; unidades em bytes |
| runtime_qualifications | id PK, hardware_profile_id FK, configuration_digest FK, engine_digest, role, os_driver_digest, limits, benchmark_run_id FK, status, valid_until | Aprovação por tupla e limites; índice(config,status,valid_until); não herdar só por VRAM |
| topology_observations | id PK, source_domain_id FK, destination_domain_id FK, path_kind, observed_at, metrics | RTT/banda bidirecionais, correlações e validade; índice(source,destination,time) |
| models | id PK, upstream_namespace, name | UNIQUE(upstream_namespace,name); metadata de produto |
| model_revisions | id PK, model_id FK, upstream_commit, license_digest | UNIQUE(model_id,upstream_commit); sem overwrite |
| model_configurations | digest PK, revision_id FK, manifest_json, publisher_key_id, state | Digest recalculado; manifests imutáveis; state/policy em eventos separados |
| artifacts | sha256 PK, bytes, format, provenance_id | bytes >0; mirrors em tabela separada; tamanho/hash não alteráveis |
| components | id PK, configuration_digest FK, component_key, abi, memory_profile | UNIQUE(configuration,component_key); tipos e limites de perfil validados |
| component_artifacts | component_id FK, artifact_sha256 FK, tensor/range map | PK composta; intervalos dentro do arquivo; dependências acíclicas verificadas |
| serving_groups | id PK, configuration_digest FK, trust_policy_id/version, region, limits | Chave lógica única por config/policy/topologia; índice state/model |
| assignments | id PK, node_id FK, group_id FK, state, owner_epoch, starts_at, expires_at, rate_card_id, reward_mode | Prazo válido; exatamente um orçamento cooperativo ou financeiro tipado; índice(node,state), (group,state,expires_at) |
| assignment_components | assignment_id FK, component_id FK | Componentes pertencem à configuração do assignment; PK composta |
| resource_allocations | id PK, domain_id FK, assignment_id FK, bytes, compute_budget, valid_range | Reserva via lock/version do domínio; índices domain/expiry; sum validada transacionalmente |
| session_slots | id PK, assignment_id FK, slot_class, state_budget, version | Distingue pool prealocado de alocação dinâmica; lock ao reservar |
| economic_policies | id/version PK, unit, parameters, effective_at, approver, digest | Parâmetros tipados, imutáveis por versão; unidade TU; preços/contratos aceitos não reescritos |
| reference_baskets | id/version PK, configuration_weights, reference_rates, valid_from, reconciliation_ref | Configurações e cargas viáveis em conjunto; mudança não se confunde com reajuste da tarifa pública |
| capacity_snapshots | id PK, basket_version FK, measured_at, horizon, qualified_allocations_digest, conservative_capacity, uncertainty | Observação por grupo/horário/confiança; validade explícita; sem somar recurso duplicado |
| rate_cards | id/version PK, policy_version FK, kind, configuration/profile, integer_rates, denominator, effective_at, billing_mode, unit_ref | Capacity e consumption separados; microTU cooperativo ou payment_atomic comercial; unidade imutável; overflow checado |
| funding_budgets | id PK, payer_id, funding_position_id FK, scope/pool ou group_id FK, epoch, cap, committed, paid, version | cap≤fundos verificados do escopo; committed+paid≤cap; unicidade por escopo/época |
| funding_commitments | id PK, assignment_id ou grant_id FK, epoch, max_amount, paid, released, version | Fonte tipada única por época; paid+released≤max_amount; parcelas contabilizadas uma vez |
| grant_allocations | id PK, account_id FK, campaign_id, approval_epoch, amount, status, policy_version, billing_mode | FK tipado para compromisso de emissão OU fundo de patrocinador; limites próprios, exatamente uma fonte; sem ganho por replay/cadastro |
| coop_networks | id PK, policy_digest, register_descriptor, validator_policy, finality_rules, precision | Namespace de TU; não identifica ativo financeiro; governança/consenso escolhidos e versionados |
| issuance_budgets | id PK, coop_network_id FK, epoch, scope, capacity_snapshot_id FK, cap_microtu, committed_microtu, issued_microtu, version | Exposição S+L+J e limites de grupo/época; não exige depósito; deduplicação hierárquica |
| issuance_commitments | id PK, assignment_id/grant_id/treasury_topup_id tipado, budget_id FK, epoch, max_microtu, issued_microtu, released_microtu | Uma referência válida por tipo; issued+released≤max; mover L→S não soma exposição novamente |
| continuity_accounts | PK(coop_network_id,compartment), available_microtu, held_microtu, floor_microtu, target_microtu, target_policy_ref | CORE_RESERVE ou WORKING conforme 24; piso de WORKING≤alvo; alvos sobre saldo livre, holds indisponíveis; ambas em S; agregado sem lançamentos |
| capacity_funding_plans | id/version PK, coop_network_id FK, essential_routes_digest, normal_routes_digest, interval_costs, already_funded_refs, settlement_delay_bound, floor_horizon, coverage_horizon, evidence_refs | Plano aprovado e versionado; não duplicar obrigações cobertas; piso ajustado ao atraso; rotas completas; verificar alvos e liquidez frente a S/L/J e C_ref antes da abertura |
| continuity_commitments | id PK, assignment_id FK, account_ref/compartment FK, epoch, held_microtu, paid_microtu, released_microtu, incident_ref opcional | TU retidos antes do aceite; não somar em L; paid+released≤held; uso de CORE_RESERVE exige contingência elegível |
| reward_funding_parts | receipt_id FK, source_kind, source_commitment_id, microtu | Emissão, continuidade ou financeiro tipados; soma≤tarifa×tempo; nenhuma dupla remuneração |
| cooperative_settlements | session_id/version, charged_microtu, working_floor_microtu, core_refill_microtu, working_extra_microtu, burned_microtu, funding_plan_ref, pre_balance_versions, refund_refs | charged=soma das quatro parcelas; recycled é derivado das três transferências; prioridade do 24 e valores não negativos; transação usa versões/saldos livres; estorno por origem; parcela não finalizada fica retida |
| governance_proposals | id PK, policy/type, author, notice_until_block_time, votes, earliest_effective_height, replay_digest | Regras 3/4 e aviso do 22; nenhuma chamada externa ou relógio local no estado consensual |
| attestation_decisions | receipt_id FK, attestors, operator_domains, nonce, outcome, appeal_ref | 2/3 operadores elegíveis; recibo novo pendente 24 h; revisão independente |
| approved_coop_refunds | id PK, original_tx_id FK, source_kind, source_account_ref, amount_microtu, status, approval_ref | J só contém reversão de queimados aprovada ainda não lançada; parcela existente fica retida em S; restituição única e limitada à origem |
| elastic_limit_snapshots | id PK, pool/group FK, policy_version, capacity_ref, regular_pressure, pending_queue, level, valid_until, reason | Efêmero/reconstruível; 1/2/4 ou bloqueio por segurança; não é carteira ou garantia de slot |
| commercial_holds | id PK, session_id FK, payment_unit_id FK, funding_position_id FK, amount_atomic, state, finality_ref | Exclusivo no registro financeiro; nenhuma apropriação implícita de TU |
| economic_decisions | id PK, policy/basket/snapshot refs, exposure, budget_refs, inputs_digest, action, reason, reviewer | Histórico auditável de compromissos/exceções; sem autoridade de saldo própria |
| contribution_receipts | id PK, assignment/epoch, window_index, duration_ms, verifier, status, rate_version | UNIQUE(assignment,epoch,window,rule_version); janela dentro do lease |
| quotes | id PK, account_id FK, configuration, request_fingerprint, rate_card_id FK, billing_mode, typed_max_cost, expires_at, limit_policy_version | Validade inicial 60 s; sem hold; aceite confere unidade, conteúdo, preço, classe extra/regular e prazo |
| sessions | id PK, account_id FK, group/config, request_fingerprint, execution_state, billing_state, billing_mode, typed_hold_ref, deadline, price_version, quote_id FK, admission_class | Índice(account,created_at), (execution_state,deadline); modelo, preço, unidade e prazo aceitos imutáveis |
| session_attempts | id PK, session_id FK, attempt_no, route_id, route_epoch, execution_state | UNIQUE(session,attempt_no); uma tentativa ativa autorizada por política |
| route_members | route_id/epoch, assignment_id/epoch, component, role, peer_key | PK composta; rota acíclica ou grafo previamente aprovado; grupos/leases compatíveis |
| session_slot_reservations | attempt_id FK, slot_id FK, token/state budget, expires_at | Unicidade de slot exclusivo; CAS/version; demais pools com débito atômico |
| session_authorizations | jti PK, attempt_id FK, signed_payload_digest, key_id, start_before, deadline, max_cost | Imutável; status de revogação separado; índice expiry |
| token_holds | id PK, session_id FK, coop_network_id FK, amount_microtu, consumed_microtu, released_microtu, finality_ref, status | UNIQUE(session_id); consumed+released≤amount; exclusão global finalizada antes de Start |
| ledger_accounts | id PK, owner/system_role, billing_mode, coop_network_id ou payment_unit_id FK, normal_side | Unidade tipada única; UNIQUE(owner,role,unit); sem saldo negativo em contas gastáveis; TU não balanceia dinheiro |
| ledger_transactions | id PK, kind, business_key, rule_version, reverses_id FK | UNIQUE(business_key); vínculo a evento/session/receipt |
| ledger_entries | tx_id FK, line_no, ledger_account_id FK, debit/credit, amount | PK(tx,line), amount>0; soma por tx/unidade verificada ao commit |
| balance_projections | ledger_account_id PK/FK, balance, last_tx_version | Atualização no mesmo commit do journal; reconstruível integralmente |
| usage_events | session/attempt/producer/event_seq, cumulative counters, observed_at, receipt_digest | UNIQUE(session,attempt,producer,seq); counters monotônicos; índice session/seq |
| settlement_records | id PK, session_id FK, version, evidence_digest, ledger_tx_id FK | UNIQUE(session,version); uma versão principal; ajustes separados |
| incidents | id PK, scope_type/id, severity, status, reason, evidence_ref | Índice(status,severity,created_at); evidência mínima com ACL |
| outbox_events | id PK, aggregate_id, aggregate_version, kind, payload, delivered_at | UNIQUE(aggregate,version,kind); índice parcial dos não entregues |
| revocations | id PK, target_type/id, epoch, effective_at, issuer, reason | Sequência monotônica por autoridade; distribuição assinada |
| peer_identities | public_key PK, transport_bindings, payment_bindings, seq, expiry, signature | Posse e domínio de assinatura; sem cadastro central obrigatório |
| signed_offers | digest PK, provider_key FK, config_digest, capabilities, accepted_billing_modes, typed_prices, fee_split, dispute_policy, expiry, signature | Preços por coop_network_id ou payment_unit_id; digest imutável; anúncio não comprova qualificação/disponibilidade |
| payment_units | id PK, network_id, contract/asset_id, atomic_scale, finality_policy | Escala do ativo explícita; sem paridade/conversão automática com TU; unidade na cotação |
| funding_positions | id PK, owner_key, payment_unit_id FK, contract/channel_id, confirmed, held, withdrawal_pending, finality_ref | Projeção de fundos externos; estados disjuntos; não autoriza gasto duplo |
| settlement_events | network/contract/tx/event_index PK, block_ref, finality_state, canonical, payload_digest | Replay e reorganização tratados antes de reconhecer fundos finais |
| signed_vouchers | channel_id/seq PK, payer/payee, max_amount, expiry, domain, signature | Canal/escrow segregado; nonce sozinho não impede gasto em outro canal |

Listas de FK polimórficas são implementadas por tabelas específicas ou checks que exijam exatamente um FK tipado; não usar `target_id` arbitrário como autorização. JSONB guarda métricas/configurações com schema conhecido, não substitui constraints de valores, identidade e saldo.

## Invariantes transacionais

1. Uma configuração só referencia componentes/artefatos compatíveis com sua revisão, quantização e ABI.
2. Reservar uma sessão exige saldo e slots; sem todos os Prepare confirmados, não emitir autorização de execução.
3. Reservas financeiras concorrentes bloqueiam/projetam a mesma conta em ordem determinística. SQL serializável pode abortar por conflito; retry com mesma business key é parte do contrato. [PostgreSQL](https://www.postgresql.org/docs/current/transaction-iso.html).
4. Débitos = créditos por transação/unidade. Aplicar procedure ou trigger diferido; CHECK de linha não valida agregado. Journal não permite UPDATE/DELETE pela role da aplicação.
5. Memória base da atribuição e pool KV prealocado são debitados uma vez do domínio. Slots de sessão consomem esse pool, sem debitá-lo novamente como VRAM adicional. Se a engine aloca dinamicamente, usar perfil diferente com reserva dinâmica explícita.
6. Somatório de allocations simultâneas ≤budget do resource domain. CHECK isolado não garante isso; usar lock do domínio e atualização versionada. Recursos exclusivos podem usar exclusão por range; recursos fracionáveis exigem soma sob lock.
7. Cancel/finish/timeout têm compare-and-set de estado e versão. Emissão/settlement têm chaves únicas; reenvio não produz saldo novo.
8. Capabilities não sobrevivem ao prazo/epoch/configuração em que foram emitidas. Chave antiga revogada não readmite um nó por heartbeat.
9. Lease cooperativo exige folga de emissão S+L+J contra capacidade conservadora; lease comercial exige fundos livres confirmados. Ambos respeitam grupo, épocas e recursos. Reservar por transição verificável global, sem duplicar reflexos hierárquicos; não depender de exclusão apenas no banco local.
10. Ganho cooperativo transfere TU retidos ou transforma L em S por emissão autorizada. Consumo divide-se atomicamente entre reserva e queima; estorno reverte cada fonte original, sem reemitir TU reciclados. Dinheiro é transferido, com holds/saques disjuntos e conservação por ativo. Uma cotação não reserva saldo/capacidade; nunca há fallback automático entre modos.
11. Grant cooperativo respeita estoque/campanha e grants_emitidos+pendentes≤floor(emissão_a_contribuidores/49); grant comercial respeita fundo disponível do patrocinador. Meia-noite não reaplica concessão. Não misturar coop_network_id e payment_unit_id.

12. Limite elástico usa capacidade real e política versionada; não se acumula nem autoriza aumentar contexto ou mudar preço. Fila concorrente bloqueia novos extras; contratos aceitos preservam prazo e teto. Ganho em TU não exige vendas, mas exige compromisso útil aceito e registro saudável.

Particionar `usage_events` e observações por tempo somente quando o volume justificar. Se usar particionamento, preservar a deduplicação global via inbox/registro de IDs não particionado ou chave contendo partição autenticada; UNIQUE local a uma partição não basta contra replay em outra. Não particionar o journal no piloto sem desenho que preserve seus invariantes.

Autoritativos: contas, memberships, modelos/configurações aprovadas, leases, budgets, sessões, holds, journal, recibos aceitos e incidentes. Efêmeros/reconstruíveis: presença Redis, rankings de scheduler, cache HTTP, métricas de GPU e traces. Telemetria perdida não altera saldos.

## Envelope interno e versionamento

Todos os contratos incluem `protocol_major/minor`, `message_id`, `correlation_id`, `sender_id`, `sent_at`, `expires_at` quando aplicável, `trace_id` opaco e payload tipado. Comandos de mutação incluem `idempotency_key`, `expected_version` e `epoch`. Evitar campos genéricos que aceitam chamadas remotas arbitrárias.

Autenticação de canal por mTLS/identidade P2P; capability vinculada ao destinatário e operação. Assinar mensagens relevantes com representação canônica estabelecida, nunca assinatura de JSON serializado de forma diferente entre linguagens. Rejeitar tamanhos/versionamento antes de alocar payload.

| Contrato | Emissor → receptor | Campos específicos | Resposta/efeito |
|---|---|---|---|
| RegisterNode | Daemon → controle | chave, nonce assinado, account enrollment token, versões, hardware report, limits | node_id, certificado/keyset, estado BENCHMARKING; sem lease automático |
| Heartbeat | Daemon → controle | boot_id, seq, assignments/epochs, saúde, free slots observados, transport status | ack, server time, revocation epoch, comandos pendentes; não gera crédito sozinho |
| AssignmentProposal | Coordenador escolhido → daemon | assignment/config/components, recurso exclusivo, prazo, reward_mode, tarifa, teto, policy, reward_funding_parts | Fontes tipadas e exclusivas por parcela; soma coberta; Accept/Reject com capabilities reais |
| AcceptAssignment | Daemon → controle | proposal digest, node key, accepted limits, resource version | Lease assinado; recurso só fica READY após load/probe |
| PublishCapacity | Daemon → controle | assignment/epoch, config, componentes, memória/slots e proof references | Capacidade observada; não publica diretamente catálogo |
| ModelManifest | Publicador → daemon | Campos completos do documento 05 | Aceitar assinatura/revisão/schema ou rejeitar; sem executar código embutido |
| PrepareSession | Controle → todos os membros | session/attempt, route/epoch, budgets, deadline, roles | prepare_id, slot token, expiry, state ABI; rejeição libera rota |
| CommitSession/Start | Controle/gateway → driver/nós | capability, prepare token, request digest, bytes de contexto autorizados | StartAccepted idempotente ou erro de scope/expiry |
| StreamEvent | Driver → gateway → consumidor | session/attempt, event_seq, token offset, delta/tool delta, finish_reason, counters | Ordem estável; event ID permite detectar duplicação |
| CancelSession | Consumidor/controle → driver/nós | session, expected epoch, cancel_id, reason, cutoff | CancelAccepted; CloseSession final; não implica settlement já concluído |
| CloseSession | Driver/medidor → controle | terminal reason, counters, last sequence, resource release, evidence digests | ReceiptAccepted; inicia reconciliação |
| ContributionReceipt | Verificadores contratados → registro escolhido | assignment/epoch/window, verified interval, reward_mode, funding_parts, rate_version, evidence digest, signatures | Pending/Accepted/Rejected; emissão/transferência tipadas e únicas; 2/3 e recurso do 22 |
| UsageReceipt | Gateway e worker → conciliador | producer/role, seq, cumulativos de tokens/estado, attempt, signature | Armazenar evidência; escolher medidor autorizado, não somar todos os peers |
| ReconcileSession | Worker de ledger → registro de serviço ou financeiro | sessão, modo/unidade, evidências, regra, expected hold version | Consumo/liberação/estorno na mesma unidade, com finalização verificável |
| RevokeAccess | Autoridade → gateways/nós/relays | alvo, epoch crescente, effective time, reason, assinatura | Bloqueia novos acessos; cancela ativos conectados; efeito offline limitado por TTL |

Recibos de várias camadas de uma sessão não multiplicam o número de tokens cobrado. A tarifa do modelo incorpora a rota; metering de camadas serve operação/validação. Duração de contribuição é apurada por lease, não por cada evento de token.

## Interface worker/engine

```text
DescribeCapabilities() -> versões, hardware, modelos, formatos, ABI, unidades mínimas
LoadAssignment(manifest, component_set, budget) -> loaded handles e memória observada
ValidateAssignment(challenge) -> prova e métricas
PrepareSession(plan) -> session handle, slots, state requirements
Prefill(handle, input, positions) -> eventos e estado
Decode(handle, token_step, input) -> logits/tokens conforme papel
Cancel(handle, cancel_id) -> accepted e terminal event
DrainAssignment(deadline) -> estado e sessões restantes
UnloadAssignment(lease_epoch) -> liberação confirmada
Snapshot/Restore(...) -> somente se feature explicitamente qualificada
```

VLLM A/B usa seu serving/runtime por bridge interno; a interface não exige acesso por camada que a engine não oferece. Stage executor C é uma implementação separada da mesma intenção de lifecycle, com contrato numérico específico. Plugin não pode buscar código remoto ou registrar rotas administrativas públicas.

## Contrato de tensores

Exemplo Protobuf de referência dentro da especificação, sem código de servidor gerado:

```proto
syntax = "proto3";
package networkai.tensor.v1;

enum TensorDType {
  TENSOR_DTYPE_UNSPECIFIED = 0;
  FP16 = 1;
  BF16 = 2;
  FP32 = 3;
  INT32 = 4;
}
message TensorHeader {
  string session_id = 1;
  string attempt_id = 2;
  uint64 route_epoch = 3;
  string configuration_digest = 4;
  string component_id = 5;
  string tensor_role = 6;
  uint64 step = 7;
  uint64 token_offset = 8;
  repeated uint64 shape = 9;
  TensorDType dtype = 10;
  uint64 byte_length = 11;
  string state_abi = 12;
  uint32 chunk_count = 13;
  bytes content_digest = 14;
}
message TensorChunk {
  string transfer_id = 1;
  uint32 index = 2;
  uint64 offset = 3;
  bytes payload = 4;
}
```

O framing acrescenta cabeçalho com tamanho máximo, versão do protocolo, destinatário autenticado e ID de transferência vinculado ao header. O manifesto define os `tensor_role` aceitos, shape/rank esperado, dtype, dependências e layout; não aceitar role inventado nem grafo computacional arbitrário.

Defaults do piloto: header ≤16 KiB; chunk ≤1 MiB; tensor individual ≤16 MiB; conjunto de tensores de uma etapa ≤64 MiB; até 32 MiB em voo por peer, com backpressure. Dimensões validadas antes da multiplicação; `product(shape) × sizeof(dtype)` usa aritmética checada, deve igualar byte_length e caber no budget. Limite lógico de prefill inicial B≤8, chunk T≤128; H vem da configuração, não do cliente. Se um conjunto AttnRes exceder o perfil, dividir pelo contrato do modelo ou rejeitar, não desabilitar o limite.

Formato inicial: bytes contíguos little-endian, row-major, sem strides/endereço/ponteiro do remetente. Dtypes comprimidos só entram com descriptor e kernel aprovados; nenhuma compressão de ativações no baseline. Duplicata de chunk deve ter mesmos bytes/digest; overlap conflitante, gap, excesso de chunks, EOF prematuro e dtype desconhecido são erros.

Transporte C: streams QUIC autenticados ou fallback de túnel qualificado. gRPC atende controle, não precisa carregar o tensor inteiro numa mensagem gigante. Medir cópias GPU→host→rede→host→GPU; não prometer zero-copy/RDMA por adotar QUIC. Integridade de frame detecta alteração em trânsito, não cálculo errado na origem. [libp2p QUIC](https://libp2p.io/docs/quic/).

## API HTTP pública

Interface única; proxy distribui rotas de controle ao NestJS e conteúdo/stream ao gateway. TLS obrigatório. API key com escopo ou sessão web segura com proteção CSRF nas mutações. CORS allowlisted, rate limits e autorização por objeto em todas as rotas.

| Método/rota | Semântica e resposta |
|---|---|
| GET `/v1/models` | Configurações operacionais visíveis para a identidade, trust policy, contexto, preço e status; candidatos ficam em API administrativa |
| POST `/v1/quotes` | Configuração, modo/unidade, rate card e teto tipados, validade 60 s; classe/prazo/limite visíveis; sem hold ou garantia de capacidade |
| POST `/v1/sessions` | Cria sessão nativa e hold, podendo iniciar execução após Prepare; `Idempotency-Key` obrigatório; 201/202 com status e URLs |
| GET `/v1/sessions/{id}` | Estado de execução e billing, modelo exato, counters e erro; sem prompt por padrão |
| GET `/v1/sessions/{id}/events` | SSE sequenciado, com janela de replay limitada e escopo da conta |
| POST `/v1/sessions/{id}/cancel` | Cancelamento idempotente, 202 até terminal confirmado; nunca exige repetir pagamento |
| POST `/v1/chat/completions` | Subconjunto compatível de geração síncrona/streaming; utiliza o mesmo fluxo interno de sessão/hold |
| GET `/v1/credits/balance` | Somente TU: coop_network_id, disponível, reservado, históricos e versão/finalidade |
| GET `/v1/payments/balance` | Saldo financeiro por payment_unit_id, disponível, escrow e retirada pendente; não soma TU |
| GET `/v1/limits` | Limite atual por grupo/modelo, razão, validade, fila e classe; informativo, admissão final verifica recursos |
| GET `/v1/credits/transactions` | Extrato paginado por cursor estável |
| GET `/v1/contributions` | Leases/recibos próprios com duração, tarifa e evidência de classificação |
| GET `/v1/cooperation/status` | Por modelo: estado, cobertura, S/L/J, reserva livre/retida/alvo, emissão suspensa e política; sem dados privados de participantes |
| GET `/v1/governance/proposals` | Propostas, operadores votantes, aviso, decisão e altura de ativação verificáveis |
| GET/PATCH `/v1/nodes/{id}/preferences` | Consultar/alterar limites e horários próprios; mudanças nunca burlam restrições do daemon |
| POST `/v1/nodes/{id}/pause` | Solicita pausa/drenagem quando conectado; ação local funciona mesmo sem controle |
| GET `/v1/incidents/{id}` | Detalhes autorizados de falha/disputa, sem expor dados de outros usuários |

A sessão nativa inclui `model_configuration`, `trust_policy`, `messages`, `max_output_tokens`, `billing_mode`, `quote_id` opcional, `queue_policy`, `admission_class` e `deadline_ms`. Alias deve ser resolvido e fixado antes do aceite; nunca substituir modelo/precisão silenciosamente.

| Modo | Campos de autorização | Recusa |
|---|---|---|
| `cooperative` | `coop_network_id`, `max_cost_microtu`, `cooperative_hold_id` na resposta e rate card | TU insuficiente não usa dinheiro; nenhuma obrigação de depósito financeiro |
| `commercial` | `payment_unit_id`, `max_payment_atomic`, `funding_authorization`, `payer_key`, oferta/taxas/disputa | Fundos insuficientes não usam TU; ativo e custos externos dentro do teto |

Exigir exatamente a variante correspondente; campos cruzados conflitantes retornam erro. Sem quote, cotar e reservar atomicamente dentro do teto explícito, fixando preço/classe/prazo. Novos extras usam duração máxima de 60 segundos no perfil do 20; saldo e slots continuam necessários.

Ofertas expõem `accepted_billing_modes` e preços tipados. GET/POST `/v1/offers` e importação de manifesto não exigem catálogo global aprovado. GET `/v1/models` identifica a qualificação do gateway escolhido. Publicação não implica emissão, execução universal ou suporte automático a modalidades.

Outras modalidades usam `capability_id`, schemas e unidades explícitas. Implementar adapters gradualmente. Como não existe API implantada, o contrato atual usa `microtu`; os nomes históricos `microcredits`/`microtokens` só podem ser importados com conversão de nomes documentada, sem converter dinheiro ou aceitar campos conflitantes. `max_output_tokens` continua sendo comprimento de geração.

Exemplo cooperativo ilustrativo, independente de compradores:

```json
{
  "session_id": "11111111-1111-4111-8111-111111111111",
  "execution_state": "PREPARING",
  "billing_state": "HELD",
  "billing_mode": "cooperative",
  "coop_network_id": "network-ai-lab",
  "cooperative_hold_id": "22222222-2222-4222-8222-222222222222",
  "reserved_microtu": "400000",
  "billing_unit": "TU",
  "microtu_per_unit": "1000000",
  "price_version": "planning-coop-v4",
  "limit_policy_version": "planning-elastic-v1",
  "admission_class": "regular",
  "events_url": "/v1/sessions/11111111-1111-4111-8111-111111111111/events"
}
```

Cotação cooperativa informa rates de entrada/cache/saída em microTU, denominador, teto e validade. Extrato informa `available_microtu`, `held_microtu`, `earned_microtu`, `spent_microtu` e `refunded_microtu`; históricos não são saldos adicionais. Respostas comerciais usam `payment_unit_id` e campos `payment_atomic`. Métricas de inferência continuam separadas. Fila agrega chaves/subcontas do mesmo tenant, sem prioridade por riqueza.

## Subconjunto de compatibilidade

Alvo inicial: Chat Completions com `model`, `messages`, `stream`, `max_tokens`, `temperature`, `top_p`, `stop` limitado, `tools` de função, `tool_choice` suportado pelo parser e `stream_options.include_usage`. Restringir `n=1`. Mensagens system/user/assistant/tool e IDs de tool call preservados. Precisão e trust policy usam configuração de catálogo/extensões documentadas.

Saída inclui ID estável, model/configuração, choices/delta, finish_reason, tool_calls e usage. Reasoning é capacidade por modelo e campo documentado; em K3 preservar a estrutura exigida pelo modelo ao reenviar histórico. Não habilitar uma feature só porque aparece no schema: tools/structured output/visão recebem gate próprio. [Uso oficial K3](https://github.com/MoonshotAI/Kimi-K3), [vLLM serving K3](https://recipes.vllm.ai/moonshotai/Kimi-K3).

Não prometer compatibilidade integral com Responses API, Assistants, Files, Batch, áudio, vídeo, fine-tuning, logprobs ou execução hospedada de ferramentas. Endpoints/flags não suportados retornam erro explícito. SDKs/agentes-alvo têm versão fixada e teste de contrato; “OpenAI-compatible” sem lista e testes não é critério de aceite.

SSE nativo usa `event`/`id` com offsets. O endpoint compatível preserva seu formato de chunks e finalização. Em erro depois dos headers, enviar evento de erro e fechar, sem `[DONE]` de sucesso ambíguo. Nem todo cliente compatível expõe bem erros parciais: SDK próprio deve tornar interrupção e política de cobrança visíveis.

## Idempotência e retenção de resultados

Repetir chave/conteúdo na API nativa retorna a mesma sessão, sem nova reserva. Mesma chave com payload diferente retorna 409. Em Chat Completions, se a sessão já estiver em andamento retornar conflito com session ID; resultado concluído pode ser reproduzido somente quando retenção opcional estiver habilitada. Sem retenção, retornar `result_not_retained`, não executar novamente. Reenviar um POST não deve cobrar outra inferência silenciosamente.

Replay SSE limitado não é armazenamento permanente de conversas. Se eventos saíram da janela, responder `resume_unavailable`; não fabricar continuidade. Cliente desconectado é cancelado segundo a política da sessão. Reexecução do modelo não reexecuta ferramentas no computador do consumidor.

## Erros e retry

| Código | HTTP antes do streaming | Retry |
|---|---:|---|
| unauthenticated / forbidden | 401 / 403 | Somente após corrigir credencial/política |
| insufficient_credits | 402, extensão documentada | Após saldo disponível; não repetir automaticamente |
| invalid_configuration / unsupported_feature | 400 ou 422 | Corrigir pedido; não substituir modelo |
| idempotency_conflict / stale_epoch | 409 | Consultar recurso; não gerar chave nova automaticamente |
| rate_limited | 429 + Retry-After | Backoff com jitter e mesma chave |
| capacity_unavailable | 503 + Retry-After quando estimável | Fila/retry conforme escolha do consumidor |
| node_lost / inference_timeout | 503/504 ou erro de stream | Uma tentativa interna antes do primeiro token, sob regras do 06 |
| settlement_pending | Estado no GET da sessão | Consultar; não reenviar inferência |

Envelope de erro: `code`, `message` segura, `request_id`, `session_id` opcional, `retryable`, `details` allowlisted. Não expor stack, prompts, token privado, endereço interno ou chave de nó. Páginas administrativas usam permissão explícita e auditam mutações.
