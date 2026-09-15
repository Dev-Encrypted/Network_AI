// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatTU } from "@network-ai/contracts";
import type { CooperativePool } from "./cooperative";
import {
  ExpansionPanel,
  expansionNames,
  type Expansion,
  type OperatingSupport,
} from "./expansion";

type Authority = {
  coverage_kind: string;
  id: string;
  state: string;
  maximum_windows: number;
  windows_used: number;
  expires_at: string;
  terms_sha256: string;
  group_key: string;
  last_status: string;
  maximum_working_microtu: string;
  maximum_reserve_microtu: string;
  working_committed_microtu: string;
  reserve_committed_microtu: string;
};
type Mandate = {
  coverage_kind: string;
  id: string;
  provider_id: string;
  provider_name: string;
  route_name: string;
  state: string;
  maximum_windows: number;
  windows_used: number;
  expires_at: string;
  terms_sha256: string;
  terms: { components: { maximum_microtu: string }[] };
};
type View = {
  expansion: Expansion[];
  operating_support: OperatingSupport[];
  authorizations: Authority[];
  mandates: Mandate[];
  routes: {
    route_id: string;
    name: string;
    ready: boolean;
    duration_seconds: number;
    rate_microtu_per_second: string;
    own_components: { share_bps: number }[];
  }[];
  runs: {
    coverage_kind: string;
    lease_id: string;
    sequence: number;
    source: string;
    state: string;
    committed_microtu: string;
    paid_microtu: string;
    ends_ms: string;
    terms_sha256: string;
  }[];
};
type Props = {
  pool: CooperativePool;
  user: { id: string; role: string };
  request: <T>(path: string, method?: string, body?: unknown) => Promise<T>;
  onChange: () => Promise<void>;
};
const names: Record<string, string> = {
  ACTIVE: "Autorização ativa",
  REVOKED: "Revogada",
  EXPIRED: "Expirada",
  EXHAUSTED: "Limite esgotado",
  WAITING: "Aguardando avaliação",
  PAUSED: "Plano pausado",
  AUTHORIZER_DISABLED: "Responsável desabilitado",
  WAITING_FOR_SUPPORT: "Prazo insuficiente para outra janela",
  WAITING_FOR_WINDOW: "Janela anterior em andamento",
  WAITING_FOR_FUNDS: "Sem saldo livre suficiente",
  WAITING_FOR_AUTHORIZED_SOURCE: "Sem limite autorizado na origem disponível",
  WAITING_FOR_CAPACITY: "Sem rota completa livre",
  WAITING_FOR_OPERATORS: "Falta autorização válida de algum operador",
  RENEWED: "Janela renovada",
  RETRY_PENDING: "Tentativa revertida; aguardando nova avaliação",
  COMPLETED: "Concluída",
  DRAINING: "Concluindo compromissos",
  CANCELLED: "Cancelada",
};
const label = (value: string) =>
  names[value] ??
  (value.startsWith("EXPANSION_")
    ? `Expansão pendente: ${expansionNames[value.slice(10).toLowerCase()] ?? value}`
    : value);
const kindLabel = (value: string) =>
  value === "EXPANSION" ? "Expansão" : "Essencial";
const tu = (value: string) => `${formatTU(value)} LAB_TU`;
const date = (value: string) => new Date(value).toLocaleString("pt-BR");

