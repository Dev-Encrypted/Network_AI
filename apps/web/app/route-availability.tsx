// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatTU } from "@network-ai/contracts";

type Participant = {
  node_id: string;
  provider_id: string;
  node_name: string;
  provider_name: string;
  share_bps: number;
  maximum_microtu: string;
  paid_microtu: string;
  credited_ms: string;
  accepted: boolean;
  provider_mandate_id: string | null;
  withdrawn_at: string | null;
};
type Lease = {
  terms: {
    compensation: string;
    cooperative?: {
      pool_id: string;
      policy_sha256: string;
      funding_source: string;
    };
  };
  id: string;
  sponsor_id: string;
  route_name: string;
  state: string;
  purpose: string;
  reason: string;
  duration_seconds: number;
  rate_microtu_per_second: string;
  budget_microtu: string;
  paid_microtu: string;
  joint_ready_ms: string;
  ends_ms: string | null;
  offer_expires_at: string;
  terms_sha256: string;
  participants: Participant[];
};
type Route = {
  id: string;
  name: string;
  state: string;
  available: boolean;
  participants: { share_bps: number; node_name: string }[];
};
type Props = {
  user: { id: string; role: string };
  request: <T>(path: string, method?: string, body?: unknown) => Promise<T>;
  onChange: () => Promise<void>;
};
const states: Record<string, string> = {
  OFFERED: "Aguardando todos os operadores",
  ACTIVE: "Janela ativa",
  DRAINING: "Concluindo compromissos",
  COMPLETED: "Janela concluída",
  CANCELLED: "Oferta cancelada",
  EXPIRED: "Oferta expirada",
};
const purposes: Record<string, string> = {
  REQUESTED: "Uso solicitado",
  SCHEDULED: "Janela programada",
  EXPERIMENT: "Experimento limitado",
};

