// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Real installed 32B route, one host/account. No model download, mint or fake heartbeat.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { config, runtime, protectDirectory } from "./lab.mjs";
const c = await config(),
  profile = JSON.parse(await readFile(join(runtime, "cpu-route.json"), "utf8"));
const { Pool } = createRequire(
  new URL("../apps/control-api/package.json", import.meta.url),
)("pg");
const db = new Pool({
  connectionString: c.database_url,
  options: "-c search_path=nai,public",
});
const directory = join(runtime, "cooperative-campaigns", randomUUID());
await mkdir(directory, { recursive: true, mode: 0o700 });
await protectDirectory(directory);
let cookie = "",
  pool,
  lease;
const report = {
  schema_version: 1,
  evidence_type: "REAL_INSTALLED_32B_COOPERATIVE_CYCLE",
  observed_at: new Date().toISOString(),
  physical_hosts: 1,
  operator_accounts: 1,
  independent_operators: 0,
  model_id: profile.model_id,
  compute: "CPU",
  unit: "LAB_TU",
  cash_payments: false,
  fabricated_database_observations: false,
  sustainable_economics_established: false,
  public_operation_approved: false,
  checks: [],
};
const check = (name) => {
  report.checks.push({ name, passed: true });
  console.log(`PASS ${name}`);
};
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
  const v = await r.json();
  assert.ok(r.ok, `API ${path}: ${r.status} ${v.error?.code ?? "unknown"}`);
  if (path === "/auth/login")
    cookie = r.headers.get("set-cookie").split(";")[0];
  return v;
}
async function waitFor(fn, seconds = 45) {
  const end = Date.now() + seconds * 1000;
  do {
    const v = await fn();
    if (v) return v;
    await delay(700);
  } while (Date.now() < end);
  throw new Error("Bounded cooperative acceptance timed out");
}
const poolSnapshot = async () =>
  (await api("/cooperative/pools")).data.find((p) => p.id === pool.id);
const windowSnapshot = async () =>
  (await api("/availability/routes")).data.find((l) => l.id === lease.id);
const summarize = (l) => ({
  state: l.state,
  budget_microtu: l.budget_microtu,
  paid_microtu: l.paid_microtu,
  joint_ready_ms: l.joint_ready_ms,
  components: l.participants.map((p) => ({
    ordinal: p.ordinal,
    role: p.role,
    paid_microtu: p.paid_microtu,
    credited_ms: p.credited_ms,
  })),
});
const grants = async () =>
  (
    await db.query(
      "SELECT count(*)::int AS n FROM journal WHERE kind='LAB_GRANT'",
    )
  ).rows[0].n;