export function RenewalsPanel({ pool: p, user, request, onChange }: Props) {
  const [open, setOpen] = useState(false),
    [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [group, setGroup] = useState(p.groups[0]?.group_key ?? ""),
    [windows, setWindows] = useState(3);
  const initialCost =
    BigInt(p.groups[0]?.rate_microtu_per_second ?? "0") *
    BigInt(p.groups[0]?.duration_seconds ?? 0);
  const [working, setWorking] = useState((initialCost * 3n).toString()),
    [reserve, setReserve] = useState("0");
  const [minutes, setMinutes] = useState(60),
    [reason, setReason] = useState(""),
    [consent, setConsent] = useState(false);
  const [route, setRoute] = useState(""),
    [operatorWindows, setOperatorWindows] = useState(3);
  const [operatorMinutes, setOperatorMinutes] = useState(60),
    [operatorReason, setOperatorReason] = useState("");
  const [operatorConsent, setOperatorConsent] = useState(false);
  const [kind, setKind] = useState("ESSENTIAL"),
    [operatorKind, setOperatorKind] = useState("ESSENTIAL");
  const [supportId, setSupportId] = useState("");
  const attempt = useRef<{
    payload: string;
    id: string;
    expires: string;
  } | null>(null);
  const manager = user.id === p.creator_id || user.role === "admin";
  const refresh = useCallback(async () => {
    setView(await request<View>(`/cooperative/pools/${p.id}/renewals`));
  }, [p.id, request]);
  useEffect(() => {
    if (!open) return;
    let live = true;
    const run = async () => {
      try {
        if (live) await refresh();
      } catch (e) {
        if (live)
          setError(
            e instanceof Error ? e.message : "Falha ao carregar autorizações.",
          );
      }
    };
    void run();
    const timer = setInterval(() => void run(), 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [open, refresh]);
  async function submit(
    path: string,
    body: Record<string, unknown>,
    validity?: number,
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    const payload = JSON.stringify({ path, body, validity });
    if (attempt.current?.payload !== payload)
      attempt.current = {
        payload,
        id: crypto.randomUUID(),
        expires: new Date(Date.now() + (validity ?? 1) * 60000).toISOString(),
      };
    try {
      await request(path, "POST", {
        ...body,
        ...(validity === undefined
          ? {}
          : {
              idempotency_key: attempt.current.id,
              expires_at: attempt.current.expires,
            }),
      });
      attempt.current = null;
      setNotice(
        validity === undefined
          ? "Revogação registrada. Janelas já aceitas continuam até o prazo contratado."
          : "Autorização registrada com os limites informados. A renovação depende de saldo, capacidade e consentimento de todos.",
      );
      await refresh();
      await onChange();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível registrar a autorização.",
      );
    } finally {
      setBusy(false);
    }
  }
  const g = p.groups.find((v) => v.group_key === group);
  const selected = view?.routes.find((v) => v.route_id === route);
  return (
    <details
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="renewals-panel"
    >
      <summary>Renovação automática com limites</summary>
      {open && (
        <section aria-label="Autorizações de renovação">
          <p>
            O responsável limita os gastos do fundo. Cada operador autoriza
            separadamente sua participação. Uma nova janela só começa quando
            todos os consentimentos estão válidos, a rota está pronta e o saldo
            cobre a janela inteira.
          </p>
          <p className="section-footnote">
            Os limites contam compromissos brutos: devoluções e novos créditos
            não restauram nem aumentam a autorização. Revogar interrompe apenas
            janelas futuras. A remuneração continua dependendo da prontidão
            observada durante cada contrato aceito.
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
          {!view ? (
            <p>Carregando autorizações…</p>
          ) : (
            <>
              <ExpansionPanel
                pool={p}
                user={user}
                expansion={view.expansion}
                support={view.operating_support}
                request={request}
                refresh={refresh}
              />
              {manager && (
                <details>
                  <summary>Autorizar gastos do fundo</summary>
                  <form
                    className="route-availability-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submit(
                        `/cooperative/pools/${p.id}/renewals`,
                        {
                          group_key: group,
                          policy_sha256: p.policy_sha256,
                          maximum_windows: windows,
                          maximum_working_microtu: working,
                          maximum_reserve_microtu:
                            kind === "EXPANSION" ? "0" : reserve,
                          coverage_kind: kind,
                          ...(kind === "EXPANSION"
                            ? { operating_support_id: supportId }
                            : {}),
                          reason,
                          consent:
                            "BOUNDED_GROSS_COMMITMENTS_NO_AUTOMATIC_LIMIT_INCREASE",
                        },
                        minutes,
                      );
                    }}
                  >
                    <label>
                      Finalidade do limite do fundo
                      <select
                        value={kind}
                        onChange={(e) => {
                          setKind(e.target.value);
                          setConsent(false);
                        }}
                      >
                        <option value="ESSENTIAL">Cobertura essencial</option>
                        <option
                          value="EXPANSION"
                          disabled={!view.expansion[0]?.gates.policy_permission}
                        >
                          Expansão condicionada à demanda
                        </option>
                      </select>
                    </label>
                    {kind === "EXPANSION" && (
                      <label>
                        Apoio vinculado à expansão
                        <select
                          required
                          value={supportId}
                          onChange={(e) => {
                            setSupportId(e.target.value);
                            setConsent(false);
                          }}
                        >
                          <option value="">Selecione o apoio registrado</option>
                          {view.operating_support
                            .filter(
                              (s) =>
                                !s.revoked_at &&
                                new Date(s.expires_at).getTime() > Date.now(),
                            )
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.scope.slice(0, 60)} · {date(s.expires_at)}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                    <label>
                      Grupo autorizado
                      <select
                        value={group}
                        onChange={(e) => setGroup(e.target.value)}
                      >
                        {p.groups.map((v) => (
                          <option key={v.group_key} value={v.group_key}>
                            {v.group_key} · {v.model_id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Máximo de janelas do fundo
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        required
                        value={windows}
                        onChange={(e) => setWindows(Number(e.target.value))}
                      />
                    </label>
                    <label>
                      Limite de giro em microcréditos
                      <input
                        inputMode="numeric"
                        pattern="[0-9]+"
                        required
                        value={working}
                        onChange={(e) => setWorking(e.target.value)}
                      />
                    </label>
                    <label>
                      Limite de reserva em microcréditos
                      <input
                        inputMode="numeric"
                        pattern="[0-9]+"
                        required
                        value={kind === "EXPANSION" ? "0" : reserve}
                        disabled={kind === "EXPANSION"}
                        onChange={(e) => setReserve(e.target.value)}
                      />
                    </label>
                    <label>
                      Validade da autorização do fundo (minutos)
                      <input
                        type="number"
                        min={1}
                        max={43200}
                        required
                        value={minutes}
                        onChange={(e) => setMinutes(Number(e.target.value))}
                      />
                    </label>
                    <label>
                      Motivo da autorização do fundo
                      <input
                        minLength={20}
                        maxLength={500}
                        required
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                    {g && (
                      <p className="coverage-wide">
                        Cada janela deste grupo dura {g.duration_seconds}s e
                        compromete{" "}
                        {tu(
                          (
                            BigInt(g.rate_microtu_per_second) *
                            BigInt(g.duration_seconds)
                          ).toString(),
                        )}
                        . Reserva com limite zero fica desautorizada. Mesmo com
                        limite, só pode cobrir uma falta real de giro.
                      </p>
                    )}
                    {kind === "EXPANSION" && (
                      <p className="coverage-wide">
                        A expansão usa somente giro acima do piso essencial. Ela
                        exige todos os critérios de demanda e apoio, além de
                        autorização específica dos operadores. O limite não se
                        aplica às janelas essenciais.
                      </p>
                    )}
                    <label className="coverage-wide consent-line">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                        required
                      />
                      Autorizo estes compromissos brutos, sem reposição
                      automática dos limites.
                    </label>
                    <button className="primary" disabled={busy || !consent}>
                      Registrar limite do fundo
                    </button>
                  </form>
                </details>
              )}
              <details>
                <summary>Autorizar minha participação como operador</summary>
                {view.routes.length === 0 ? (
                  <p>
                    Esta conta não oferece componentes das rotas deste plano.
                    Cada operador precisa entrar com sua própria conta para
                    autorizar.
                  </p>
                ) : (
                  <form
                    className="route-availability-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submit(
                        `/cooperative/pools/${p.id}/provider-mandates`,
                        {
                          route_id: route,
                          policy_sha256: p.policy_sha256,
                          maximum_windows: operatorWindows,
                          reason: operatorReason,
                          coverage_kind: operatorKind,
                          consent:
                            operatorKind === "EXPANSION"
                              ? "READINESS_ONLY_BOUNDED_EXPANSION"
                              : "READINESS_ONLY_BOUNDED_RENEWALS",
                        },
                        operatorMinutes,
                      );
                    }}
                  >
                    <label>
                      Finalidade da minha participação
                      <select
                        value={operatorKind}
                        onChange={(e) => {
                          setOperatorKind(e.target.value);
                          setOperatorConsent(false);
                        }}
                      >
                        <option value="ESSENTIAL">Cobertura essencial</option>
                        <option
                          value="EXPANSION"
                          disabled={!view.expansion[0]?.gates.policy_permission}
                        >
                          Expansão condicionada à demanda
                        </option>
                      </select>
                    </label>
                    <label>
                      Minha rota autorizada
                      <select
                        required
                        value={route}
                        onChange={(e) => setRoute(e.target.value)}
                      >
                        <option value="">Selecione sua rota</option>
                        {view.routes.map((v) => (
                          <option key={v.route_id} value={v.route_id}>
                            {v.name} ·{" "}
                            {v.ready ? "pronta" : "aguardando prontidão"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Máximo de minhas janelas
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        required
                        value={operatorWindows}
                        onChange={(e) =>
                          setOperatorWindows(Number(e.target.value))
                        }
                      />
                    </label>
                    <label>
                      Validade da minha autorização (minutos)
                      <input
                        type="number"
                        min={1}
                        max={43200}
                        required
                        value={operatorMinutes}
                        onChange={(e) =>
                          setOperatorMinutes(Number(e.target.value))
                        }
                      />
                    </label>
                    <label>
                      Motivo da minha autorização
                      <input
                        minLength={20}
                        maxLength={500}
                        required
                        value={operatorReason}
                        onChange={(e) => setOperatorReason(e.target.value)}
                      />
                    </label>
                    {selected && (
                      <p className="coverage-wide">
                        Minha participação: {selected.own_components.length}{" "}
                        componente(s),{" "}
                        {(
                          selected.own_components.reduce(
                            (s, v) => s + v.share_bps,
                            0,
                          ) / 100
                        ).toLocaleString("pt-BR")}
                        % do orçamento de{" "}
                        {tu(
                          (
                            BigInt(selected.rate_microtu_per_second) *
                            BigInt(selected.duration_seconds)
                          ).toString(),
                        )}{" "}
                        por janela de {selected.duration_seconds}s. O total
                        máximo autorizado é{" "}
                        {operatorWindows * selected.duration_seconds}s de
                        janelas. A prontidão medida determina o pagamento
                        efetivo.
                      </p>
                    )}
                    <label className="coverage-wide consent-line">
                      <input
                        type="checkbox"
                        required
                        checked={operatorConsent}
                        onChange={(e) => setOperatorConsent(e.target.checked)}
                      />
                      {operatorKind === "EXPANSION"
                        ? "Autorizo apenas janelas de expansão. "
                        : ""}
                      Aceito receber por prontidão, sem pagamento 80/20
                      adicional nas sessões cooperativas; revogar preserva
                      janelas já aceitas.
                    </label>
                    <button
                      className="primary"
                      disabled={busy || !operatorConsent || !route}
                    >
                      Registrar minha autorização
                    </button>
                  </form>
                )}
              </details>
              <h4>Limites do fundo</h4>
              {view.authorizations.length === 0 && (
                <p>Nenhuma renovação automática autorizada.</p>
              )}
              {view.authorizations.map((a) => (
                <article
                  className="route-card"
                  key={a.id}
                  data-renewal-authorization={a.id}
                >
                  <strong>
                    {a.group_key} · {kindLabel(a.coverage_kind)} ·{" "}
                    {label(a.state)}
                  </strong>
                  <p>
                    Janelas: {a.windows_used} / {a.maximum_windows}. Validade:{" "}
                    {date(a.expires_at)}.
                  </p>
                  <p>
                    Giro comprometido: {tu(a.working_committed_microtu)} /{" "}
                    {tu(a.maximum_working_microtu)}. Reserva comprometida:{" "}
                    {tu(a.reserve_committed_microtu)} /{" "}
                    {tu(a.maximum_reserve_microtu)}.
                  </p>
                  <p>Última avaliação: {label(a.last_status)}.</p>
                  <p className="route-hash">
                    Termos: <code>{a.terms_sha256}</code>
                  </p>
                  {manager && a.state === "ACTIVE" && (
                    <button
                      className="secondary compact"
                      disabled={busy}
                      onClick={() =>
                        void submit(`/cooperative/renewals/${a.id}/revoke`, {})
                      }
                    >
                      Revogar limite do fundo
                    </button>
                  )}
                </article>
              ))}
              <h4>Consentimento dos operadores</h4>
              {view.mandates.length === 0 && (
                <p>Nenhum operador autorizou renovações neste plano.</p>
              )}
              {view.mandates.map((m) => (
                <article
                  className="route-card"
                  key={m.id}
                  data-provider-mandate={m.id}
                >
                  <strong>
                    {m.provider_name} · {m.route_name} ·{" "}
                    {kindLabel(m.coverage_kind)} · {label(m.state)}
                  </strong>
                  <p>
                    Janelas aceitas: {m.windows_used} / {m.maximum_windows}.
                    Validade: {date(m.expires_at)}. Pagamento máximo por janela:{" "}
                    {tu(
                      m.terms.components
                        .reduce((sum, v) => sum + BigInt(v.maximum_microtu), 0n)
                        .toString(),
                    )}
                    .
                  </p>
                  <p className="route-hash">
                    Termos: <code>{m.terms_sha256}</code>
                  </p>
                  {(user.id === m.provider_id || user.role === "admin") &&
                    m.state === "ACTIVE" && (
                      <button
                        className="secondary compact"
                        disabled={busy}
                        onClick={() =>
                          void submit(
                            `/cooperative/provider-mandates/${m.id}/revoke`,
                            {},
                          )
                        }
                      >
                        Revogar participação futura
                      </button>
                    )}
                </article>
              ))}
              <h4>Janelas renovadas</h4>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Janela / sequência</th>
                      <th>Estado</th>
                      <th>Comprometido</th>
                      <th>Pago por prontidão</th>
                      <th>Prazo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.runs.map((r) => (
                      <tr key={r.lease_id} data-renewal-window={r.lease_id}>
                        <td>
                          {r.lease_id.slice(0, 8)} / {r.sequence} ·{" "}
                          {kindLabel(r.coverage_kind)}
                        </td>
                        <td>
                          {r.state === "ACTIVE"
                            ? "Janela ativa"
                            : label(r.state)}
                        </td>
                        <td>
                          {tu(r.committed_microtu)} (
                          {r.source === "WORKING" ? "giro" : "reserva"})
                        </td>
                        <td>{tu(r.paid_microtu)}</td>
                        <td>
                          {date(new Date(Number(r.ends_ms)).toISOString())}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="section-footnote">
                Até 100 registros recentes por lista. A prévia usa um
                coordenador local; não comprova consenso entre máquinas ou
                disponibilidade pública contínua.
              </p>
            </>
          )}
        </section>
      )}
    </details>
  );
}
