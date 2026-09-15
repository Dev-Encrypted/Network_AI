// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AvailabilityPanel } from "./availability";
import { RoutesPanel } from "./routes";
import { CooperativePanel, type CooperativePool } from "./cooperative";
import { RouteAvailabilityPanel } from "./route-availability";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowUp,
  Check,
  ChevronRight,
  CircleHelp,
  Clipboard,
  Cpu,
  KeyRound,
  Layers3,
  LogOut,
  MessageSquare,
  Network,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Square,
  Wallet,
  X,
} from "lucide-react";
import {
  formatTU,
  quoteMaximum,
  type ModelManifest,
} from "@network-ai/contracts";

type User = {
  id: string;
  login: string;
  name: string;
  role: "admin" | "member";
};
type Model = {
  id: string;
  manifest: ModelManifest;
  state: string;
  available: boolean;
  ready_nodes: number;
  qualification_note: string;
};
type Node = {
  id: string;
  name: string;
  state: string;
  desired_state: string;
  online: boolean;
  domain_name: string;
  slots: number;
  model_id: string;
  node_kind: string;
  inventory: { gpu_name?: string };
  last_seen: string;
};
type Session = {
  cooperative_pool_id?: string | null;
  coverage_lease_id?: string | null;
  id: string;
  state: string;
  model_id: string;
  hold_microtu: string;
  charged_microtu: string;
  billing_state: string;
  created_at: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  error_code: string | null;
  route_id?: string | null;
  participants?: {
    node_id: string;
    role: string;
    ordinal: number;
    share_bps: number;
    paid_microtu: string;
    receipt?: { state: string; completed_commands: number } | null;
  }[];
  events?: {
    sequence: string;
    kind: string;
    created_at: string;
    metadata: Record<string, unknown>;
  }[];
};
type WalletData = {
  accounts: { kind: string; balance: string }[];
  journal: {
    id: string;
    kind: string;
    account_id: string;
    amount: string;
    created_at: string;
    metadata: Record<string, unknown>;
  }[];
};
type Key = {
  id: string;
  label: string;
  prefix: string;
  revoked_at: string | null;
};
type ChatMessage = { role: "user" | "assistant"; content: string };
type View =
  | "chat"
  | "models"
  | "nodes"
  | "sessions"
  | "wallet"
  | "keys"
  | "admin"
  | "cooperative";
