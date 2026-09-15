// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Uses only the installed 32B route and existing credits. No fabricated observations or manual window acceptance.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { config, runtime, protectDirectory } from "./lab.mjs";
const c = await config();
const profile = JSON.parse(
  await readFile(join(runtime, "cpu-route.json"), "utf8"),
);
const { Pool } = createRequire(
  new URL("../apps/control-api/package.json", import.meta.url),
)("pg");
const db = new Pool({
  connectionString: c.database_url,
  options: "-c search_path=nai,public",
});
const directory = join(runtime, "renewal-campaigns", randomUUID());
await mkdir(directory, { recursive: true, mode: 0o700 });
await protectDirectory(directory);
let cookie = "",
  pool,
  authority,
  mandate;
const report = {
  schema_version: 1,
  evidence_type: "REAL_INSTALLED_32B_BOUNDED_AUTOMATIC_RENEWAL",
  observed_at: new Date().toISOString(),
  physical_hosts: 1,
  operator_accounts: 1,
  independent_operators: 0,
  compute: "CPU",
  model_id: profile.model_id,
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
    const value = await fn();
    if (value) return value;
    await delay(700);
  } while (Date.now() < end);
  throw new Error("Bounded renewal acceptance timed out");
}
const view = () => api(`/cooperative/pools/${pool.id}/renewals`);
const snapshot = async () =>
  (await api("/cooperative/pools")).data.find((p) => p.id === pool.id);