try {
  const login = await api("/auth/login", "POST", {
    login: c.admin_login,
    password: c.admin_password,
  });
  const route = await waitFor(async () => {
    const r = (await api("/routes")).data.find(
      (r) => r.id === profile.route_id,
    );
    return r?.available && r;
  });
  assert.equal(route.participants.length, 3);
  assert.equal(
    new Set(route.participants.map((p) => p.resource_domain_id)).size,
    1,
  );
  assert.ok(route.participants.every((p) => p.provider_id === login.user.id));
  const beforeGrants = await grants();
  const plan = {
    name: `32B cooperative cycle ${randomUUID().slice(0, 8)}`,
    support_until: new Date(Date.now() + 3600000).toISOString(),
    idempotency_key: randomUUID(),
    groups: [
      {
        key: "essential-32b",
        route_ids: [profile.route_id],
        duration_seconds: 30,
        rate_microtu_per_second: "100",
      },
    ],
  };
  pool = await api("/cooperative/pools", "POST", plan);
  assert.equal((await api("/cooperative/pools", "POST", plan)).id, pool.id);
  const funding = {
    destination: "WORKING",
    amount_microtu: "3000",
    policy_sha256: pool.policy_sha256,
    consent: "COMMITTED_LAB_CREDITS_NO_REDEMPTION",
    idempotency_key: randomUUID(),
  };
  const f = await api(`/cooperative/pools/${pool.id}/fund`, "POST", funding);
  assert.equal(
    (await api(`/cooperative/pools/${pool.id}/fund`, "POST", funding)).id,
    f.id,
  );
  const offer = async () =>
    api(`/cooperative/pools/${pool.id}/windows`, "POST", {
      group_key: "essential-32b",
      source: "WORKING",
      reason:
        "Real installed 32B one-host cooperative consumption and funded renewal",
      idempotency_key: randomUUID(),
    });
  lease = await offer();
  assert.equal((await poolSnapshot()).balances.working, "0");
  assert.equal(lease.terms.compensation, "READINESS_ONLY");
  assert.equal(
    (
      await api(`/availability/routes/${lease.id}/accept`, "POST", {
        terms_sha256: lease.terms_sha256,
      })
    ).state,
    "ACTIVE",
  );
  check(
    "existing_credits_fund_one_complete_window_and_leave_zero_free_working_balance",
  );
  const quote = await api("/quotes", "POST", {
    model: profile.model_id,
    max_output_tokens: 16,
    cooperative_pool_id: pool.id,
  });
  const start = Date.now(),
    r = await fetch(`${c.web_origin}/inference/v1/chat/completions`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: c.web_origin,
        "Content-Type": "application/json",
        "X-Quote-Id": quote.id,
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({
        model: profile.model_id,
        messages: [
          { role: "user", content: "Say only: cooperation works. /no_think" },
        ],
        max_tokens: 16,
        temperature: 0,
        stream: false,
      }),
      signal: AbortSignal.timeout(40000),
    });
  assert.equal(r.status, 200, "Installed 32B inference failed");
  const answer = await r.json();
  assert.ok(answer.choices?.[0]?.message?.content?.trim());
  const session = await api(`/sessions/${answer.network_ai.session_id}`);
  assert.equal(session.state, "COMPLETED");
  assert.equal(session.billing_state, "SETTLED");
  assert.equal(session.cooperative_pool_id, pool.id);
  assert.equal(session.coverage_lease_id, lease.id);
  assert.ok(session.participants.every((p) => p.paid_microtu === "0"));
  const settled = (
    await db.query(
      "SELECT * FROM cooperative_settlements WHERE session_id=$1",
      [session.id],
    )
  ).rows[0];
  assert.equal(settled.charge_microtu, session.charged_microtu);
  assert.equal(settled.working_microtu, session.charged_microtu);
  assert.equal(settled.reserve_microtu, "0");
  assert.equal(settled.burned_microtu, "0");
  report.inference = {
    state: session.state,
    billing_state: session.billing_state,
    prompt_tokens: session.prompt_tokens,
    completion_tokens: session.completion_tokens,
    charged_microtu: session.charged_microtu,
    elapsed_ms: Date.now() - start,
    participant_inference_payout_microtu: "0",
    allocation: settled.allocation,
  };
  report.policy_sha256 = pool.policy_sha256;
  report.initial_existing_funding_microtu = "3000";
  check(
    "real_32b_consumption_recycles_into_working_with_no_second_inference_payout",
  );
  const first = await waitFor(async () => {
    const v = await windowSnapshot();
    return v.state === "COMPLETED" && v;
  });
  report.first_window = summarize(first);
  assert.ok(first.participants.every((p) => BigInt(p.paid_microtu) > 0n));
  const beforeRenewal = await poolSnapshot();
  assert.ok(BigInt(beforeRenewal.balances.working) >= 3000n);
  lease = await offer();
  const heldAgain = await poolSnapshot();
  assert.equal(
    BigInt(beforeRenewal.balances.working) - BigInt(heldAgain.balances.working),
    3000n,
  );
  assert.equal(
    (
      await api(`/availability/routes/${lease.id}/accept`, "POST", {
        terms_sha256: lease.terms_sha256,
      })
    ).state,
    "ACTIVE",
  );
  report.renewal = {
    funding_source: "RECYCLED_WORKING_CREDITS",
    additional_contributions_microtu: "0",
    before: beforeRenewal.balances,
    after_hold: heldAgain.balances,
  };
  check(
    "recycled_consumption_funds_a_second_complete_window_without_another_contribution",
  );
  const second = await waitFor(async () => {
    const v = await windowSnapshot();
    return v.state === "COMPLETED" && v;
  });
  report.second_window = summarize(second);
  const final = await poolSnapshot();
  report.final = {
    state: final.state,
    balances: final.balances,
    targets: final.targets,
    metrics: final.metrics,
  };
  assert.equal(await grants(), beforeGrants);
  assert.equal(
    (await db.query("SELECT sum(balance)::text AS total FROM ledger_accounts"))
      .rows[0].total,
    "0",
  );
  assert.equal(
    (
      await db.query(
        `SELECT a.id FROM ledger_accounts a LEFT JOIN journal_lines l ON l.account_id=a.id GROUP BY a.id HAVING a.balance<>coalesce(sum(l.amount),0)`,
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await db.query(
        `SELECT 1 FROM cooperative_windows cw JOIN availability_domain_claims ac ON ac.route_lease_id=cw.lease_id WHERE cw.pool_id=$1`,
        [pool.id],
      )
    ).rowCount,
    0,
  );
  check(
    "both_windows_settle_and_release_claims_with_balanced_ledger_and_no_grants",
  );
  report.result = "PASS";
} catch (e) {
  report.result = "FAIL";
  report.error = e instanceof Error ? e.message : String(e);
  throw e;
} finally {
  if (lease)
    await api(`/availability/routes/${lease.id}/cancel`, "POST", {}).catch(
      () => {},
    );
  if (pool)
    await api(`/cooperative/pools/${pool.id}/manage`, "POST", {
      paused: true,
      reason:
        "Bounded one-host acceptance completed; no automatic renewal authorized by this campaign",
    }).catch(() => {});
  await writeFile(
    join(directory, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await db.end();
  console.log(`Cooperative campaign report: ${join(directory, "report.json")}`);
}