const views = [
  { id: "chat", label: "Conversar", icon: MessageSquare },
  { id: "models", label: "Modelos", icon: Layers3 },
  { id: "nodes", label: "Meus nós", icon: Network },
  { id: "sessions", label: "Sessões", icon: RefreshCw },
  { id: "wallet", label: "Créditos", icon: Wallet },
  { id: "cooperative", label: "Cooperação", icon: Network },
  { id: "keys", label: "Acesso à API", icon: KeyRound },
] as const;
const stateLabel: Record<string, string> = {
  QUEUED: "Na fila",
  PREPARING: "Preparando",
  AUTHORIZED: "Autorizada",
  RUNNING: "Em execução",
  CANCELLING: "Cancelando",
  COMPLETED: "Concluída",
  FAILED: "Falhou",
  CANCELLED: "Cancelada",
  INTERRUPTED: "Interrompida",
  READY: "Pronto",
  PAUSED: "Pausado",
  OFFLINE: "Offline",
  VALIDATING: "Verificando",
  REVOKED: "Revogado",
  DRAINING: "Finalizando",
  FAULTED: "Com falha",
  LOCAL_PREVIEW: "Teste local",
  CANDIDATE: "Em avaliação",
  HELD: "Reservado",
  SETTLED: "Liquidado",
  REFUNDED: "Devolvido",
  DISPUTED: "Em revisão",
};
const time = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
const amount = (value: string) =>
  formatTU(BigInt(value) < 0n ? -BigInt(value) : BigInt(value));
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      value.error?.message ?? "Não foi possível concluir a operação.",
    );
  return value as T;
}
function Badge({ state }: { state: string }) {
  return (
    <span
      className={`badge ${["COMPLETED", "READY", "LOCAL_PREVIEW", "SETTLED"].includes(state) ? "good" : ["FAILED", "INTERRUPTED", "DISPUTED", "REVOKED"].includes(state) ? "warn" : ""}`}
    >
      <i />
      {stateLabel[state] ?? state}
    </span>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-symbol">
        <Network size={22} />
      </span>
      <span>
        NETWORK<span className="brand-ai">AI</span>
        <small>COMPUTAÇÃO COMPARTILHADA</small>
      </span>
    </div>
  );
}
export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("chat");
  const [models, setModels] = useState<Model[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [wallet, setWallet] = useState<WalletData>({
    accounts: [],
    journal: [],
  });
  const [pools, setPools] = useState<CooperativePool[]>([]);
  const [cooperativePool, setCooperativePool] = useState("");
  const [keys, setKeys] = useState<Key[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState("");
  const [temporaryLimit, setTemporaryLimit] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [activeId, setActiveId] = useState("");
  const [phase, setPhase] = useState("");
  const [maxTokens, setMaxTokens] = useState(256);
  const [detail, setDetail] = useState<Session | null>(null);
  const [newToken, setNewToken] = useState("");
  const [manifestOpen, setManifestOpen] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const authEpoch = useRef(0);
  const bottom = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let live = true;
    setTemporaryLimit(null);
    if (!user || !selected) return;
    const load = async () => {
      try {
        const value = await api<{ temporary_session_limit: number }>(
          `/capacity/${selected}`,
        );
        if (live) setTemporaryLimit(value.temporary_session_limit);
      } catch {
        if (live) setTemporaryLimit(null);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [user, selected]);
  const refresh = useCallback(async () => {
    const epoch = authEpoch.current;
    try {
      const [m, n, s, w, k, c] = await Promise.all([
        api<{ data: Model[] }>("/models"),
        api<{ data: Node[] }>("/nodes"),
        api<{ data: Session[] }>("/sessions"),
        api<WalletData>("/wallet"),
        api<{ data: Key[] }>("/keys"),
        api<{ data: CooperativePool[] }>("/cooperative/pools"),
      ]);
      if (epoch !== authEpoch.current) return;
      setModels(m.data);
      setNodes(n.data);
      setSessions(s.data);
      setWallet(w);
      setKeys(k.data);
      setPools(c.data);
      setSelected(
        (old) =>
          old ||
          m.data.find((item) => item.available)?.id ||
          m.data[0]?.id ||
          "",
      );
    } catch (error) {
      if (epoch === authEpoch.current) throw error;
    }
  }, []);
  useEffect(() => {
    void api<User>("/me")
      .then(setUser)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!user) return;
    void refresh().catch((err) => setError(err.message));
    const interval = setInterval(
      () => void refresh().catch(() => undefined),
      5000,
    );
    return () => clearInterval(interval);
  }, [user, refresh]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages, generating]);
  const available =
    wallet.accounts.find((item) => item.kind === "AVAILABLE")?.balance ?? "0";
  const held = wallet.accounts
    .filter((item) => ["HELD", "LEASE_ESCROW"].includes(item.kind))
    .reduce((sum, item) => sum + BigInt(item.balance), 0n)
    .toString();
  const model = models.find((item) => item.id === selected);
  const maximumReservation = model
    ? formatTU(
        quoteMaximum(
          model.manifest,
          Math.min(maxTokens, model.manifest.max_output_tokens),
        ),
      )
    : "—";
  useEffect(() => {
    if (model)
      setMaxTokens((value) =>
        Math.min(value, model.manifest.max_output_tokens),
      );
  }, [model]);
  async function signOut() {
    try {
      authEpoch.current++;
      await cancel();
      await api("/auth/logout", "POST", {});
      setUser(null);
      setMessages([]);
      setModels([]);
      setNodes([]);
      setSessions([]);
      setKeys([]);
      setPools([]);
      setCooperativePool("");
      setWallet({ accounts: [], journal: [] });
      setDetail(null);
      setSelected("");
      setPrompt("");
      setActiveId("");
      setPhase("");
      setView("chat");
      setGenerating(false);
      setNewToken("");
      setError("");
      setNotice("");
    } catch (err) {
      setError((err as Error).message);
    }
  }
  async function act(work: () => Promise<void>) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await work();
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function login(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await api<{ user: User }>("/auth/login", "POST", {
        login: data.get("login"),
        password: data.get("password"),
      });
      setUser(result.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function send(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prompt.trim() || generating) return;
    const epoch = authEpoch.current;
    const controller = new AbortController();
    setError("");
    const conversation: ChatMessage[] = [
      ...messages,
      { role: "user", content: prompt.trim() },
    ];
    setMessages([...conversation, { role: "assistant", content: "" }]);
    setPrompt("");
    setGenerating(true);
    setPhase("Reservando créditos");
    abort.current = controller;
    let sessionId = "";
    let done = false;
    let streamError = "";
    try {
      const quote = await api<{ id: string }>("/quotes", "POST", {
        model: selected,
        max_output_tokens: maxTokens,
        ...(cooperativePool ? { cooperative_pool_id: cooperativePool } : {}),
      });
      if (epoch !== authEpoch.current) return;
      const response = await fetch("/inference/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Quote-Id": quote.id,
          "Idempotency-Key": crypto.randomUUID(),
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: selected,
          messages: conversation,
          stream: true,
          max_tokens: maxTokens,
          temperature: 0.7,
        }),
      });
      if (!response.ok) {
        const value = await response.json();
        throw new Error(value.error?.message ?? "Falha ao iniciar a sessão.");
      }
      if (epoch !== authEpoch.current) {
        await response.body?.cancel();
        return;
      }
      sessionId = response.headers.get("x-network-ai-session-id") ?? "";
      setActiveId(sessionId);
      setPhase("Aguardando nó disponível");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Resposta vazia.");
      const decoder = new TextDecoder();
      let buffer = "";
      let output = "";
      for (;;) {
        const chunk = await reader.read();
        if (epoch !== authEpoch.current) {
          await reader.cancel();
          return;
        }
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        let boundary;
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = frame
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (!data) continue;
          if (data === "[DONE]") {
            done = true;
            continue;
          }
          const value = JSON.parse(data);
          if (value.error) {
            streamError = value.error.message;
            continue;
          }
          const text = value.choices?.[0]?.delta?.content;
          if (typeof text === "string" && text) {
            output += text;
            setPhase("Gerando resposta");
            setMessages([
              ...conversation,
              { role: "assistant", content: output },
            ]);
          }
          if (value.receipt_pending)
            setPhase("Recibo aguardando sincronização");
        }
      }
      if (streamError) throw new Error(streamError);
      if (!done)
        throw new Error(
          "O fluxo terminou antes da confirmação. Confira a sessão.",
        );
      setPhase("Resposta concluída");
    } catch (err) {
      if (epoch !== authEpoch.current) return;
      if ((err as Error).name === "AbortError") {
        setPhase("Cancelamento solicitado");
      } else {
        setError((err as Error).message);
        setPhase("Sessão interrompida");
      }
    } finally {
      if (epoch === authEpoch.current) {
        setGenerating(false);
        abort.current = null;
        await refresh().catch(() => undefined);
      }
    }
  }
  async function cancel() {
    if (activeId)
      await api(`/sessions/${activeId}/cancel`, "POST", {}).catch(
        () => undefined,
      );
    abort.current?.abort();
  }
  if (loading)
    return (
      <main className="loading">
        <Brand />
        <p>Conectando ao ambiente…</p>
      </main>
    );
  if (!user)
    return (
      <main className="login-page">
        <section className="login-story">
          <Brand />
          <div>
            <span className="eyebrow">
              REDE ABERTA. RECURSOS COMPARTILHADOS.
            </span>
            <h1>
              A inteligência
              <br />
              ganha espaço
              <br />
              quando é compartilhada.
            </h1>
            <p>
              Use modelos, conecte sua capacidade e acompanhe cada execução em
              um só lugar.
            </p>
            <div className="network-drawing" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <span />
              <span />
            </div>
          </div>
          <footer>
            Um projeto de <strong>Dev-Encrypted</strong>
            <span>v0.11 · Ambiente privado</span>
          </footer>
        </section>
        <section className="login-side">
          <form onSubmit={login}>
            <span className="section-label">BEM-VINDO À NETWORK AI</span>
            <h2>Entre no seu ambiente</h2>
            <p className="muted">Acesso ao laboratório de inferência.</p>
            <label>
              Usuário
              <input
                name="login"
                autoComplete="username"
                required
                autoFocus
                placeholder="Seu usuário"
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                placeholder="Sua senha"
              />
            </label>
            {error && (
              <p className="alert error" role="alert">
                {error}
              </p>
            )}
            <button className="primary full" disabled={busy}>
              {busy ? "Entrando…" : "Entrar"}
              <ArrowUpRight size={18} />
            </button>
            <p className="login-help">
              <ShieldCheck size={17} />O acesso é provisionado pelo
              administrador. As credenciais locais ficam no arquivo privado
              indicado pelo inicializador.
            </p>
          </form>
          <p className="private-note">
            Créditos de teste, sem valor de saque.
            <br />
            Este ambiente ainda não recebe compradores externos.
          </p>
        </section>
      </main>
    );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Ir para o conteúdo
      </a>
      <aside className="sidebar">
        <Brand />
        <span className="workspace-label">SEU ESPAÇO</span>
        <nav aria-label="Navegação principal">
          {views.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "active" : ""}
              onClick={() => {
                setView(item.id);
                setError("");
                setNotice("");
              }}
              aria-current={view === item.id ? "page" : undefined}
            >
              <item.icon size={19} />
              {item.label}
              {item.id === "chat" && <ChevronRight size={15} />}
            </button>
          ))}
          {user.role === "admin" && (
            <button
              className={view === "admin" ? "active" : ""}
              onClick={() => setView("admin")}
            >
              <Settings2 size={19} />
              Administração
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="environment">
            <span className="pulse-dot" />
            <span>
              Laboratório privado<small>1 coordenador · unidade LAB_TU</small>
            </span>
          </div>
          <a
            href="https://github.com/Dev-Encrypted/Network_AI"
            target="_blank"
            rel="noreferrer"
          >
            <CircleHelp size={17} />
            Projeto e documentação
            <ArrowUpRight size={14} />
          </a>
          <div className="profile">
            <span className="avatar">
              {user.name.slice(0, 2).toUpperCase()}
            </span>
            <span>
              {user.name}
              <small>
                {user.role === "admin" ? "Administrador" : "Membro"}
              </small>
            </span>
            <button
              aria-label="Sair"
              className="icon-button"
              onClick={() => void signOut()}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            <span className="breadcrumb">Workspace</span>
            <ChevronRight size={14} />
            {view === "admin"
              ? "Administração"
              : views.find((item) => item.id === view)?.label}
          </span>
          <div className="topbar-balance">
            <Wallet size={16} />
            <strong>{formatTU(available)}</strong>
            <span>LAB_TU disponíveis</span>
            <button
              className="icon-button mobile-logout"
              aria-label="Sair no celular"
              onClick={() => void signOut()}
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <main
          id="main"
          className={`main-content ${view === "chat" ? "chat-page" : ""}`}
        >
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button
                aria-label="Fechar erro"
                className="icon-button"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              {notice}
            </div>
          )}
          {view === "chat" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">PLAYGROUND</span>
                  <h1>Uma conversa. Toda uma rede.</h1>
                  <p>
                    Escolha um modelo e coloque a capacidade compartilhada para
                    trabalhar.
                  </p>
                </div>
                <button
                  className="secondary"
                  disabled={generating || !messages.length}
                  onClick={() => {
                    setMessages([]);
                    setActiveId("");
                    setPhase("");
                  }}
                >
                  <Plus size={16} />
                  Nova conversa
                </button>
              </div>
              <div className="chat-grid">
                <section className="chat-card" aria-label="Conversa">
                  <div className="chat-toolbar">
                    <span className="model-icon">
                      <Cpu size={19} />
                    </span>
                    <label className="model-choice">
                      <span>Modelo de inferência</span>
                      <select
                        aria-label="Modelo de inferência"
                        disabled={generating}
                        value={selected}
                        onChange={(event) => {
                          setSelected(event.target.value);
                          setCooperativePool("");
                        }}
                      >
                        {models.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.manifest.display_name}
                            {item.available ? "" : " · indisponível"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Badge state={model?.available ? "READY" : "OFFLINE"} />
                  </div>
                  <label className="cooperative-choice">
                    Destino do consumo
                    <select
                      aria-label="Destino do consumo"
                      value={cooperativePool}
                      disabled={generating}
                      onChange={(e) => setCooperativePool(e.target.value)}
                    >
                      <option value="">
                        Remuneração por inferência (80/20)
                      </option>
                      {pools
                        .filter(
                          (p) =>
                            !p.paused &&
                            new Date(p.support_until).getTime() > Date.now() &&
                            p.groups.some((g) => g.model_id === selected),
                        )
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            Fundo cooperativo: {p.name}
                          </option>
                        ))}
                    </select>
                    {cooperativePool && (
                      <small>
                        O consumo retorna ao fundo. Operadores recebem pela
                        janela contratada; a sessão só começa com cobertura
                        aceita e completa. Não há prioridade extra na fila.
                      </small>
                    )}
                  </label>
                  <details className="mobile-cost">
                    <summary>
                      Reserva máxima: {maximumReservation} LAB_TU
                    </summary>
                    <p>
                      A reserva considera o teto de contexto. O valor não
                      utilizado volta ao seu saldo.
                    </p>
                    <label>
                      Limite de saída
                      <input
                        type="number"
                        min={1}
                        max={model?.manifest.max_output_tokens ?? 512}
                        value={maxTokens}
                        disabled={generating}
                        onChange={(event) =>
                          setMaxTokens(
                            Math.max(
                              1,
                              Math.min(
                                Number(event.target.value),
                                model?.manifest.max_output_tokens ?? 512,
                              ),
                            ),
                          )
                        }
                      />
                    </label>
                  </details>
                  {temporaryLimit !== null && (
                    <p className="section-footnote quota-note">
                      Até {temporaryLimit} solicitações abertas neste modelo por
                      conta, conforme a demanda. Execuções já aceitas são
                      preservadas.
                    </p>
                  )}
                  <div
                    className="messages"
                    aria-live="polite"
                    aria-relevant="additions text"
                  >
                    {messages.length === 0 ? (
                      <div className="chat-empty">
                        <div className="empty-network">
                          <Network size={34} />
                        </div>
                        <h2>O que vamos explorar?</h2>
                        <p>
                          Comece uma conversa com o modelo disponível na rede.
                        </p>
                        <div className="suggestions">
                          {[
                            "Explique redes neurais em termos simples.",
                            "Me ajude a estruturar uma ideia de projeto.",
                            "Compare inferência local e distribuída.",
                          ].map((text) => (
                            <button key={text} onClick={() => setPrompt(text)}>
                              {text}
                              <ArrowUpRight size={16} />
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      messages.map((message, index) => (
                        <article
                          key={index}
                          className={`message ${message.role}`}
                        >
                          <span className="message-avatar">
                            {message.role === "user" ? (
                              user.name.slice(0, 1)
                            ) : (
                              <Network size={18} />
                            )}
                          </span>
                          <div>
                            <strong>
                              {message.role === "user" ? "Você" : "NETWORK AI"}
                            </strong>
                            <p>
                              {message.content ||
                                (generating
                                  ? "Aguardando os primeiros tokens…"
                                  : "Nenhum conteúdo foi recebido.")}
                            </p>
                          </div>
                        </article>
                      ))
                    )}
                    <div ref={bottom} />
                  </div>
                  <form className="composer" onSubmit={send}>
                    <label className="sr-only" htmlFor="prompt">
                      Sua mensagem
                    </label>
                    <textarea
                      id="prompt"
                      placeholder="Escreva sua mensagem…"
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      disabled={generating}
                      rows={2}
                      maxLength={6000}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          event.currentTarget.form?.requestSubmit();
                        }
                      }}
                    />
                    <div className="composer-bottom">
                      <span>
                        {generating ? (
                          <>
                            <i className="pulse-dot" />
                            {phase}
                          </>
                        ) : (
                          <>
                            Enter para enviar{" "}
                            <span className="separator">·</span> Shift + Enter
                            para nova linha
                          </>
                        )}
                      </span>
                      {generating ? (
                        <button
                          type="button"
                          className="stop-button"
                          onClick={() => void cancel()}
                        >
                          <Square size={14} />
                          Interromper
                        </button>
                      ) : (
                        <button
                          className="send-button"
                          aria-label="Enviar mensagem"
                          disabled={!prompt.trim() || !model?.available}
                        >
                          <ArrowUp size={20} />
                        </button>
                      )}
                    </div>
                  </form>
                  <p className="chat-disclaimer">
                    Confira as respostas. A IA pode cometer erros. A conversa
                    fica apenas nesta aba.
                  </p>
                </section>
                <aside className="route-panel">
                  <span className="section-label">ESTA EXECUÇÃO</span>
                  <h3>Transparência a cada token</h3>
                  <div className="route-line">
                    <i />
                    <div>
                      <strong>Sua solicitação</strong>
                      <small>Limite e reserva definidos antes do envio</small>
                    </div>
                  </div>
                  <div className="route-line">
                    <i />
                    <div>
                      <strong>{model?.ready_nodes ?? 0} nó disponível</strong>
                      <small>Admissão pela capacidade física</small>
                    </div>
                  </div>
                  <div className="route-line">
                    <i />
                    <div>
                      <strong>Recibo da execução</strong>
                      <small>Uso medido pelo servidor do modelo</small>
                    </div>
                  </div>
                  <div className="rule" />
                  <label className="range-label">
                    Limite de saída<strong>{maxTokens} tokens</strong>
                    <input
                      aria-label="Limite de saída"
                      type="range"
                      min={64}
                      max={model?.manifest.max_output_tokens ?? 512}
                      step={64}
                      value={maxTokens}
                      disabled={generating}
                      onChange={(event) =>
                        setMaxTokens(Number(event.target.value))
                      }
                    />
                  </label>
                  <dl className="rate-list">
                    <div>
                      <dt>Reserva máxima</dt>
                      <dd>{maximumReservation}</dd>
                    </div>
                    <div>
                      <dt>Entrada / 1 mil tokens</dt>
                      <dd>
                        {formatTU(
                          (BigInt(model?.manifest.input_rate_microtu ?? "0") *
                            1000n) /
                            BigInt(model?.manifest.rate_denominator ?? 1),
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Saída / 1 mil tokens</dt>
                      <dd>
                        {formatTU(
                          (BigInt(model?.manifest.output_rate_microtu ?? "0") *
                            1000n) /
                            BigInt(model?.manifest.rate_denominator ?? 1),
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Unidade</dt>
                      <dd>LAB_TU</dd>
                    </div>
                  </dl>
                  <p className="callout">
                    <ShieldCheck size={17} />
                    Reservamos o teto da cotação. O excedente é devolvido após o
                    recibo. Falhas e cancelamentos são gratuitos neste
                    laboratório.
                  </p>
                  {activeId && (
                    <button
                      className="text-button"
                      onClick={() =>
                        void act(async () => {
                          setDetail(
                            await api<Session>(`/sessions/${activeId}`),
                          );
                          setView("sessions");
                        })
                      }
                    >
                      Ver esta sessão
                      <ArrowUpRight size={15} />
                    </button>
                  )}
                </aside>
              </div>
            </>
          )}
          {view === "models" && (
            <>
              <Heading
                eyebrow="CATÁLOGO"
                title="Modelos para cada tarefa"
                text="A disponibilidade acompanha os nós prontos, não apenas os arquivos publicados."
                action={
                  <button
                    className="primary"
                    onClick={() => setManifestOpen(!manifestOpen)}
                  >
                    <Plus size={16} />
                    Publicar modelo
                  </button>
                }
              />
              {manifestOpen && (
                <ManifestForm
                  busy={busy}
                  onSubmit={(body) =>
                    void act(async () => {
                      await api("/models", "POST", body);
                      setManifestOpen(false);
                      setNotice(
                        "Modelo publicado como candidato. A qualificação local deve ser registrada por um administrador.",
                      );
                    })
                  }
                />
              )}
              <div className="catalog">
                {models.map((item) => (
                  <article key={item.id} className="model-card">
                    <div className="model-card-top">
                      <span className="model-icon large">
                        <Cpu size={25} />
                      </span>
                      <Badge state={item.state} />
                    </div>
                    <h2>{item.manifest.display_name}</h2>
                    <p>{item.manifest.description}</p>
                    <div className="model-tags">
                      <span>Texto</span>
                      <span>
                        {item.manifest.max_context_tokens.toLocaleString(
                          "pt-BR",
                        )}{" "}
                        de contexto
                      </span>
                      <span>{item.ready_nodes} nó pronto</span>
                    </div>
                    <dl className="model-specs">
                      <div>
                        <dt>Revisão</dt>
                        <dd>{item.manifest.revision}</dd>
                      </div>
                      <div>
                        <dt>Licença declarada</dt>
                        <dd>{item.manifest.license_id}</dd>
                      </div>
                    </dl>
                    <p className="qualification">
                      {item.qualification_note ||
                        "Aguardando evidência de compatibilidade, origem e licença."}
                    </p>
                    <button
                      className="secondary full"
                      disabled={!item.available}
                      onClick={() => {
                        setSelected(item.id);
                        setView("chat");
                      }}
                    >
                      {item.available
                        ? "Conversar com este modelo"
                        : "Aguardando disponibilidade"}
                      <ArrowUpRight size={17} />
                    </button>
                  </article>
                ))}
              </div>
            </>
          )}
          {view === "nodes" && (
            <>
              <Heading
                eyebrow="CONTRIBUA COM A REDE"
                title="Sua capacidade, conectada"
                text="Cada domínio representa um recurso físico. Nós no mesmo domínio compartilham o limite de execução."
              />
              <div className="info-strip">
                <Network size={20} />
                <p>
                  O agente conecta um servidor de modelos já instalado. Nenhum
                  peso ou código remoto é baixado automaticamente.
                </p>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nó / recurso</th>
                      <th>Modelo</th>
                      <th>Domínio físico</th>
                      <th>Estado</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nodes.map((node) => (
                      <tr key={node.id}>
                        <td>
                          <strong>{node.name}</strong>
                          <small>
                            {node.inventory.gpu_name ??
                              "Inventário não informado"}
                          </small>
                        </td>
                        <td className="mono">{node.model_id}</td>
                        <td>
                          {node.domain_name}
                          <small>
                            {node.slots} execução simultânea por domínio
                          </small>
                        </td>
                        <td>
                          <Badge state={node.online ? node.state : "OFFLINE"} />
                        </td>
                        <td>
                          <button
                            className="secondary compact"
                            disabled={busy || node.desired_state === "REVOKED"}
                            onClick={() =>
                              void act(async () => {
                                await api(`/nodes/${node.id}/state`, "POST", {
                                  state:
                                    node.desired_state === "PAUSED"
                                      ? "READY"
                                      : "PAUSED",
                                });
                              })
                            }
                          >
                            {node.desired_state === "PAUSED" ? (
                              <Play size={14} />
                            ) : (
                              <Pause size={14} />
                            )}{" "}
                            {node.desired_state === "PAUSED"
                              ? "Retomar"
                              : "Pausar"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {nodes.length === 0 && (
                  <Empty text="Você ainda não tem nós. Solicite um convite ao administrador para conectar seu agente." />
                )}
              </div>
              <p className="section-footnote">
                Pausar impede novas admissões e permite que uma execução em
                andamento termine. O inventário de GPU é uma declaração local,
                não uma prova independente.
              </p>
              <AvailabilityPanel
                user={user}
                nodes={nodes.filter((n) => n.node_kind === "INFERENCE")}
                request={api}
                onChange={refresh}
              />
              <RoutesPanel
                user={user}
                nodes={nodes}
                request={api}
                onChange={refresh}
              />
              <RouteAvailabilityPanel
                user={user}
                request={api}
                onChange={refresh}
              />
            </>
          )}
          {view === "sessions" && (
            <>
              <Heading
                eyebrow="HISTÓRICO DE EXECUÇÃO"
                title="Cada sessão tem um recibo"
                text="Metadados e valores ficam registrados. Prompts e respostas não são armazenados no histórico."
              />
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Sessão / data</th>
                      <th>Modelo</th>
                      <th>Estado</th>
                      <th>Tokens</th>
                      <th>Cobrado</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => (
                      <tr key={session.id}>
                        <td>
                          <strong className="mono">
                            {session.id.slice(0, 8)}
                          </strong>
                          <small>{time(session.created_at)}</small>
                        </td>
                        <td>{session.model_id}</td>
                        <td>
                          <Badge state={session.state} />
                        </td>
                        <td>
                          {session.prompt_tokens === null
                            ? "—"
                            : `${session.prompt_tokens} / ${session.completion_tokens}`}
                        </td>
                        <td className="mono">
                          {formatTU(session.charged_microtu)}
                          <small>LAB_TU</small>
                        </td>
                        <td>
                          <button
                            className="icon-button"
                            aria-label={`Ver sessão ${session.id.slice(0, 8)}`}
                            onClick={() =>
                              void act(async () =>
                                setDetail(
                                  await api<Session>(`/sessions/${session.id}`),
                                ),
                              )
                            }
                          >
                            <ArrowUpRight size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!sessions.length && (
                  <Empty text="Sua primeira sessão aparecerá aqui quando você enviar uma mensagem." />
                )}
              </div>
              {detail && (
                <section className="detail-panel">
                  <div className="section-top">
                    <h2>Detalhes da sessão</h2>
                    <button
                      className="icon-button"
                      aria-label="Fechar detalhes"
                      onClick={() => setDetail(null)}
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <code>{detail.id}</code>
                  <div className="detail-values">
                    <div>
                      Execução
                      <Badge state={detail.state} />
                    </div>
                    <div>
                      Reserva
                      <strong>{formatTU(detail.hold_microtu)} LAB_TU</strong>
                    </div>
                    <div>
                      Liquidação
                      <Badge state={detail.billing_state} />
                    </div>
                  </div>
                  {detail.error_code && (
                    <p className="muted">
                      Motivo: <code>{detail.error_code}</code>
                    </p>
                  )}
                  {!!detail.participants?.length && (
                    <div className="table-wrap">
                      <table aria-label="Divisão da sessão">
                        <thead>
                          <tr>
                            <th>Participante</th>
                            <th>Parte dos operadores</th>
                            <th>Recibo</th>
                            <th>Pago em LAB_TU</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.participants.map((p) => (
                            <tr key={p.node_id}>
                              <td>
                                {p.role === "ROOT"
                                  ? "Nó principal"
                                  : `Etapa ${p.ordinal}`}
                              </td>
                              <td>{p.share_bps / 100}%</td>
                              <td>
                                {p.role === "ROOT"
                                  ? "Uso do modelo"
                                  : p.receipt
                                    ? `${stateLabel[p.receipt.state] ?? p.receipt.state} · ${p.receipt.completed_commands} comandos`
                                    : "Aguardando"}
                              </td>
                              <td>{formatTU(p.paid_microtu)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {detail.cooperative_pool_id && (
                    <p className="section-footnote">
                      Consumo cooperativo. Os valores de inferência por etapa
                      são zero porque a remuneração vem da janela de prontidão
                      aceita. Consulte o fundo em Cooperação e a janela em Meus
                      nós.
                    </p>
                  )}
                  <ol className="timeline">
                    {detail.events?.map((event) => (
                      <li key={event.sequence}>
                        <strong>{event.kind}</strong>
                        <time>{time(event.created_at)}</time>
                      </li>
                    ))}
                  </ol>
                  {["QUEUED", "PREPARING", "AUTHORIZED", "RUNNING"].includes(
                    detail.state,
                  ) && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await api(
                            `/sessions/${detail.id}/cancel`,
                            "POST",
                            {},
                          );
                          setDetail(
                            await api<Session>(`/sessions/${detail.id}`),
                          );
                        })
                      }
                    >
                      Cancelar sessão
                    </button>
                  )}
                </section>
              )}
            </>
          )}
          {view === "wallet" && (
            <>
              <Heading
                eyebrow="CRÉDITOS DE LABORATÓRIO"
                title="Uso claro. Saldo rastreável."
                text="LAB_TU permite testar a economia da rede. Não representa dinheiro, ativo negociável ou saldo de saque."
              />
              <div className="balances">
                <section>
                  <span>Disponível para usar</span>
                  <strong>
                    {formatTU(available)}
                    <small>LAB_TU</small>
                  </strong>
                  <p>Livre para reservar novas sessões</p>
                </section>
                <section>
                  <span>Reservado em sessões</span>
                  <strong>
                    {formatTU(held)}
                    <small>LAB_TU</small>
                  </strong>
                  <p>Reservas de sessões e contratos de disponibilidade</p>
                </section>
                <section className="balance-note">
                  <ShieldCheck size={25} />
                  <h3>Registro por partidas dobradas</h3>
                  <p>
                    Cada concessão, reserva e devolução mantém a soma contábil
                    em zero.
                  </p>
                </section>
              </div>
              <h2 className="subheading">Movimentações recentes</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Operação</th>
                      <th>Data</th>
                      <th>Conta</th>
                      <th>Movimentação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wallet.journal.map((row, index) => (
                      <tr key={`${row.id}-${index}`}>
                        <td>
                          <span className="transaction-type">
                            {BigInt(row.amount) > 0n ? (
                              <ArrowDownLeft size={17} />
                            ) : (
                              <ArrowUpRight size={17} />
                            )}
                            {{
                              LAB_GRANT: "Concessão de teste",
                              RESERVE: "Reserva de sessão",
                              SETTLE: "Liquidação",
                              REFUND: "Devolução",
                              AVAILABILITY_RESERVE:
                                "Reserva de disponibilidade",
                              AVAILABILITY_PAYMENT: "Disponibilidade observada",
                              AVAILABILITY_REFUND: "Devolução do contrato",
                              ROUTE_AVAILABILITY_RESERVE:
                                "Reserva da rota completa",
                              ROUTE_AVAILABILITY_PAYMENT:
                                "Prontidão da rota observada",
                              ROUTE_AVAILABILITY_REFUND:
                                "Devolução da janela da rota",
                              COOPERATIVE_FUNDING:
                                "Contribuição ao fundo cooperativo",
                              COOPERATIVE_CONSUMPTION_REFUND:
                                "Devolução de consumo cooperativo",
                            }[row.kind] ?? row.kind}
                          </span>
                        </td>
                        <td>{time(row.created_at)}</td>
                        <td>
                          {row.account_id.endsWith(":escrow")
                            ? "Contrato reservado"
                            : row.account_id.endsWith(":held")
                              ? "Reservada"
                              : "Disponível"}
                        </td>
                        <td
                          className={`mono ${BigInt(row.amount) > 0n ? "positive" : ""}`}
                        >
                          {BigInt(row.amount) > 0n ? "+" : "−"}
                          {amount(row.amount)} LAB_TU
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!wallet.journal.length && (
                  <Empty text="Nenhuma movimentação nesta conta." />
                )}
              </div>
            </>
          )}
          {view === "cooperative" && (
            <CooperativePanel user={user} request={api} onChange={refresh} />
          )}
          {view === "keys" && (
            <>
              <Heading
                eyebrow="INTEGRAÇÕES"
                title="Leve a rede para seu aplicativo"
                text="Chaves individuais, com as mesmas permissões e créditos da sua conta."
              />
              <section className="panel">
                <h2>Criar chave de API</h2>
                <form
                  className="inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const data = new FormData(form);
                    void act(async () => {
                      const result = await api<{ token: string }>(
                        "/keys",
                        "POST",
                        { label: data.get("label") },
                      );
                      setNewToken(result.token);
                      form.reset();
                    });
                  }}
                >
                  <label>
                    Nome da integração
                    <input
                      name="label"
                      required
                      maxLength={100}
                      placeholder="Ex.: meu aplicativo local"
                    />
                  </label>
                  <button className="primary" disabled={busy}>
                    <Plus size={16} />
                    Criar chave
                  </button>
                </form>
                {newToken && (
                  <div className="key-reveal">
                    <p>
                      Copie agora. A chave completa aparece apenas nesta
                      criação.
                    </p>
                    <div>
                      <code>{newToken}</code>
                      <button
                        className="icon-button"
                        aria-label="Copiar nova chave"
                        onClick={() =>
                          void navigator.clipboard
                            .writeText(newToken)
                            .then(() => setNotice("Chave copiada."))
                        }
                      >
                        <Clipboard size={17} />
                      </button>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setNewToken("")}
                    >
                      Já salvei a chave
                      <Check size={15} />
                    </button>
                  </div>
                )}
              </section>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Identificador</th>
                      <th>Estado</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((key) => (
                      <tr key={key.id}>
                        <td>{key.label}</td>
                        <td className="mono">{key.prefix}…</td>
                        <td>{key.revoked_at ? "Revogada" : "Ativa"}</td>
                        <td>
                          <button
                            className="secondary compact"
                            disabled={busy || !!key.revoked_at}
                            onClick={() =>
                              void act(async () => {
                                await api(`/keys/${key.id}`, "DELETE");
                                setNotice("Chave revogada.");
                              })
                            }
                          >
                            Revogar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!keys.length && (
                  <Empty text="Nenhuma chave criada. O acesso pelo navegador usa sua sessão de login." />
                )}
              </div>
              <section className="api-example">
                <div>
                  <span className="section-label">
                    API COMPATÍVEL COM CHAT COMPLETIONS
                  </span>
                  <h3>Uma chamada, uma sessão auditável</h3>
                  <p>
                    A cotação é criada automaticamente se você não enviar uma.
                    Use a mesma chave de idempotência ao repetir uma
                    solicitação.
                  </p>
                </div>
                <pre>
                  <code>{`POST http://127.0.0.1:43102/v1/chat/completions\nAuthorization: Bearer <SUA_CHAVE>\nIdempotency-Key: <IDENTIFICADOR_UNICO>\nContent-Type: application/json\n\n{\n  "model": "qwen-local",\n  "messages": [{"role": "user", "content": "Olá!"}],\n  "max_tokens": 256,\n  "stream": true\n}`}</code>
                </pre>
              </section>
            </>
          )}
          {view === "admin" && user.role === "admin" && (
            <Admin busy={busy} act={act} notice={setNotice} models={models} />
          )}
        </main>
        <footer className="app-footer">
          <span>
            NETWORK AI <i>by Dev-Encrypted</i>
          </span>
          <span>Ambiente privado · v0.11 · Sem oferta comercial</span>
        </footer>
      </div>
    </div>
  );
}
function Heading({
  eyebrow,
  title,
  text,
  action,
}: {
  eyebrow: string;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {action}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <Layers3 size={25} />
      <p>{text}</p>
    </div>
  );
}
function ManifestForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (body: unknown) => void;
}) {
  const [body, setBody] = useState(
    JSON.stringify(
      {
        schema_version: 1,
        model_id: "meu-modelo-v1",
        display_name: "Meu modelo",
        backend_model: "identificador-no-servidor",
        revision: "revisao-imutavel",
        artifact_sha256: "",
        license_id: "Apache-2.0",
        source_url: "https://huggingface.co/",
        modality: "text",
        max_context_tokens: 8192,
        max_output_tokens: 512,
        max_input_bytes: 6000,
        input_rate_microtu: "1000",
        output_rate_microtu: "3000",
        rate_denominator: 1,
        description: "",
        trust_policy: "private_lab",
      },
      null,
      2,
    ),
  );
  const [error, setError] = useState("");
  return (
    <form
      className="panel"
      onSubmit={(event) => {
        event.preventDefault();
        try {
          onSubmit(JSON.parse(body));
          setError("");
        } catch {
          setError("Revise o JSON antes de publicar.");
        }
      }}
    >
      <h2>Manifesto do modelo</h2>
      <p className="muted">
        Identifique a origem, a licença, o hash SHA-256 do artefato e os limites
        do servidor. Publicar o manifesto não inicia downloads nem qualifica uma
        oferta pública.
      </p>
      <label>
        Manifesto JSON
        <textarea
          className="manifest-input mono"
          rows={15}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          required
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button className="primary" disabled={busy}>
        Publicar candidato
        <Send size={16} />
      </button>
    </form>
  );
}
function Admin({
  busy,
  act,
  notice,
  models,
}: {
  busy: boolean;
  act: (work: () => Promise<void>) => Promise<void>;
  notice: (text: string) => void;
  models: Model[];
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [domains, setDomains] = useState<
    { id: string; name: string; owner_id: string }[]
  >([]);
  const [invite, setInvite] = useState("");
  const load = useCallback(async () => {
    const [u, d] = await Promise.all([
      api<{ data: User[] }>("/admin/users"),
      api<{ data: { id: string; name: string; owner_id: string }[] }>(
        "/admin/domains",
      ),
    ]);
    setUsers(u.data);
    setDomains(d.data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  function submit(
    event: React.SubmitEvent<HTMLFormElement>,
    work: (data: FormData) => Promise<void>,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void act(async () => {
      await work(data);
      await load();
      form.reset();
    });
  }
  return (
    <>
      <Heading
        eyebrow="OPERAÇÃO DO LABORATÓRIO"
        title="Pessoas, recursos e permissões"
        text="A entrada é controlada enquanto identidade, segurança e sustentabilidade passam por validação."
      />
      <div className="admin-grid">
        <form
          className="panel"
          onSubmit={(event) =>
            submit(event, async (data) => {
              await api("/admin/users", "POST", {
                login: data.get("login"),
                name: data.get("name"),
                password: data.get("password"),
                role: data.get("role"),
              });
              notice("Usuário criado com saldo zero.");
            })
          }
        >
          <h2>Criar usuário</h2>
          <label>
            Nome
            <input name="name" required maxLength={100} />
          </label>
          <label>
            Usuário
            <input
              name="login"
              required
              pattern="[a-zA-Z0-9_.@-]{3,100}"
              autoComplete="off"
            />
          </label>
          <label>
            Senha inicial
            <input
              name="password"
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
            />
          </label>
          <label>
            Permissão
            <select name="role">
              <option value="member">Membro</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
          <button className="primary" disabled={busy}>
            Criar usuário
          </button>
        </form>
        <form
          className="panel"
          onSubmit={(event) =>
            submit(event, async (data) => {
              const raw = String(data.get("value"));
              if (!/^\d{1,4}(\.\d{1,6})?$/.test(raw))
                throw new Error("Valor inválido. Use até seis casas decimais.");
              const [whole, fraction = ""] = raw.split(".");
              await api("/admin/grants", "POST", {
                user_id: data.get("user"),
                amount_microtu: (
                  BigInt(whole!) * 1000000n +
                  BigInt(fraction.padEnd(6, "0"))
                ).toString(),
                reason: data.get("reason"),
                idempotency_key: crypto.randomUUID(),
              });
              notice("Concessão de LAB_TU registrada no journal.");
            })
          }
        >
          <h2>Conceder créditos de teste</h2>
          <p className="muted">
            Emissão explícita do laboratório. Até 1.000 LAB_TU por lançamento.
          </p>
          <label>
            Usuário
            <select name="user">
              {users.map((user) => (
                <option value={user.id} key={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Valor em LAB_TU
            <input
              name="value"
              type="number"
              min="0.000001"
              max="1000"
              step="0.000001"
              required
              defaultValue="10"
            />
          </label>
          <label>
            Motivo
            <input
              name="reason"
              required
              minLength={10}
              maxLength={200}
              placeholder="Ex.: validação da integração de API"
            />
          </label>
          <button className="primary" disabled={busy}>
            Registrar concessão
          </button>
        </form>
        <form
          className="panel"
          onSubmit={(event) =>
            submit(event, async (data) => {
              await api("/admin/domains", "POST", {
                name: data.get("name"),
                owner_id: data.get("owner"),
                slots: Number(data.get("slots")),
              });
              notice(
                "Domínio físico cadastrado. Use o mesmo domínio para agentes no mesmo recurso.",
              );
            })
          }
        >
          <h2>Cadastrar domínio físico</h2>
          <p className="muted">
            Uma GPU compartilhada deve ter um único domínio, mesmo com vários
            agentes.
          </p>
          <label>
            Identificação
            <input
              name="name"
              required
              maxLength={100}
              placeholder="Ex.: estação do operador / GPU 0"
            />
          </label>
          <label>
            Operador
            <select name="owner">
              {users.map((user) => (
                <option value={user.id} key={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Capacidade simultânea comprovada
            <input
              name="slots"
              type="number"
              min={1}
              max={16}
              defaultValue={1}
              required
            />
          </label>
          <button className="primary" disabled={busy}>
            Cadastrar domínio
          </button>
        </form>
        <form
          className="panel"
          onSubmit={(event) =>
            submit(event, async (data) => {
              const domain = domains.find((d) => d.id === data.get("domain"));
              const result = await api<{ id: string; invite: string }>(
                "/admin/node-invites",
                "POST",
                {
                  name: data.get("name"),
                  owner_id: domain?.owner_id,
                  resource_domain_id: domain?.id,
                  model_id: data.get("model"),
                  base_url: data.get("url"),
                  node_kind: data.get("node_kind"),
                },
              );
              setInvite(JSON.stringify(result, null, 2));
              notice("Convite criado. Validade: 24 horas, uso único.");
            })
          }
        >
          <h2>Convidar um nó</h2>
          <label>
            Função do nó
            <select
              name="node_kind"
              aria-label="Função do nó"
              defaultValue="INFERENCE"
            >
              <option value="INFERENCE">Modelo completo</option>
              <option value="ROUTE_ROOT">Nó principal de uma rota</option>
              <option value="RPC_STAGE">Etapa de computação</option>
            </select>
          </label>
          <label>
            Nome do nó
            <input name="name" required maxLength={100} />
          </label>
          <label>
            Domínio físico
            <select name="domain">
              {domains.map((domain) => (
                <option value={domain.id} key={domain.id}>
                  {domain.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Modelo
            <select name="model">
              {models.map((model) => (
                <option value={model.id} key={model.id}>
                  {model.manifest.display_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Endereço local do agente
            <input
              name="url"
              type="url"
              required
              placeholder="http://127.0.0.1:43104"
            />
          </label>
          <button className="primary" disabled={busy}>
            Gerar convite
          </button>
        </form>
      </div>
      {invite && (
        <div className="key-reveal">
          <p>Convite privado do nó. Salve antes de fechar esta página.</p>
          <pre>{invite}</pre>
          <button
            className="text-button"
            onClick={() => {
              void navigator.clipboard.writeText(invite);
              notice("Convite copiado.");
            }}
          >
            Copiar convite
            <Clipboard size={16} />
          </button>
        </div>
      )}
      <section className="panel">
        <h2>Qualificação dos modelos</h2>
        <p className="muted">
          Habilite apenas após conferir artefato, licença e compatibilidade.
          Esta marcação cobre o laboratório privado.
        </p>
        {models.map((model) => (
          <form
            key={model.id}
            className="qualification-form"
            onSubmit={(event) =>
              submit(event, async (data) => {
                await api(`/admin/models/${model.id}/qualify`, "POST", {
                  state: data.get("state"),
                  note: data.get("note"),
                });
                notice("Qualificação registrada com evidência descritiva.");
              })
            }
          >
            <strong>{model.manifest.display_name}</strong>
            <label>
              Resultado
              <select
                name="state"
                defaultValue={
                  model.state === "REVOKED" ? "REVOKED" : "LOCAL_PREVIEW"
                }
              >
                <option value="LOCAL_PREVIEW">Habilitar teste local</option>
                <option value="REVOKED">Revogar</option>
              </select>
            </label>
            <label>
              Evidência / motivo
              <input
                name="note"
                minLength={20}
                maxLength={1000}
                required
                defaultValue={model.qualification_note}
              />
            </label>
            <button className="secondary" disabled={busy}>
              Registrar
            </button>
          </form>
        ))}
      </section>
    </>
  );
}