export function RouteAvailabilityPanel({ user, request, onChange }: Props) {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeId, setRouteId] = useState("");
  const [seconds, setSeconds] = useState(60);
  const [rate, setRate] = useState("1000");
  const [purpose, setPurpose] = useState("REQUESTED");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const attempt = useRef<{ payload: string; id: string } | null>(null);
  const refresh = useCallback(async () => {
    const [ls, rs] = await Promise.all([
      request<{ data: Lease[] }>("/availability/routes"),
      request<{ data: Route[] }>("/routes"),
    ]);
    setLeases(ls.data);
    setRoutes(rs.data);
  }, [request]);
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const [ls, rs] = await Promise.all([
          request<{ data: Lease[] }>("/availability/routes"),
          request<{ data: Route[] }>("/routes"),
        ]);
        if (live) {
          setLeases(ls.data);
          setRoutes(rs.data);
        }
      } catch (e) {
        if (live)
          setError(
            e instanceof Error ? e.message : "Falha ao atualizar janelas.",
          );
      }
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [request]);
  async function run(
    action: () => Promise<unknown>,
    message: string,
    created = false,
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await refresh();
      await onChange();
      if (created) attempt.current = null;
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }
  const budget =
    /^[1-9][0-9]{0,18}$/.test(rate) &&
    Number.isInteger(seconds) &&
    seconds >= 30 &&
    seconds <= 3600
      ? BigInt(rate) * BigInt(seconds)
      : 0n;
  const selected = routes.find((r) => r.id === routeId);
  const ready = routes.filter((r) => r.state === "LOCAL_PREVIEW");
  return (
    <section
      className="route-availability-section"
      aria-labelledby="route-availability-title"
    >
      <h2 id="route-availability-title">Disponibilidade da rota completa</h2>
      <p className="section-footnote">
        Financie uma janela para o conjunto inteiro de nós. Todos os operadores
        precisam aceitar a mesma oferta. O orçamento é único: cada etapa recebe
        apenas sua parte pelo tempo em que estiver pronta, mesmo sem novas
        perguntas ao modelo.
      </p>
      <form
        className="route-availability-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            async () => {
              const data = {
                route_id: routeId,
                duration_seconds: seconds,
                rate_microtu_per_second: rate,
                purpose,
                reason: reason.trim(),
              };
              const payload = JSON.stringify(data);
              if (attempt.current?.payload !== payload)
                attempt.current = { payload, id: crypto.randomUUID() };
              await request("/availability/routes", "POST", {
                ...data,
                idempotency_key: attempt.current.id,
              });
            },
            "Orçamento reservado. Cada operador precisa revisar e aceitar a janela.",
            true,
          );
        }}
      >
        <label>
          Rota beneficiada
          <select
            value={routeId}
            onChange={(e) => setRouteId(e.target.value)}
            required
            disabled={busy}
          >
            <option value="">Selecione uma rota</option>
            {ready.map((r) => (
              <option key={r.id} value={r.id} disabled={!r.available}>
                {r.name}
                {!r.available ? " · aguardando capacidade" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Duração da janela (segundos)
          <input
            type="number"
            min={30}
            max={3600}
            value={seconds}
            required
            disabled={busy}
            onChange={(e) => setSeconds(Number(e.target.value))}
          />
        </label>
        <label>
          Microcréditos por segundo da rota
          <input
            inputMode="numeric"
            pattern="[1-9][0-9]{0,18}"
            value={rate}
            required
            disabled={busy}
            onChange={(e) => setRate(e.target.value)}
          />
        </label>
        <label>
          Finalidade da janela
          <select
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            disabled={busy}
          >
            {Object.entries(purposes).map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="coverage-wide">
          Por que manter esta rota disponível?
          <input
            value={reason}
            minLength={20}
            maxLength={500}
            required
            disabled={busy}
            placeholder="Descreva o uso esperado ou o experimento"
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <div className="coverage-wide coverage-budget">
          <p>
            Reserva total: <strong>{formatTU(budget)} LAB_TU</strong>
          </p>
          {selected && (
            <p className="section-footnote">
              Divisão do orçamento:{" "}
              {selected.participants
                .map(
                  (p) =>
                    `${p.node_name} (${(p.share_bps / 100).toLocaleString("pt-BR")}%)`,
                )
                .join(" · ")}
              .
            </p>
          )}
          <p className="section-footnote">
            O valor é pago além da remuneração por inferência. Se uma etapa
            falhar, as outras preservam seus compromissos até o fim da janela.
            Créditos não utilizados voltam a você no encerramento. LAB_TU não
            tem conversão em dinheiro.
          </p>
        </div>
        <button
          className="secondary"
          disabled={
            busy ||
            !selected?.available ||
            budget <= 0n ||
            budget > 9223372036854775807n
          }
        >
          Financiar janela da rota
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!leases.length && (
        <p className="section-footnote">
          Nenhuma janela contratada. Cadastre e qualifique a rota antes de
          financiar sua disponibilidade.
        </p>
      )}
      {leases.map((l) => {
        const own = l.participants.filter((p) => p.provider_id === user.id);
        const accepted = own.length > 0 && own.every((p) => p.accepted);
        const withdrawn = own.length > 0 && own.every((p) => p.withdrawn_at);
        const providers = new Set(l.participants.map((p) => p.provider_id))
          .size;
        const accepts = new Set(
          l.participants.filter((p) => p.accepted).map((p) => p.provider_id),
        ).size;
        return (
          <article
            key={l.id}
            className="route-card coverage-card"
            data-lease-id={l.id}
          >
            <div className="section-top">
              <h3>{l.route_name}</h3>
              <span className={`badge ${l.state === "ACTIVE" ? "good" : ""}`}>
                {states[l.state]}
              </span>
            </div>
            <p>
              {purposes[l.purpose]} · {l.reason}
            </p>
            <p>
              {l.sponsor_id === user.id
                ? "Você financia esta janela."
                : "Oferta recebida."}{" "}
              {accepts}/{providers} operadores aceitaram.
            </p>
            <div className="coverage-stats">
              <p>
                Orçamento
                <strong>{formatTU(BigInt(l.budget_microtu))} LAB_TU</strong>
              </p>
              <p>
                Pago às etapas
                <strong>{formatTU(BigInt(l.paid_microtu))} LAB_TU</strong>
              </p>
              <p>
                Rota inteira pronta
                <strong>
                  {(Number(l.joint_ready_ms) / 1000).toFixed(1)} s
                </strong>
              </p>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Etapa / operador</th>
                    <th>Parte do orçamento</th>
                    <th>Pago / tempo pronto</th>
                    <th>Aceite</th>
                  </tr>
                </thead>
                <tbody>
                  {l.participants.map((p) => (
                    <tr key={p.node_id}>
                      <td>
                        <strong>{p.node_name}</strong>
                        <small>{p.provider_name}</small>
                      </td>
                      <td>
                        {formatTU(BigInt(p.maximum_microtu))} LAB_TU
                        <small>
                          {(p.share_bps / 100).toLocaleString("pt-BR")}% do
                          total
                        </small>
                      </td>
                      <td>
                        {formatTU(BigInt(p.paid_microtu))} LAB_TU
                        <small>
                          {(Number(p.credited_ms) / 1000).toFixed(1)} s
                        </small>
                      </td>
                      <td>
                        {p.withdrawn_at
                          ? "Contribuição encerrada"
                          : p.accepted
                            ? p.provider_mandate_id
                              ? "Aceito por autorização limitada"
                              : "Aceito"
                            : "Pendente"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="section-footnote">
              {l.ends_ms
                ? `Fim contratado: ${new Date(Number(l.ends_ms)).toLocaleString("pt-BR")}.`
                : `Aceites até: ${new Date(l.offer_expires_at).toLocaleString("pt-BR")}. A duração começa somente com o aceite de todos e a rota pronta.`}
            </p>
            <details>
              <summary>Termos desta janela</summary>
              <p>
                {l.duration_seconds} segundos; {l.rate_microtu_per_second}{" "}
                microcréditos por segundo para a rota inteira, distribuídos nos
                tetos acima.
              </p>
              <p className="section-footnote">
                Somente intervalos observados são pagos. Falhas e ausência de
                observação não são preenchidas por estimativas. Encerrar uma
                contribuição interrompe seus pagamentos futuros; os outros
                participantes preservam a janela aceita. O orçamento restante
                fica reservado até o prazo, inclusive durante uma falha.
              </p>
              <p>
                {l.terms.compensation === "READINESS_ONLY"
                  ? "Janela cooperativa: receba pelo tempo pronto observado. Nas sessões que escolherem este fundo, todo o consumo retorna ao fundo e não existe um segundo pagamento 80/20 por inferência. Sessões comuns mantêm seus termos de inferência."
                  : "A remuneração desta janela é adicional à remuneração por inferência."}
              </p>
              {l.terms.cooperative && (
                <p className="route-hash">
                  Fundo {l.terms.cooperative.pool_id} · origem{" "}
                  {l.terms.cooperative.funding_source}. Créditos não utilizados
                  retornam ao fundo. Política aceita:{" "}
                  {l.terms.cooperative.policy_sha256}.
                </p>
              )}
              <p className="route-hash">
                SHA-256 dos termos: <code>{l.terms_sha256}</code>
              </p>
            </details>
            <div className="route-actions">
              {l.state === "OFFERED" && own.length > 0 && !accepted && (
                <button
                  className="primary compact"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        request(`/availability/routes/${l.id}/accept`, "POST", {
                          terms_sha256: l.terms_sha256,
                        }),
                      "Aceite registrado para seus nós.",
                    )
                  }
                >
                  {l.terms.compensation === "READINESS_ONLY"
                    ? "Aceitar janela cooperativa"
                    : "Aceitar janela"}
                </button>
              )}
              {l.state === "OFFERED" && (
                <button
                  className="secondary compact"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        request(
                          `/availability/routes/${l.id}/cancel`,
                          "POST",
                          {},
                        ),
                      "Oferta cancelada; orçamento devolvido à conta de origem.",
                    )
                  }
                >
                  Cancelar oferta
                </button>
              )}
              {["ACTIVE", "DRAINING"].includes(l.state) &&
                !withdrawn &&
                (own.length > 0 || l.state === "ACTIVE") && (
                  <button
                    className="secondary compact"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          request(
                            `/availability/routes/${l.id}/cancel`,
                            "POST",
                            {},
                          ),
                        "Encerramento registrado. O saldo e os demais compromissos serão liquidados no prazo contratado.",
                      )
                    }
                  >
                    {own.length > 0
                      ? "Encerrar minha contribuição"
                      : "Encerrar após os compromissos"}
                  </button>
                )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