const lease = async (id) =>
  (await api("/availability/routes")).data.find((l) => l.id === id);
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
    bounded_mandate_recorded: Boolean(p.provider_mandate_id),
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
  pool = await api("/cooperative/pools", "POST", {
    name: `32B bounded renewal ${randomUUID().slice(0, 8)}`,
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
  });
  await api(`/cooperative/pools/${pool.id}/fund`, "POST", {
    destination: "WORKING",
    amount_microtu: "3000",
    policy_sha256: pool.policy_sha256,
    consent: "COMMITTED_LAB_CREDITS_NO_REDEMPTION",
    idempotency_key: randomUUID(),
  });
  const authorityRequest = {
    group_key: "essential-32b",
    policy_sha256: pool.policy_sha256,
    maximum_windows: 3,
    maximum_working_microtu: "9000",
    maximum_reserve_microtu: "0",
    expires_at: new Date(Date.now() + 300000).toISOString(),
    idempotency_key: randomUUID(),
    reason:
      "Bounded one-host automatic readiness renewal from recycled credits",
    consent: "BOUNDED_GROSS_COMMITMENTS_NO_AUTOMATIC_LIMIT_INCREASE",
  };
  authority = await api(
    `/cooperative/pools/${pool.id}/renewals`,
    "POST",
    authorityRequest,
  );
  assert.equal(
    (
      await api(
        `/cooperative/pools/${pool.id}/renewals`,
        "POST",
        authorityRequest,
      )
    ).id,
    authority.id,
  );
  await waitFor(
    async () =>
      (await view()).authorizations[0].last_status === "WAITING_FOR_OPERATORS",
  );
  assert.equal((await snapshot()).balances.working, "3000");
  assert.equal((await view()).runs.length, 0);
  check("fund_authority_alone_cannot_commit_credits_without_provider_consent");
  const providerRequest = {
    route_id: profile.route_id,
    policy_sha256: pool.policy_sha256,
    maximum_windows: 3,
    expires_at: new Date(Date.now() + 300000).toISOString(),
    idempotency_key: randomUUID(),
    reason:
      "This account accepts bounded readiness-only windows for its three installed agents",
    consent: "READINESS_ONLY_BOUNDED_RENEWALS",
  };
  mandate = await api(
    `/cooperative/pools/${pool.id}/provider-mandates`,
    "POST",
    providerRequest,
  );
  assert.equal(
    (
      await api(
        `/cooperative/pools/${pool.id}/provider-mandates`,
        "POST",
        providerRequest,
      )
    ).id,
    mandate.id,
  );
  const firstRun = await waitFor(async () =>
    (await view()).runs.find((r) => r.sequence === 1 && r.state === "ACTIVE"),
  );
  const firstActive = await lease(firstRun.lease_id);
  assert.ok(
    firstActive.participants.every(
      (p) => p.accepted && p.provider_mandate_id === mandate.id,
    ),
  );
  assert.equal((await snapshot()).balances.working, "0");
  check(
    "coordinator_atomically_funds_and_accepts_first_window_with_exact_bounded_mandate",
  );
  const quote = await api("/quotes", "POST", {
    model: profile.model_id,
    max_output_tokens: 16,
    cooperative_pool_id: pool.id,
  });
  const start = Date.now();
  const response = await fetch(
    `${c.web_origin}/inference/v1/chat/completions`,
    {
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
          {
            role: "user",
            content: "Say only: bounded renewal works. /no_think",
          },
        ],
        max_tokens: 16,
        temperature: 0,
        stream: false,
      }),
      signal: AbortSignal.timeout(25000),
    },
  );
  assert.equal(response.status, 200, "Installed 32B inference failed");
  const answer = await response.json();
  assert.ok(answer.choices?.[0]?.message?.content?.trim());
  const session = await api(`/sessions/${answer.network_ai.session_id}`);
  assert.equal(session.state, "COMPLETED");
  assert.equal(session.billing_state, "SETTLED");
  assert.equal(session.cooperative_pool_id, pool.id);
  assert.equal(session.coverage_lease_id, firstRun.lease_id);
  assert.ok(session.participants.every((p) => p.paid_microtu === "0"));
  const settlement = (
    await db.query(
      "SELECT * FROM cooperative_settlements WHERE session_id=$1",
      [session.id],
    )
  ).rows[0];
  assert.equal(settlement.working_microtu, session.charged_microtu);
  report.inference = {
    elapsed_ms: Date.now() - start,
    state: session.state,
    billing_state: session.billing_state,
    prompt_tokens: session.prompt_tokens,
    completion_tokens: session.completion_tokens,
    charged_microtu: session.charged_microtu,
    recycled_working_microtu: settlement.working_microtu,
    participant_inference_payout_microtu: "0",
  };
  check(
    "real_32b_consumption_recycles_credits_without_an_additional_inference_payout",
  );
  const secondRun = await waitFor(async () =>
    (await view()).runs.find((r) => r.sequence === 2 && r.state === "ACTIVE"),
  );
  const first = await lease(firstRun.lease_id);
  assert.equal(first.state, "COMPLETED");
  report.first_window = summarize(first);
  report.renewal = {
    automatic: true,
    funding_source: "RECYCLED_WORKING_CREDITS",
    additional_contributions_microtu: "0",
    initial_existing_funding_microtu: "3000",
    gross_working_committed_microtu: "6000",
    maximum_authorized_windows: 3,
  };
  assert.equal(
    (await view()).authorizations[0].working_committed_microtu,
    "6000",
  );
  const beforeRevocation = await lease(secondRun.lease_id);
  const revoked = await api(
    `/cooperative/provider-mandates/${mandate.id}/revoke`,
    "POST",
    {},
  );
  assert.equal(revoked.state, "REVOKED");
  const later = await waitFor(async () => {
    const l = await lease(secondRun.lease_id);
    return BigInt(l.paid_microtu) > BigInt(beforeRevocation.paid_microtu) && l;
  }, 12);
  assert.ok(later.participants.every((p) => p.withdrawn_at === null));
  report.revocation = {
    during_second_window: true,
    paid_at_revocation_microtu: beforeRevocation.paid_microtu,
    paid_after_revocation_microtu: later.paid_microtu,
    accepted_members_withdrawn: 0,
  };
  check(
    "automatic_second_window_is_preserved_and_keeps_earning_after_future_consent_revocation",
  );
  const second = await waitFor(async () => {
    const l = await lease(secondRun.lease_id);
    return l.state === "COMPLETED" && l;
  });
  report.second_window = summarize(second);
  await waitFor(
    async () =>
      (await view()).authorizations[0].last_status === "WAITING_FOR_OPERATORS",
    12,
  );
  await delay(5000);
  const finalView = await view(),
    finalPool = await snapshot();
  assert.equal(finalView.runs.length, 2);
  assert.equal(finalView.authorizations[0].state, "ACTIVE");
  assert.equal(finalView.authorizations[0].windows_used, 2);
  assert.equal(finalView.mandates[0].windows_used, 2);
  assert.ok(BigInt(finalPool.balances.working) >= 3000n);
  assert.ok(
    (await api("/routes")).data.find((r) => r.id === profile.route_id)
      ?.available,
  );
  assert.equal(await grants(), beforeGrants);
  assert.equal(
    (await db.query("SELECT sum(balance)::text AS total FROM ledger_accounts"))
      .rows[0].total,
    "0",
  );
  assert.equal(
    (
      await db.query(
        "SELECT a.id FROM ledger_accounts a LEFT JOIN journal_lines l ON l.account_id=a.id GROUP BY a.id HAVING a.balance<>coalesce(sum(l.amount),0)",
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await db.query(
        "SELECT 1 FROM cooperative_windows cw JOIN availability_domain_claims ac ON ac.route_lease_id=cw.lease_id WHERE cw.pool_id=$1",
        [pool.id],
      )
    ).rowCount,
    0,
  );
  report.final = {
    balances: finalPool.balances,
    state: finalPool.state,
    renewal_status: finalView.authorizations[0].last_status,
    windows_used: 2,
    gross_working_committed_microtu: "6000",
    provider_mandate_state: "REVOKED",
    unused_authorized_windows: 1,
    capacity_still_ready: true,
    new_lab_grants: 0,
    journal_projection_mismatches: 0,
  };
  check(
    "revocation_prevents_third_window_despite_available_funds_capacity_and_unused_fund_authority",
  );
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  if (mandate)
    await api(
      `/cooperative/provider-mandates/${mandate.id}/revoke`,
      "POST",
      {},
    ).catch(() => {});
  if (authority)
    await api(`/cooperative/renewals/${authority.id}/revoke`, "POST", {}).catch(
      () => {},
    );
  if (pool) {
    await api(`/cooperative/pools/${pool.id}/manage`, "POST", {
      paused: true,
      reason:
        "Bounded automatic renewal campaign completed; future commitments paused, accepted windows preserved",
    }).catch(() => {});
    await waitFor(
      async () =>
        (await view()).runs.every((r) =>
          ["COMPLETED", "CANCELLED", "EXPIRED"].includes(r.state),
        ),
      40,
    ).catch(() => {});
  }
  await writeFile(
    join(directory, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await db.end();
  console.log(`Renewal campaign report: ${join(directory, "report.json")}`);
}
