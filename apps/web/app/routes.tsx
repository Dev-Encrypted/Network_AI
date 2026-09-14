// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
"use client";
import { useCallback, useEffect, useState } from "react";

type Member = {
  node_id: string;
  node_name: string;
  provider_id: string;
  provider_name: string;
  domain_name: string;
  role: string;
  share_bps: number;
  accepted: boolean;
  withdrawn: boolean;
};
type Route = {
  id: string;
  name: string;
  model_id: string;
  state: string;
  available: boolean;
  route_sha256: string;
  qualification_note: string | null;
  participants: Member[];
};
type Props = {
  user: { id: string; role: string };
  nodes: {
    id: string;
    name: string;
    model_id: string;
    node_kind: string;
    desired_state: string;
  }[];
  request: <T>(path: string, method?: string, body?: unknown) => Promise<T>;
  onChange: () => Promise<void>;
};

export function RoutesPanel({ user, nodes, request, onChange }: Props) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [name, setName] = useState("");
  const [root, setRoot] = useState("");
  const [members, setMembers] = useState([
    { node_id: "", share_bps: 5000 },
    { node_id: "", share_bps: 5000 },
  ]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const refresh = useCallback(
    async () => setRoutes((await request<{ data: Route[] }>("/routes")).data),
    [request],
  );
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const r = await request<{ data: Route[] }>("/routes");
        if (live) setRoutes(r.data);
      } catch (e) {
        if (live)
          setError(
            e instanceof Error ? e.message : "Falha ao atualizar rotas.",
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
  const total = members.reduce((n, m) => n + m.share_bps, 0);
  const rootNode = nodes.find((n) => n.id === root);
  return (
    <section className="routes-section" aria-labelledby="routes-title">
      <div className="section-top">
        <h2 id="routes-title">Rotas de computação</h2>
        <button
          className="secondary compact"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          Propor rota
        </button>
      </div>
      <p className="section-footnote">
        Uma rota reúne o nó principal e todas as etapas necessárias para
        executar um modelo. Todos os operadores aceitam a mesma divisão. A rota
        só fica disponível quando o conjunto inteiro está pronto.
      </p>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {open && (
        <form
          className="route-proposal"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              if (!rootNode || total !== 10000)
                throw new Error(
                  "Selecione o nó principal e distribua exatamente 10.000 pontos-base.",
                );
              await request("/routes", "POST", {
                name,
                model_id: rootNode.model_id,
                idempotency_key: crypto.randomUUID(),
                participants: members.map((m, i) => ({
                  ...m,
                  node_id: i === 0 ? root : m.node_id,
                })),
              });
              setOpen(false);
              setName("");
            }, "Proposta registrada. Cada operador precisa revisar e aceitar os termos.");
          }}
        >
          <label>
            Nome da rota
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              disabled={busy}
            />
          </label>
          <label>
            Nó principal
            <select
              aria-label="Nó principal"
              value={root}
              onChange={(e) => setRoot(e.target.value)}
              required
              disabled={busy}
            >
              <option value="">Selecione um nó principal</option>
              {nodes
                .filter(
                  (n) =>
                    n.node_kind === "ROUTE_ROOT" &&
                    n.desired_state !== "REVOKED",
                )
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name} · {n.model_id}
                  </option>
                ))}
            </select>
          </label>
          <p className="section-footnote">
            Pontos-base dividem o saldo destinado aos operadores, após a taxa
            experimental da rede. 10.000 pontos-base = 100%. Esta configuração
            de laboratório usa 80% para operadores e 20% para a rede.
          </p>
          {members.map((m, i) => (
            <div className="route-member-input" key={i}>
              {i > 0 ? (
                <label>
                  Identificador da etapa {i}
                  <input
                    value={m.node_id}
                    list="route-stage-nodes"
                    required
                    disabled={busy}
                    onChange={(e) =>
                      setMembers((v) =>
                        v.map((p, j) =>
                          j === i ? { ...p, node_id: e.target.value } : p,
                        ),
                      )
                    }
                  />
                </label>
              ) : (
                <span>Participação do nó principal</span>
              )}
              <label>
                Pontos-base {i === 0 ? "do nó principal" : `da etapa ${i}`}
                <input
                  type="number"
                  min={1}
                  max={10000}
                  step={1}
                  required
                  value={m.share_bps}
                  disabled={busy}
                  onChange={(e) =>
                    setMembers((v) =>
                      v.map((p, j) =>
                        j === i
                          ? { ...p, share_bps: Number(e.target.value) }
                          : p,
                      ),
                    )
                  }
                />
              </label>
              {i > 1 && (
                <button
                  type="button"
                  className="secondary compact"
                  disabled={busy}
                  onClick={() => setMembers((v) => v.filter((_, j) => j !== i))}
                >
                  Remover etapa {i}
                </button>
              )}
            </div>
          ))}
          <datalist id="route-stage-nodes">
            {nodes
              .filter(
                (n) =>
                  n.node_kind === "RPC_STAGE" &&
                  n.model_id === rootNode?.model_id &&
                  n.desired_state !== "REVOKED",
              )
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
          </datalist>
          <div className="route-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy || members.length >= 16}
              onClick={() =>
                setMembers((v) => [...v, { node_id: "", share_bps: 1 }])
              }
            >
              Adicionar etapa
            </button>
            <span>Total: {total.toLocaleString("pt-BR")} / 10.000</span>
            <button
              type="submit"
              className="primary"
              disabled={busy || total !== 10000 || !rootNode}
            >
              Registrar proposta
            </button>
          </div>
        </form>
      )}
      {routes.length === 0 && (
        <p className="section-footnote">
          Nenhuma rota registrada. Convites de nó precisam indicar a função
          principal ou etapa antes de propor uma rota.
        </p>
      )}
      {routes.map((route) => {
        const own = route.participants.filter((m) => m.provider_id === user.id);
        const accepted = own.length > 0 && own.every((m) => m.accepted);
        const withdrawn = own.some((m) => m.withdrawn);
        return (
          <article key={route.id} className="route-card">
            <div className="section-top">
              <h3>{route.name}</h3>
              <span className={`badge ${route.available ? "good" : ""}`}>
                {route.state === "REVOKED"
                  ? "Encerrada"
                  : route.available
                    ? "Disponível"
                    : route.state === "CANDIDATE"
                      ? "Em avaliação"
                      : "Aguardando capacidade"}
              </span>
            </div>
            <p className="muted">Modelo: {route.model_id}</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Participante</th>
                    <th>Recurso físico</th>
                    <th>Parte dos operadores</th>
                    <th>Aceite</th>
                  </tr>
                </thead>
                <tbody>
                  {route.participants.map((m) => (
                    <tr key={m.node_id}>
                      <td>
                        <strong>{m.node_name}</strong>
                        <small>
                          {m.role === "ROOT" ? "Nó principal" : "Etapa"} ·{" "}
                          {m.provider_name}
                        </small>
                      </td>
                      <td>{m.domain_name}</td>
                      <td>{(m.share_bps / 100).toLocaleString("pt-BR")}%</td>
                      <td>
                        {m.withdrawn
                          ? "Retirado"
                          : m.accepted
                            ? "Aceito"
                            : "Pendente"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details>
              <summary>Termos e qualificação</summary>
              <p className="section-footnote">
                80% do valor cobrado forma o saldo dos operadores; a tabela
                divide esse saldo. Todas as etapas precisam concluir com recibos
                válidos para haver cobrança. Nós no mesmo domínio compartilham a
                capacidade física.
              </p>
              <p className="route-hash">
                SHA-256 dos termos: <code>{route.route_sha256}</code>
              </p>
              {route.qualification_note && <p>{route.qualification_note}</p>}
            </details>
            {route.state !== "REVOKED" && (
              <div className="route-actions">
                {own.length > 0 && !accepted && !withdrawn && (
                  <button
                    className="primary compact"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          request(`/routes/${route.id}/accept`, "POST", {
                            route_sha256: route.route_sha256,
                          }),
                        "Termos aceitos para seus nós.",
                      )
                    }
                  >
                    Aceitar termos
                  </button>
                )}
                {accepted && (
                  <button
                    className="secondary compact"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          request(`/routes/${route.id}/withdraw`, "POST", {}),
                        "Participação retirada para novas sessões. Sessões já aceitas preservam seus termos.",
                      )
                    }
                  >
                    Retirar participação
                  </button>
                )}
                {withdrawn && (
                  <p className="section-footnote">
                    Sua participação foi retirada. Para voltar, crie uma nova
                    proposta.
                  </p>
                )}
              </div>
            )}
            {user.role === "admin" && route.state !== "REVOKED" && (
              <form
                className="route-qualification"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () =>
                      request(`/admin/routes/${route.id}/qualify`, "POST", {
                        state: "LOCAL_PREVIEW",
                        note: notes[route.id] ?? "",
                      }),
                    "Rota qualificada para o ambiente privado.",
                  );
                }}
              >
                <label>
                  Registro de qualificação — {route.name}
                  <input
                    value={notes[route.id] ?? ""}
                    minLength={20}
                    maxLength={1000}
                    required
                    disabled={busy}
                    onChange={(e) =>
                      setNotes((v) => ({ ...v, [route.id]: e.target.value }))
                    }
                  />
                </label>
                <div className="route-actions">
                  <button
                    type="submit"
                    className="secondary compact"
                    disabled={
                      busy || !route.participants.every((m) => m.accepted)
                    }
                  >
                    Qualificar para teste local
                  </button>
                  <button
                    type="button"
                    className="secondary compact"
                    disabled={busy || (notes[route.id]?.length ?? 0) < 20}
                    onClick={() =>
                      void run(
                        () =>
                          request(`/admin/routes/${route.id}/qualify`, "POST", {
                            state: "REVOKED",
                            note: notes[route.id],
                          }),
                        "Rota encerrada para novas sessões.",
                      )
                    }
                  >
                    Encerrar rota
                  </button>
                </div>
              </form>
            )}
          </article>
        );
      })}
    </section>
  );
}
