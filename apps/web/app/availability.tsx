// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
"use client";
import { useCallback, useEffect, useState } from "react";
import { formatTU } from "@network-ai/contracts";

type Lease = {
  id: string;
  node_name: string;
  sponsor_id: string;
  provider_id: string;
  state: string;
  duration_seconds: number;
  rate_microtu_per_second: string;
  budget_microtu: string;
  paid_microtu: string;
  credited_ms: string;
};
type Props = {
  user: { id: string; role: string };
  nodes: { id: string; name: string }[];
  request: <T>(path: string, method?: string, body?: unknown) => Promise<T>;
  onChange: () => Promise<void>;
};
const states: Record<string, string> = {
  OFFERED: "Aguardando operador",
  ACTIVE: "Ativo",
  COMPLETED: "Concluído",
  CANCELLED: "Encerrado",
  EXPIRED: "Oferta expirada",
};
export function AvailabilityPanel({ user, nodes, request, onChange }: Props) {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [nodeId, setNodeId] = useState("");
  const [seconds, setSeconds] = useState(60);
  const [rate, setRate] = useState("1000");
  const refresh = useCallback(async () => {
    setLeases((await request<{ data: Lease[] }>("/availability/leases")).data);
  }, [request]);
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const data = await request<{ data: Lease[] }>("/availability/leases");
        if (live) setLeases(data.data);
      } catch (e) {
        if (live)
          setError(
            e instanceof Error ? e.message : "Falha ao atualizar contratos.",
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
  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await refresh();
      await onChange();
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
  return (
    <section
      className="availability-section"
      aria-labelledby="availability-title"
    >
      <h2 id="availability-title">Contratos de disponibilidade</h2>
      <p className="section-footnote">
        Reserve créditos para manter um modelo disponível. O operador precisa
        aceitar; apenas intervalos observados como prontos são pagos. O restante
        volta ao patrocinador ao encerrar. Unidade: LAB_TU, sem conversão em
        dinheiro.
      </p>
      <form
        className="availability-form"
        onSubmit={(event) => {
          event.preventDefault();
          void run(
            () =>
              request("/availability/leases", "POST", {
                node_id: nodeId,
                duration_seconds: seconds,
                rate_microtu_per_second: rate,
                idempotency_key: crypto.randomUUID(),
              }),
            "Oferta financiada. Aguardando aceite do operador.",
          );
        }}
      >
        <label>
          Nó beneficiado
          <input
            aria-label="Nó beneficiado"
            list="availability-nodes"
            value={nodeId}
            onChange={(e) => setNodeId(e.target.value)}
            placeholder="Identificador do nó"
            required
            disabled={busy}
          />
        </label>
        <datalist id="availability-nodes">
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </datalist>
        <label>
          Duração (segundos)
          <input
            type="number"
            min={30}
            max={3600}
            value={seconds}
            onChange={(e) => setSeconds(Number(e.target.value))}
            required
            disabled={busy}
          />
        </label>
        <label>
          Microcréditos por segundo
          <input
            inputMode="numeric"
            pattern="[1-9][0-9]{0,18}"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            required
            disabled={busy}
          />
        </label>
        <p>
          Reserva máxima: <strong>{formatTU(budget)} LAB_TU</strong>
          <br />
          <small>1 LAB_TU = 1.000.000 microcréditos.</small>
        </p>
        <button
          className="secondary"
          disabled={busy || budget <= 0n || budget > 9223372036854775807n}
        >
          Financiar oferta
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nó / participação</th>
              <th>Estado</th>
              <th>Reserva</th>
              <th>Pago / tempo observado</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {leases.map((l) => (
              <tr key={l.id}>
                <td>
                  <strong>{l.node_name}</strong>
                  <small>
                    {l.sponsor_id === user.id
                      ? "Você financia"
                      : "Oferta recebida"}
                  </small>
                </td>
                <td>{states[l.state]}</td>
                <td>{formatTU(BigInt(l.budget_microtu))} LAB_TU</td>
                <td>
                  {formatTU(BigInt(l.paid_microtu))} LAB_TU
                  <small>{(Number(l.credited_ms) / 1000).toFixed(1)} s</small>
                </td>
                <td>
                  {l.state === "OFFERED" && l.provider_id === user.id && (
                    <button
                      className="secondary compact"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            request(
                              `/availability/leases/${l.id}/accept`,
                              "POST",
                              {},
                            ),
                          "Contrato aceito.",
                        )
                      }
                    >
                      Aceitar
                    </button>
                  )}
                  {["OFFERED", "ACTIVE"].includes(l.state) && (
                    <button
                      className="secondary compact"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            request(
                              `/availability/leases/${l.id}/cancel`,
                              "POST",
                              {},
                            ),
                          "Contrato encerrado e saldo restante devolvido.",
                        )
                      }
                    >
                      Encerrar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!leases.length && (
          <p className="section-footnote">
            Nenhum contrato. Criar um nó sozinho não emite créditos: é preciso
            uma oferta financiada e aceita.
          </p>
        )}
      </div>
    </section>
  );
}
