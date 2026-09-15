// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Existing installed 32B route; no extra model copy, grants, fake heartbeats or cash.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { config, runtime, protectDirectory } from "./lab.mjs";

const { values } = parseArgs({
  options: { fault: { type: "boolean", default: false } },
});
const c = await config();
const profile = JSON.parse(
  await readFile(join(runtime, "cpu-route.json"), "utf8"),
);
const require = createRequire(
  new URL("../apps/control-api/package.json", import.meta.url),
);
const { Pool } = require("pg");
const db = new Pool({
  connectionString: c.database_url,
  options: "-c search_path=nai,public",
});
const directory = join(runtime, "route-availability-campaigns", randomUUID());
await mkdir(directory, { recursive: true, mode: 0o700 });
await protectDirectory(directory);
let cookie = "",
  lease,
  pausedNode;
const report = {
  schema_version: 1,
  evidence_type: "REAL_INSTALLED_ROUTE_FUNDED_READINESS",
  observed_at: new Date().toISOString(),
  physical_hosts: 1,
  operator_accounts: 1,
  independent_operators: 0,
  agent_identities: 3,
  model_id: profile.model_id,
  compute: "CPU",
  unit: "LAB_TU",
  cash_payments: false,
  heartbeat_source: "existing signed root and stage agents",
  database_observations_fabricated: false,
  checks: [],
  public_operation_approved: false,
  sustainable_economics_established: false,
};
function check(name) {
  report.checks.push({ name, passed: true });
  console.log(`PASS ${name}`);
}
async function api(path, method = "GET", body) {
  const r = await fetch(`${c.web_origin}/api/v1${path}`, {
    method,
    headers: {
      Cookie: cookie,
      Origin: c.web_origin,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const result = await r.json();
  assert.ok(
    r.ok,
    `API ${path} failed (${r.status}, ${result.error?.code ?? "unknown"})`,
  );
  if (path === "/auth/login")
    cookie = r.headers.get("set-cookie").split(";")[0];
  return result;
}
async function waitFor(fn, seconds = 20) {
  const end = Date.now() + seconds * 1000;
  do {
    const v = await fn();
    if (v) return v;
    await delay(500);
  } while (Date.now() < end);
  throw new Error(
    "Bounded readiness check timed out; inspect this campaign and private service logs.",
  );
}
const snapshot = async () =>
  (await api("/availability/routes")).data.find((l) => l.id === lease.id);
const route = async () =>
  (await api("/routes")).data.find((r) => r.id === profile.route_id);
const sessions = async () =>
  Number(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM sessions WHERE model_id=$1",
        [profile.model_id],
      )
    ).rows[0].n,
  );
const summarize = (l) => ({
  state: l.state,
  budget_microtu: l.budget_microtu,
  paid_microtu: l.paid_microtu,
  joint_ready_ms: l.joint_ready_ms,
  participants: l.participants.map((p) => ({
    ordinal: p.ordinal,
    role: p.role,
    maximum_microtu: p.maximum_microtu,
    credited_ms: p.credited_ms,
    paid_microtu: p.paid_microtu,
  })),
});
try {
  const login = await api("/auth/login", "POST", {
    login: c.admin_login,
    password: c.admin_password,
  });
  const ready = await waitFor(async () => {
    const r = await route();
    return r?.available && r;
  });
  assert.equal(ready.participants.length, 3);
  assert.ok(ready.participants.every((p) => p.provider_id === login.user.id));
  assert.equal(
    new Set(ready.participants.map((p) => p.resource_domain_id)).size,
    1,
  );
  const beforeSessions = await sessions();
  lease = await api("/availability/routes", "POST", {
    route_id: ready.id,
    duration_seconds: 30,
    rate_microtu_per_second: "1000",
    purpose: "EXPERIMENT",
    reason:
      "One-host managed 32B route: observed idle readiness, bounded pause and live inference.",
    idempotency_key: randomUUID(),
  });
  assert.equal(lease.budget_microtu, "30000");
  const accepted = await api(
    `/availability/routes/${lease.id}/accept`,
    "POST",
    { terms_sha256: lease.terms_sha256 },
  );
  assert.equal(accepted.state, "ACTIVE");
  const idle = await waitFor(async () => {
    const s = await snapshot();
    return Number(s.joint_ready_ms) >= 5000 && s;
  });
  assert.equal(await sessions(), beforeSessions);
  assert.ok(idle.participants.every((p) => BigInt(p.paid_microtu) > 0n));
  report.idle = summarize(idle);
  check("signed_ready_intervals_earn_from_existing_escrow_without_inference");
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM availability_domain_claims WHERE route_lease_id=$1",
        [lease.id],
      )
    ).rows[0].n,
    1,
  );
  check("three_agents_share_one_readiness_budget_and_one_physical_claim");
  if (values.fault) {
    pausedNode = ready.participants.find((p) => p.ordinal === 1).node_id;
    await api(`/nodes/${pausedNode}/state`, "POST", { state: "PAUSED" });
    const paused = await waitFor(async () => {
      const s = await snapshot();
      return s.state === "DRAINING" && s;
    });
    await delay(4500);
    const after = await snapshot();
    assert.equal(
      after.participants[1].paid_microtu,
      paused.participants[1].paid_microtu,
    );
    assert.ok(
      BigInt(after.participants[0].paid_microtu) >
        BigInt(paused.participants[0].paid_microtu),
    );
    assert.ok(
      BigInt(after.participants[2].paid_microtu) >
        BigInt(paused.participants[2].paid_microtu),
    );
    assert.equal(after.joint_ready_ms, paused.joint_ready_ms);
    assert.equal(await sessions(), beforeSessions);
    report.fault = {
      injection:
        "API pause of one actual stage agent; no worker process killed",
      before: summarize(paused),
      after: summarize(after),
    };
    check(
      "paused_stage_earns_no_further_readiness_while_other_accepted_components_do",
    );
    await api(`/nodes/${pausedNode}/state`, "POST", { state: "READY" });
    pausedNode = undefined;
    await waitFor(async () => (await route())?.available);
    check("original_route_is_restored_after_the_bounded_pause");
  }
  const start = Date.now();
  const response = await fetch(
    `${c.web_origin}/inference/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: c.web_origin,
        "Content-Type": "application/json",
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({
        model: profile.model_id,
        messages: [
          { role: "user", content: "Say only: route ready. /no_think" },
        ],
        max_tokens: 16,
        temperature: 0,
        stream: false,
      }),
      signal: AbortSignal.timeout(60000),
    },
  );
  assert.equal(
    response.status,
    200,
    "Actual installed model inference failed.",
  );
  const answer = await response.json();
  assert.ok(answer.choices?.[0]?.message?.content?.trim());
  const s = await api(`/sessions/${answer.network_ai.session_id}`);
  assert.equal(s.state, "COMPLETED");
  assert.equal(s.billing_state, "SETTLED");
  assert.equal(s.participants.length, 3);
  report.inference = {
    state: s.state,
    billing_state: s.billing_state,
    charged_microtu: s.charged_microtu,
    prompt_tokens: s.prompt_tokens,
    completion_tokens: s.completion_tokens,
    elapsed_ms: Date.now() - start,
    participants: s.participants.map((p) => ({
      ordinal: p.ordinal,
      role: p.role,
      paid_microtu: p.paid_microtu,
    })),
  };
  check("real_32b_inference_preserves_separate_token_settlement");
  const final = await waitFor(async () => {
    const s = await snapshot();
    return s.state === "COMPLETED" && s;
  }, 40);
  report.final = summarize(final);
  const escrow = (
    await db.query("SELECT balance FROM ledger_accounts WHERE id=$1", [
      final.escrow_account,
    ])
  ).rows[0].balance;
  assert.equal(escrow, "0");
  assert.equal(
    final.participants.reduce((a, p) => a + BigInt(p.paid_microtu), 0n),
    BigInt(final.paid_microtu),
  );
  const refund = (
    await db.query("SELECT metadata FROM journal WHERE business_key=$1", [
      `route-lease:${lease.id}:refund`,
    ])
  ).rowCount;
  const remaining = BigInt(final.budget_microtu) - BigInt(final.paid_microtu);
  if (remaining > 0n) assert.equal(refund, 1);
  report.refunded_microtu = remaining.toString();
  assert.equal(
    (
      await db.query(
        "SELECT 1 FROM availability_domain_claims WHERE route_lease_id=$1",
        [lease.id],
      )
    ).rowCount,
    0,
  );
  check("window_completion_refunds_exact_remainder_and_releases_domain_claim");
  assert.equal(
    (await db.query("SELECT sum(balance)::text AS n FROM ledger_accounts"))
      .rows[0].n,
    "0",
  );
  assert.equal(
    (
      await db.query(`SELECT a.id FROM ledger_accounts a LEFT JOIN journal_lines l ON l.account_id=a.id
    GROUP BY a.id HAVING a.balance<>coalesce(sum(l.amount),0)`)
    ).rowCount,
    0,
  );
  check("all_postings_balance_without_new_issuance");
  report.completed = true;
} finally {
  if (pausedNode)
    await api(`/nodes/${pausedNode}/state`, "POST", { state: "READY" });
  if (lease)
    await api(`/availability/routes/${lease.id}/cancel`, "POST", {}).catch(
      () => {},
    );
  if (cookie) await api("/auth/logout", "POST", {}).catch(() => {});
  await db.end();
  await writeFile(
    join(directory, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  console.log(`Allowlisted campaign report: ${join(directory, "report.json")}`);
}
