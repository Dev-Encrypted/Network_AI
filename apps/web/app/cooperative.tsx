// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatTU } from "@network-ai/contracts";
import { RenewalsPanel } from "./renewals";

export type CooperativePool = {
  id: string;
  name: string;
  creator_id: string;
  policy_sha256: string;
  support_until: string;
  paused: boolean;
  state: string;
  balances: { working: string; reserve: string; burned: string; held: string };
  targets: { floor: string; working: string; reserve: string };
  groups: {
    group_key: string;
    model_id: string;
    duration_seconds: number;
    rate_microtu_per_second: string;
    ready: boolean;
    held: string;
  }[];
  metrics: { recycled_microtu: string; normal_readiness_cost_microtu: string };
  recent_settlements: {
    session_id: string;
    charge_microtu: string;
    working_microtu: string;
    reserve_microtu: string;
    burned_microtu: string;
    refunded: boolean;
  }[];
};
type Request = <T>(path: string, method?: string, body?: unknown) => Promise<T>;
type Props = {
  user: { id: string; role: string };
  request: Request;
  onChange: () => Promise<void>;
};
const stateNames: Record<string, string> = {
  HIBERNATING: "Sem novas promessas",
  DEFENSE: "Defesa da capacidade essencial",
  RECOVERY: "Recuperação",
  NORMAL: "Operação estável observada",
};
const tu = (s: string) => `${formatTU(s)} LAB_TU`;

