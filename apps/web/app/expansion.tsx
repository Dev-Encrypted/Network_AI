// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatTU } from "@network-ai/contracts";
import type { CooperativePool } from "./cooperative";

export type OperatingSupport = {
  id: string;
  scope: string;
  expires_at: string;
  revoked_at: string | null;
  terms_sha256: string;
  evidence_sha256: string;
  source_reference: string;
};
export type Expansion = {
  group_key: string;
  approved: boolean;
  blocked_by: string[];
  gates: Record<string, boolean>;
  eligible_funded_parties: number;
  spare_covered_slots: number;
  additional_complete_routes: number;
  net_recycled_microtu: string;
  normal_cost_microtu: string;
  window_budget_microtu: string;
  essential_floor_microtu: string;
  free_working_microtu: string;
  free_reserve_microtu: string;
  reserve_target_microtu: string;
  essential_groups_covered: number;
  essential_groups_required: number;
  reserved_sponsor_contract_slots: number;
  support: { id: string } | null;
};
export const expansionNames: Record<string, string> = {
  policy_permission:
    "O plano original permite expansão com autorização separada",
  normal_recovery: "24 horas de recuperação contínua",
  working_floor: "Giro preserva o piso essencial após a nova janela",
  protected_reserve: "Reserva protegida completa",
  operating_support: "Apoio operacional válido vinculado à autorização",
  essential_coverage: "Todos os grupos essenciais estão cobertos",
  essential_contract_slots:
    "Espaço para os contratos essenciais do responsável",
  recurring_flow: "Consumo retido cobre os custos normais das últimas 24 horas",
  funded_pressure:
    "Pedidos financiados de partes distintas superam as vagas livres",
  additional_complete_route:
    "Outra rota completa está pronta em recursos livres",
};
type Request = <T>(path: string, method?: string, body?: unknown) => Promise<T>;
type EconomicView = {
  parties: {
    id: string;
    name: string;
    evidence_sha256: string;
    source_reference: string;
  }[];
  affiliations: {
    id: string;
    user_name: string;
    user_id: string;
    party_name: string;
    party_id: string;
    expires_at: string;
    revoked_at: string | null;
  }[];
};
const tu = (v: string) => `${formatTU(v)} LAB_TU`;
const date = (v: string) => new Date(v).toLocaleString("pt-BR");
export function ExpansionPanel({
  pool,
  user,
  expansion,
  support,
  request,
  refresh,
}: {
  pool: CooperativePool;
  user: { role: string };
  expansion: Expansion[];
  support: OperatingSupport[];
  request: Request;
  refresh: () => Promise<void>;
}) {
  return (
    <details className="expansion-panel">
      <summary>Expansão conforme a demanda</summary>
      <p>
        Mais crédito disponível não significa mais capacidade. Uma janela extra
        exige pedidos com créditos já reservados, cobertura essencial, caixa
        protegido, outra rota completa e consentimento específico de todos os
        operadores.
      </p>
      <p className="section-footnote">
        Esta prévia usa classificações privadas revisadas pelo administrador.
        Contas da mesma organização contam como uma parte. Contas sem
        classificação ou ligadas ao responsável ou aos operadores não justificam
        expansão. A declaração não comprova independência pública, dinheiro
        externo ou resistência a identidades falsas.
      </p>
      {expansion.map((f) => (
        <article
          className="route-card"
          key={f.group_key}
          data-expansion-group={f.group_key}
        >
          <strong>
            {f.group_key} ·{" "}
            {f.approved
              ? "Condições econômicas atendidas nesta avaliação"
              : "Expansão aguardando condições"}
          </strong>
          <p>
            Partes com pedidos elegíveis: {f.eligible_funded_parties}. Vagas
            cobertas livres: {f.spare_covered_slots}. Rotas adicionais
            completas: {f.additional_complete_routes}.
          </p>
          <p>
            Consumo retido em 24h: {tu(f.net_recycled_microtu)}. Custo normal em
            24h: {tu(f.normal_cost_microtu)}.
          </p>
          <p>
            Giro livre: {tu(f.free_working_microtu)}. Piso essencial:{" "}
            {tu(f.essential_floor_microtu)}. Orçamento de uma janela extra:{" "}
            {tu(f.window_budget_microtu)}. Reserva: {tu(f.free_reserve_microtu)}{" "}
            / {tu(f.reserve_target_microtu)}.
          </p>
          <ul className="expansion-gates">
            {Object.entries(f.gates).map(([key, ok]) => (
              <li key={key} data-expansion-gate={key}>
                <span>{ok ? "Atendido" : "Pendente"}</span> —{" "}
                {expansionNames[key] ?? key}
              </li>
            ))}
          </ul>
          <p className="section-footnote">
            A avaliação não reserva capacidade. A transação verifica novamente
            as condições, os limites e os consentimentos. Cada pedido pode
            justificar no máximo uma expansão. Grants e contribuições ao fundo
            não são consumo recorrente.
          </p>
        </article>
      ))}
      <h4>Apoio operacional registrado</h4>
      <p>
        O apoio descreve recursos oferecidos para manter a operação. Ele não
        emite créditos e não representa caixa verificado.
      </p>
      {!support.length && <p>Nenhum apoio operacional registrado.</p>}
      {support.map((s) => (
        <article
          className="route-card"
          key={s.id}
          data-operating-support={s.id}
        >
          <strong>
            {s.revoked_at
              ? "Apoio revogado"
              : new Date(s.expires_at).getTime() <= Date.now()
                ? "Apoio expirado"
                : "Apoio registrado"}
          </strong>
          <p>{s.scope}</p>
          <p>Validade: {date(s.expires_at)}.</p>
          <p className="route-hash">
            Termos: <code>{s.terms_sha256}</code>
          </p>
        </article>
      ))}
      {user.role === "admin" && (
        <EconomicAdmin
          pool={pool}
          support={support}
          request={request}
          refresh={refresh}
        />
      )}
    </details>
  );
}
function EconomicAdmin({
  pool,
  support,
  request,
  refresh,
}: {
  pool: CooperativePool;
  support: OperatingSupport[];
  request: Request;
  refresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [view, setView] = useState<EconomicView | null>(null);
  const [users, setUsers] = useState<
    { id: string; name: string; login: string; disabled: boolean }[]
  >([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [name, setName] = useState(""),
    [account, setAccount] = useState(""),
    [party, setParty] = useState("");
  const [source, setSource] = useState(""),
    [evidence, setEvidence] = useState(""),
    [minutes, setMinutes] = useState(60);
  const [scope, setScope] = useState(""),
    [consent, setConsent] = useState(false);
  const retry = useRef<{ payload: string; id: string; expires: string } | null>(
    null,
  );
  const load = useCallback(async () => {
    const [v, u] = await Promise.all([
      request<EconomicView>("/admin/economics"),
      request<{ data: typeof users }>("/admin/users"),
    ]);
    setView(v);
    setUsers(u.data);
  }, [request]);
  useEffect(() => {
    if (open) void load().catch((e) => setError(e.message));
  }, [open, load]);
  async function mutate(
    path: string,
    body: Record<string, unknown>,
    expiry = false,
    revocation = false,
  ) {
    if (
      expiry &&
      (!Number.isInteger(minutes) || minutes < 2 || minutes > 43200)
    ) {
      setError("Informe uma validade entre 2 e 43.200 minutos.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    const payload = JSON.stringify({ path, body, expiry, minutes });
    if (retry.current?.payload !== payload)
      retry.current = {
        payload,
        id: crypto.randomUUID(),
        expires: new Date(Date.now() + minutes * 60000).toISOString(),
      };
    try {
      await request(path, "POST", {
        ...body,
        ...(!revocation ? { idempotency_key: retry.current.id } : {}),
        ...(expiry ? { expires_at: retry.current.expires } : {}),
      });
      retry.current = null;
      setNotice(
        revocation
          ? "Revogação registrada; os contratos aceitos continuam."
          : "Declaração privada registrada com referência e prazo. Ela não comprova independência pública ou caixa externo.",
      );
      await load();
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Falha ao registrar evidência.",
      );
    } finally {
      setBusy(false);
    }
  }
  const common = { source_reference: source, evidence_sha256: evidence };
  const evidenceReady =
    source.trim().length >= 20 && /^[a-f0-9]{64}$/.test(evidence);
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Administrar declarações econômicas privadas</summary>
      {open && (
        <section aria-label="Declarações econômicas privadas">
          <p>
            Agrupe contas sob a mesma parte quando tiverem controle comum.
            Registre a referência e o hash do documento revisado. A data da
            classificação começa agora; consumo anterior não será qualificado
            retroativamente.
          </p>
          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="notice-banner" role="status">
              {notice}
            </p>
          )}
          <div className="route-availability-form">
            <label>
              Referência da evidência revisada
              <input
                minLength={20}
                maxLength={300}
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </label>
            <label>
              SHA-256 do documento revisado
              <input
                spellCheck={false}
                pattern="[a-f0-9]{64}"
                maxLength={64}
                value={evidence}
                onChange={(e) => setEvidence(e.target.value.toLowerCase())}
              />
            </label>
            <label>
              Validade da declaração (minutos)
              <input
                type="number"
                min={2}
                max={43200}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              />
            </label>
          </div>
          <form
            className="route-availability-form"
            onSubmit={(e) => {
              e.preventDefault();
              void mutate("/admin/economics/parties", { ...common, name });
            }}
          >
            <label>
              Nome da parte econômica
              <input
                required
                minLength={2}
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button className="secondary" disabled={busy || !evidenceReady}>
              Registrar parte econômica
            </button>
          </form>
          <form
            className="route-availability-form"
            onSubmit={(e) => {
              e.preventDefault();
              void mutate(
                "/admin/economics/affiliations",
                { ...common, user_id: account, party_id: party },
                true,
              );
            }}
          >
            <label>
              Conta a classificar
              <select
                required
                value={account}
                onChange={(e) => setAccount(e.target.value)}
              >
                <option value="">Selecione a conta</option>
                {users
                  .filter((u) => !u.disabled)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} · {u.login}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Parte responsável pela conta
              <select
                required
                value={party}
                onChange={(e) => setParty(e.target.value)}
              >
                <option value="">Selecione a parte</option>
                {view?.parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <button className="secondary" disabled={busy || !evidenceReady}>
              Registrar classificação da conta
            </button>
          </form>
          {view?.affiliations.map((a) => (
            <article
              className="route-card"
              key={a.id}
              data-economic-affiliation={a.id}
            >
              <strong>
                {a.user_name} · {a.party_name}
              </strong>
              <p>
                {a.revoked_at
                  ? "Classificação revogada"
                  : new Date(a.expires_at).getTime() <= Date.now()
                    ? "Classificação expirada"
                    : "Classificação registrada"}{" "}
                · Validade: {date(a.expires_at)}.
              </p>
              {!a.revoked_at && (
                <button
                  className="secondary compact"
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      `/admin/economics/affiliations/${a.id}/revoke`,
                      {},
                      false,
                      true,
                    )
                  }
                >
                  Revogar classificação
                </button>
              )}
            </article>
          ))}
          <form
            className="route-availability-form"
            onSubmit={(e) => {
              e.preventDefault();
              void mutate(
                `/cooperative/pools/${pool.id}/operating-support`,
                {
                  ...common,
                  policy_sha256: pool.policy_sha256,
                  scope,
                  consent: "PRIVATE_IN_KIND_SUPPORT_NO_VERIFIED_CASH_CLAIM",
                },
                true,
              );
            }}
          >
            <label className="coverage-wide">
              Recursos e responsabilidades do apoio
              <textarea
                required
                minLength={40}
                maxLength={1000}
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              />
            </label>
            <label className="coverage-wide consent-line">
              <input
                type="checkbox"
                required
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              Registro apoio em recursos, sem afirmar que exista caixa externo
              verificado.
            </label>
            <button
              className="secondary"
              disabled={busy || !evidenceReady || !consent}
            >
              Registrar apoio operacional
            </button>
          </form>
          {support
            .filter((s) => !s.revoked_at)
            .map((s) => (
              <p key={s.id}>
                Apoio até {date(s.expires_at)} · {s.id.slice(0, 8)}{" "}
                <button
                  className="secondary compact"
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      `/cooperative/operating-support/${s.id}/revoke`,
                      {},
                      false,
                      true,
                    )
                  }
                >
                  Revogar este apoio
                </button>
              </p>
            ))}
          <p className="section-footnote">
            Até 200 registros recentes de partes e classificações. Revogue uma
            classificação antes de substituí-la. O histórico e os compromissos
            aceitos permanecem registrados.
          </p>
        </section>
      )}
    </details>
  );
}
