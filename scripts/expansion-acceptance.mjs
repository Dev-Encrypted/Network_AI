// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// One real host: prove that self-use remains useful without pretending to qualify independent growth.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
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
const directory = join(runtime, "expansion-campaigns", randomUUID());
await mkdir(directory, { recursive: true, mode: 0o700 });
await protectDirectory(directory);
let cookie = "",
  pool,
  support;
const authorizations = [],
  mandates = [];
const report = {
  schema_version: 1,
  evidence_type: "REAL_INSTALLED_32B_PRIVATE_EXPANSION_GATES",
  observed_at: new Date().toISOString(),
  physical_hosts: 1,
  operator_accounts: 1,
  independent_operators: 0,
  compute: "CPU",
  model_id: profile.model_id,
  unit: "LAB_TU",
  cash_payments: false,
  fabricated_database_observations: false,
  fabricated_party_classifications: false,
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
async function waitFor(fn, seconds = 40) {
  const end = Date.now() + seconds * 1000;
  do {
    const v = await fn();
    if (v) return v;
    await delay(700);
  } while (Date.now() < end);
  throw new Error("Private expansion gate acceptance timed out");
}
const view = () => api(`/cooperative/pools/${pool.id}/renewals`);
const grantCount = async () =>
  (
    await db.query(
      "SELECT count(*)::int AS n FROM journal WHERE kind='LAB_GRANT'",
    )
  ).rows[0].n;
function publicFacts(f) {
  const { support, ...rest } = f;
  return {
    ...rest,
    support: support
      ? { registered: true, expires_at: support.expires_at }
      : null,
  };
}
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
  const beforeGrants = await grantCount();
  pool = await api("/cooperative/pools", "POST", {
    name: `32B private expansion gates ${randomUUID().slice(0, 8)}`,
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
  const declaration =
    "Existing local computer and installed CPU 32B profile are available for this bounded private campaign. One operator account, one physical resource domain. This records in-kind resources only; no external cash, independent ownership or public availability is asserted.";
  await writeFile(join(directory, "operating-support.txt"), declaration + "\n");
  support = await api(
    `/cooperative/pools/${pool.id}/operating-support`,
    "POST",
    {
      policy_sha256: pool.policy_sha256,
      scope: declaration,
      evidence_sha256: createHash("sha256")
        .update(declaration + "\n")
        .digest("hex"),
      source_reference:
        "Private campaign operating-support.txt; existing one-host CPU resources observed through the installed route",
      expires_at: new Date(Date.now() + 600000).toISOString(),
      idempotency_key: randomUUID(),
      consent: "PRIVATE_IN_KIND_SUPPORT_NO_VERIFIED_CASH_CLAIM",
    },
  );
  const authorityBase = {
    group_key: "essential-32b",
    policy_sha256: pool.policy_sha256,
    maximum_windows: 1,
    maximum_working_microtu: "3000",
    maximum_reserve_microtu: "0",
    expires_at: new Date(Date.now() + 300000).toISOString(),
    reason:
      "Bounded private campaign, no public demand or economic qualification claim",
    consent: "BOUNDED_GROSS_COMMITMENTS_NO_AUTOMATIC_LIMIT_INCREASE",
  };
  const mandateBase = {
    route_id: profile.route_id,
    policy_sha256: pool.policy_sha256,
    maximum_windows: 1,
    expires_at: authorityBase.expires_at,
    reason:
      "One local account offers its existing components under separate bounded readiness consent",
  };
  for (const kind of ["ESSENTIAL", "EXPANSION"]) {
    authorizations.push(
      await api(`/cooperative/pools/${pool.id}/renewals`, "POST", {
        ...authorityBase,
        coverage_kind: kind,
        ...(kind === "EXPANSION" ? { operating_support_id: support.id } : {}),
        idempotency_key: randomUUID(),
      }),
    );
    mandates.push(
      await api(`/cooperative/pools/${pool.id}/provider-mandates`, "POST", {
        ...mandateBase,
        coverage_kind: kind,
        idempotency_key: randomUUID(),
        consent:
          kind === "EXPANSION"
            ? "READINESS_ONLY_BOUNDED_EXPANSION"
            : "READINESS_ONLY_BOUNDED_RENEWALS",
      }),
    );
  }
  const essential = await waitFor(async () =>
    (await view()).runs.find(
      (r) => r.coverage_kind === "ESSENTIAL" && r.state === "ACTIVE",
    ),
  );
  await waitFor(async () =>
    (await view()).authorizations
      .find((a) => a.coverage_kind === "EXPANSION")
      ?.last_status.startsWith("EXPANSION_"),
  );
  const initial = await view();
  report.during_essential_window = publicFacts(initial.expansion[0]);
  assert.equal(initial.expansion[0].approved, false);
  assert.equal(initial.expansion[0].eligible_funded_parties, 0);
  assert.equal(initial.expansion[0].additional_complete_routes, 0);
  check(
    "separate_consents_cannot_override_missing_independent_demand_or_extra_physical_capacity",
  );
  const quote = await api("/quotes", "POST", {
    model: profile.model_id,
    max_output_tokens: 16,
    cooperative_pool_id: pool.id,
  });
  const started = Date.now();
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
            content: "Say only: private cooperation works. /no_think",
          },
        ],
        max_tokens: 16,
        temperature: 0,
        stream: false,
      }),
      signal: AbortSignal.timeout(25000),
    },
  );
  assert.equal(response.status, 200);
  const answer = await response.json();
  assert.ok(answer.choices?.[0]?.message?.content?.trim());
  const s = await api(`/sessions/${answer.network_ai.session_id}`);
  assert.equal(s.state, "COMPLETED");
  assert.equal(s.billing_state, "SETTLED");
  assert.equal(s.coverage_lease_id, essential.lease_id);
  assert.ok(s.participants.every((p) => p.paid_microtu === "0"));
  const allocation = (
    await db.query(
      "SELECT working_microtu,reserve_microtu,burned_microtu FROM cooperative_settlements WHERE session_id=$1",
      [s.id],
    )
  ).rows[0];
  report.inference = {
    elapsed_ms: Date.now() - started,
    prompt_tokens: s.prompt_tokens,
    completion_tokens: s.completion_tokens,
    charged_microtu: s.charged_microtu,
    state: s.state,
    billing_state: s.billing_state,
    allocation,
    additional_inference_payout_microtu: "0",
  };
  assert.equal(allocation.working_microtu, s.charged_microtu);
  check(
    "real_32b_self_use_recycles_existing_credits_without_becoming_independent_recurring_flow",
  );
  await waitFor(async () => {
    const f = (await view()).expansion[0];
    return BigInt(f.normal_cost_microtu) > 0n && f;
  }, 10);
  const afterUse = (await view()).expansion[0];
  assert.equal(afterUse.net_recycled_microtu, "0");
  assert.ok(afterUse.blocked_by.includes("recurring_flow"));
  report.after_self_consumption = publicFacts(afterUse);
  const accepted = await waitFor(async () => {
    const r = (await view()).runs.find(
      (r) => r.lease_id === essential.lease_id,
    );
    return r?.state === "COMPLETED" && r;
  });
  report.essential_window = {
    state: accepted.state,
    committed_microtu: accepted.committed_microtu,
    paid_microtu: accepted.paid_microtu,
  };
  await api(`/cooperative/operating-support/${support.id}/revoke`, "POST", {});
  const final = await view(),
    extra = final.authorizations.find((a) => a.coverage_kind === "EXPANSION");
  assert.equal(extra.windows_used, 0);
  assert.equal(extra.working_committed_microtu, "0");
  assert.equal(
    final.runs.filter((r) => r.coverage_kind === "EXPANSION").length,
    0,
  );
  assert.equal(final.expansion[0].gates.operating_support, false);
  assert.equal(await grantCount(), beforeGrants);
  assert.equal(
    (await db.query("SELECT sum(balance)::text AS n FROM ledger_accounts"))
      .rows[0].n,
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
  report.final = {
    expansion_windows: 0,
    expansion_gross_commitment_microtu: "0",
    new_lab_grants: 0,
    working_projection_mismatches: 0,
    revoked_operating_support: true,
    essential_contract_preserved: true,
    expansion_status: extra.last_status,
  };
  check("no_expansion_no_new_issuance_and_no_accepted_contract_cancellation");
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  for (const m of mandates)
    await api(
      `/cooperative/provider-mandates/${m.id}/revoke`,
      "POST",
      {},
    ).catch(() => {});
  for (const a of authorizations)
    await api(`/cooperative/renewals/${a.id}/revoke`, "POST", {}).catch(
      () => {},
    );
  if (support)
    await api(
      `/cooperative/operating-support/${support.id}/revoke`,
      "POST",
      {},
    ).catch(() => {});
  if (pool) {
    await api(`/cooperative/pools/${pool.id}/manage`, "POST", {
      paused: true,
      reason:
        "Private expansion gate campaign complete; accepted contracts preserved and future commitments paused",
    }).catch(() => {});
    await waitFor(async () =>
      (await view()).runs.every((r) =>
        ["COMPLETED", "CANCELLED", "EXPIRED"].includes(r.state),
      ),
    ).catch(() => {});
  }
  await writeFile(
    join(directory, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await db.end();
  console.log(`Expansion campaign report: ${join(directory, "report.json")}`);
}