export function CooperativePanel({ user, request, onChange }: Props) {
  const [pools, setPools] = useState<CooperativePool[]>([]),
    [routes, setRoutes] = useState<
      { id: string; name: string; available: boolean }[]
    >([]);
  const [name, setName] = useState(""),
    [hours, setHours] = useState(1),
    [groups, setGroups] = useState([{ route: "", rate: "100", seconds: 60 }]);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const attempt = useRef<{
    payload: string;
    id: string;
    support: string;
  } | null>(null);
  const load = useCallback(async () => {
    const [p, r] = await Promise.all([
      request<{ data: CooperativePool[] }>("/cooperative/pools"),
      request<{ data: { id: string; name: string; available: boolean }[] }>(
        "/routes",
      ),
    ]);
    setPools(p.data);
    setRoutes(r.data);
  }, [request]);
  useEffect(() => {
    let live = true;
    const run = async () => {
      try {
        if (live) await load();
      } catch (e) {
        if (live)
          setError(
            e instanceof Error ? e.message : "Falha ao carregar fundos.",
          );
      }
    };
    void run();
    const timer = setInterval(() => void run(), 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [load]);
  async function mutate(
    path: string,
    body: Record<string, unknown>,
    success: string,
    idempotent = true,
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    const payload = JSON.stringify({
      path,
      body,
      ...(path === "/cooperative/pools" ? { hours } : {}),
    });
    if (attempt.current?.payload !== payload)
      attempt.current = {
        payload,
        id: crypto.randomUUID(),
        support: new Date(Date.now() + hours * 3600000).toISOString(),
      };
    try {
      await request(path, "POST", {
        ...body,
        ...(path === "/cooperative/pools"
          ? { support_until: attempt.current.support }
          : {}),
        ...(idempotent ? { idempotency_key: attempt.current.id } : {}),
      });
      attempt.current = null;
      setNotice(success);
      await load();
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="cooperative-section" aria-label="Fundos cooperativos">
      <h2>Capacidade financiada pela comunidade</h2>
      <p>
        Os créditos existentes financiam janelas completas. Os operadores
        recebem pelo tempo pronto observado; o consumo escolhido como
        cooperativo volta ao fundo para sustentar outras janelas.
      </p>
      <p className="section-footnote">
        Prévia privada em um computador. LAB_TU não é dinheiro nem ativo
        negociável. Este painel não demonstra renda independente ou
        sustentabilidade da rede.
      </p>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice-banner">
          {notice}
        </p>
      )}
      <details className="route-card">
        <summary>Criar plano de capacidade essencial</summary>
        <form
          className="route-availability-form"
          onSubmit={(e) => {
            e.preventDefault();
            void mutate(
              "/cooperative/pools",
              {
                name,
                groups: groups.map((g, i) => ({
                  key: `group-${i + 1}`,
                  route_ids: [g.route],
                  rate_microtu_per_second: g.rate,
                  duration_seconds: g.seconds,
                })),
              },
              "Plano criado. Contribua com créditos existentes antes de financiar uma janela.",
            );
          }}
        >
          <label>
            Nome do fundo
            <input
              value={name}
              maxLength={100}
              required
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Apoio operacional confirmado (horas)
            <input
              type="number"
              min={1}
              max={720}
              value={hours}
              required
              onChange={(e) => setHours(Number(e.target.value))}
            />
          </label>
          {groups.map((g, i) => (
            <fieldset className="coverage-wide cooperative-group" key={i}>
              <legend>Grupo essencial {i + 1}</legend>
              <label>
                Rota do grupo {i + 1}
                <select
                  value={g.route}
                  required
                  onChange={(e) =>
                    setGroups((old) =>
                      old.map((v, n) =>
                        n === i ? { ...v, route: e.target.value } : v,
                      ),
                    )
                  }
                >
                  <option value="">Escolha uma rota pronta</option>
                  {routes
                    .filter((r) => r.available)
                    .map((r) => (
                      <option value={r.id} key={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Preço da rota por segundo (microcréditos)
                <input
                  value={g.rate}
                  inputMode="numeric"
                  pattern="[1-9][0-9]*"
                  required
                  onChange={(e) =>
                    setGroups((old) =>
                      old.map((v, n) =>
                        n === i ? { ...v, rate: e.target.value } : v,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Duração de cada janela (segundos)
                <input
                  type="number"
                  min={30}
                  max={3600}
                  value={g.seconds}
                  required
                  onChange={(e) =>
                    setGroups((old) =>
                      old.map((v, n) =>
                        n === i ? { ...v, seconds: Number(e.target.value) } : v,
                      ),
                    )
                  }
                />
              </label>
              {i > 0 && (
                <button
                  type="button"
                  className="secondary compact"
                  onClick={() =>
                    setGroups((old) => old.filter((_, n) => n !== i))
                  }
                >
                  Remover grupo {i + 1}
                </button>
              )}
            </fieldset>
          ))}
          <p className="coverage-wide section-footnote">
            Um grupo representa uma rota útil. Grupos simultâneos precisam de
            capacidade física distinta. O plano calcula piso de 6 horas, meta de
            giro de 24 horas e reserva de 72 horas. Isso não promete
            funcionamento por esses períodos: cada janela exige seu próprio
            orçamento e o aceite dos operadores.
          </p>
          {groups.length < 4 && (
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setGroups((old) => [
                  ...old,
                  { route: "", rate: "100", seconds: 60 },
                ])
              }
            >
              Adicionar grupo
            </button>
          )}
          <button className="primary" disabled={busy}>
            Criar fundo cooperativo
          </button>
        </form>
      </details>
      {pools.length === 0 && (
        <p>Nenhum plano criado. Comece com uma rota completa já qualificada.</p>
      )}
      {pools.map((p) => (
        <PoolCard
          key={p.id}
          p={p}
          user={user}
          busy={busy}
          mutate={mutate}
          request={request}
          onChange={onChange}
        />
      ))}
    </section>
  );
}

function PoolCard({
  p,
  user,
  busy,
  mutate,
  request,
  onChange,
}: {
  p: CooperativePool;
  user: Props["user"];
  busy: boolean;
  request: Request;
  onChange: () => Promise<void>;
  mutate: (
    path: string,
    body: Record<string, unknown>,
    success: string,
    idempotent?: boolean,
  ) => Promise<void>;
}) {
  const [value, setValue] = useState("1000000"),
    [destination, setDestination] = useState("WORKING"),
    [consent, setConsent] = useState(false);
  const [group, setGroup] = useState(p.groups[0]?.group_key ?? ""),
    [source, setSource] = useState("WORKING"),
    [reason, setReason] = useState("");
  const manager = user.id === p.creator_id || user.role === "admin";
  return (
    <article className="route-card cooperative-card" data-pool-id={p.id}>
      <h3>{p.name}</h3>
      <p>{p.paused ? "Pausado" : (stateNames[p.state] ?? p.state)}</p>
      <div className="coverage-stats">
        <p>
          Capital de giro<strong>{tu(p.balances.working)}</strong>
          <small>
            Piso {tu(p.targets.floor)} · meta {tu(p.targets.working)}
          </small>
        </p>
        <p>
          Reserva protegida<strong>{tu(p.balances.reserve)}</strong>
          <small>Meta {tu(p.targets.reserve)}</small>
        </p>
        <p>
          Já comprometido<strong>{tu(p.balances.held)}</strong>
        </p>
        <p>
          Retirado de circulação<strong>{tu(p.balances.burned)}</strong>
        </p>
      </div>
      <p className="section-footnote">
        Consumo reciclado líquido: {tu(p.metrics.recycled_microtu)}. Custo de
        janelas normais: {tu(p.metrics.normal_readiness_cost_microtu)}. São
        contadores locais; pagamentos entre contas da mesma pessoa não comprovam
        uma economia sustentável.
      </p>
      <p className="section-footnote">
        Apoio operacional declarado até{" "}
        {new Date(p.support_until).toLocaleString("pt-BR")}. Recuperação exige
        24 horas contínuas de observação saudável antes do estado normal.
        Expansão econômica automática ainda não foi qualificada.
      </p>
      <details>
        <summary>Contribuir com créditos existentes</summary>
        <form
          className="route-availability-form"
          onSubmit={(e) => {
            e.preventDefault();
            void mutate(
              `/cooperative/pools/${p.id}/fund`,
              {
                destination,
                amount_microtu: value,
                policy_sha256: p.policy_sha256,
                consent: "COMMITTED_LAB_CREDITS_NO_REDEMPTION",
              },
              "Contribuição registrada uma vez no fundo.",
            );
          }}
        >
          <label>
            Destino da contribuição
            <select
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            >
              <option value="WORKING">Capital de giro</option>
              <option value="RESERVE">Reserva protegida</option>
            </select>
          </label>
          <label>
            Contribuição em microcréditos
            <input
              inputMode="numeric"
              pattern="[1-9][0-9]*"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
          </label>
          <label className="coverage-wide cooperative-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              required
            />
            Comprometo esses créditos com o plano. Não há saque pessoal,
            rendimento ou resgate em dinheiro. 1 LAB_TU = 1.000.000
            microcréditos.
          </label>
          <button className="primary" disabled={busy || !consent || p.paused}>
            Contribuir para o fundo
          </button>
        </form>
      </details>
      {manager && (
        <details>
          <summary>Financiar próxima janela</summary>
          <form
            className="route-availability-form"
            onSubmit={(e) => {
              e.preventDefault();
              void mutate(
                `/cooperative/pools/${p.id}/windows`,
                {
                  group_key: group,
                  source,
                  reason,
                },
                "Janela financiada. Em Meus nós, cada operador deve conferir e aceitar os termos cooperativos.",
              );
            }}
          >
            <label>
              Grupo a manter
              <select value={group} onChange={(e) => setGroup(e.target.value)}>
                {p.groups.map((g) => (
                  <option key={g.group_key} value={g.group_key}>
                    {g.group_key} · {g.model_id} · {g.duration_seconds}s
                  </option>
                ))}
              </select>
            </label>
            <label>
              Origem do orçamento
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="WORKING">Capital de giro</option>
                <option value="RESERVE">
                  Contingência essencial da reserva
                </option>
              </select>
            </label>
            <label className="coverage-wide">
              Motivo da janela
              <input
                minLength={20}
                maxLength={500}
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <p className="coverage-wide section-footnote">
              Uma única janela por grupo. A reserva só pode ser usada se o giro
              não cobrir a rota inteira; cada uso gera um incidente registrado.
              Créditos não utilizados retornam à conta original. Contratos
              aceitos seguem até o prazo, mesmo com uma pausa do plano.
            </p>
            <button className="primary" disabled={busy || p.paused}>
              Financiar janela cooperativa
            </button>
          </form>
        </details>
      )}
      <RenewalsPanel
        pool={p}
        user={user}
        request={request}
        onChange={onChange}
      />
      <details>
        <summary>Consumo e destino dos créditos</summary>
        <p>
          O consumo repõe primeiro o piso de giro, depois a reserva, depois a
          meta de giro. O excedente sai de circulação. Operadores recebem
          separadamente pela janela aceita, sem a divisão 80/20 nas sessões
          cooperativas.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sessão</th>
                <th>Cobrado</th>
                <th>Giro / reserva / retirado</th>
                <th>Devolução</th>
              </tr>
            </thead>
            <tbody>
              {p.recent_settlements.map((s) => (
                <tr key={s.session_id}>
                  <td>{s.session_id.slice(0, 8)}</td>
                  <td>{tu(s.charge_microtu)}</td>
                  <td>
                    {tu(s.working_microtu)} / {tu(s.reserve_microtu)} /{" "}
                    {tu(s.burned_microtu)}
                  </td>
                  <td>
                    {s.refunded ? (
                      "Devolvido"
                    ) : user.role === "admin" ? (
                      <RefundButton
                        busy={busy}
                        session={s.session_id}
                        mutate={mutate}
                      />
                    ) : (
                      "Sem devolução"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="section-footnote">
          Uma devolução aprovada precisa recuperar exatamente os créditos das
          contas originais. Valores presos em contratos não podem ser usados; se
          faltar saldo livre, a aprovação é rejeitada até a recomposição.
        </p>
      </details>
      <p className="route-hash">
        Plano: <code>{p.policy_sha256}</code>
      </p>
      {manager && (
        <div className="route-actions">
          <button
            className="secondary compact"
            disabled={busy}
            onClick={() =>
              void mutate(
                `/cooperative/pools/${p.id}/manage`,
                {
                  paused: !p.paused,
                  reason: p.paused
                    ? "Responsible operator resumed this private plan"
                    : "Responsible operator paused new private commitments",
                },
                p.paused
                  ? "Plano retomado."
                  : "Novas promessas pausadas; contratos existentes preservados.",
                false,
              )
            }
          >
            {p.paused ? "Retomar plano" : "Pausar novas promessas"}
          </button>
          <button
            className="secondary compact"
            disabled={busy}
            onClick={() =>
              void mutate(
                `/cooperative/pools/${p.id}/manage`,
                {
                  paused: p.paused,
                  support_until: new Date(Date.now() + 3600000).toISOString(),
                  reason:
                    "Responsible operator confirms one more hour of local operational support",
                },
                "Apoio operacional confirmado por mais uma hora. Prazos já aceitos não mudam.",
                false,
              )
            }
          >
            Confirmar mais 1h de apoio local
          </button>
        </div>
      )}
    </article>
  );
}
function RefundButton({
  busy,
  session,
  mutate,
}: {
  busy: boolean;
  session: string;
  mutate: (
    path: string,
    body: Record<string, unknown>,
    success: string,
    idempotent?: boolean,
  ) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  return (
    <details>
      <summary>Revisar devolução</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void mutate(
            `/cooperative/refunds/${session}`,
            { reason },
            "Devolução financiada nas contas originais e registrada uma vez.",
            false,
          );
        }}
      >
        <label>
          Motivo verificado da devolução
          <input
            required
            minLength={20}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button className="secondary compact" disabled={busy}>
          Aprovar devolução integral
        </button>
      </form>
    </details>
  );
}
