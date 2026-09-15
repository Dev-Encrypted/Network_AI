// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Real installed 32B, one host and one physical domain. No grants or fabricated work.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import {
  config,
  runtime,
  protectDirectory,
  stopRouteRpcStage,
  stopCpu,
  startCpuRoute,
} from "./lab.mjs";

const { values: a } = parseArgs({
  options: { fault: { type: "boolean", default: false } },
});
const c = await config(),
  profile = JSON.parse(await readFile(join(runtime, "cpu-route.json"), "utf8"));
assert.equal(
  profile.rpc_transport,
  "iroh-direct-quic-guarded-rpc",
  "Enable the installed route's QUIC transport first",
);
const { Pool } = createRequire(
  new URL("../apps/control-api/package.json", import.meta.url),
)("pg");
const db = new Pool({
  connectionString: c.database_url,
  options: "-c search_path=nai,public",
});
const directory = join(runtime, "rpc-route-campaigns", randomUUID());
await mkdir(directory, { recursive: true, mode: 0o700 });
await protectDirectory(directory);
const report = {
  schema_version: 1,
  evidence_type: "REAL_INSTALLED_32B_GUARDED_RPC_OVER_QUIC",
  observed_at: new Date().toISOString(),
  physical_hosts: 1,
  physical_resource_domains: 1,
  operator_accounts: 1,
  independent_operators: 0,
  agent_identities: 3,
  compute: "CPU",
  unit: "LAB_TU",
  transport: profile.rpc_transport,
  relay_enabled: false,
  cash_payments: false,
  database_observations_fabricated: false,
  public_operation_approved: false,
  sustainable_economics_established: false,
  sessions: [],
  checks: [],
};
let cookie = "",
  key,
  needsRecovery = false;
const pass = (name) => {
  report.checks.push(name);
  console.log(`PASS ${name}`);
};
async function api(path, method = "GET", body) {
  const r = await fetch(`http://127.0.0.1:${c.control_port}/api/v1${path}`, {
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
async function until(fn, seconds = 45) {
  const end = Date.now() + seconds * 1000;
  do {
    const value = await fn();
    if (value) return value;
    await delay(250);
  } while (Date.now() < end);
  throw new Error(
    "Private RPC acceptance timed out; retained evidence and logs identify the incomplete phase",
  );
}
const ready = () =>
  until(async () =>
    (await api("/routes")).data.find(
      (r) => r.id === profile.route_id && r.available,
    ),
  );
async function snapshots() {
  const result = [];
  for (const i of [1, 2]) {
    const pair = {};
    for (const role of ["root", "stage"]) {
      const s = JSON.parse(
        await readFile(
          join(
            runtime,
            "cpu-route",
            "rpc-link",
            `${role}-${i}`,
            "rpc-status.json",
          ),
          "utf8",
        ),
      );
      assert.ok(Math.abs(Date.now() - s.observed_at_unix_ms) < 5000);
      assert.equal(s.binding.route_id, profile.route_id);
      assert.equal(s.binding.stage_node_id, profile.node_ids[i]);
      assert.equal(s.counters.active_tunnels, 1);
      pair[role] = s.counters;
    }
    result.push(pair);
  }
  return result;
}
async function infer(label) {
  const before = await snapshots(),
    start = Date.now();
  const response = await fetch(
    `http://127.0.0.1:${c.gateway_port}/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key.token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({
        model: profile.model_id,
        stream: false,
        temperature: 0,
        max_tokens: 16,
        messages: [
          {
            role: "user",
            content: "Reply only with these two words: route works.",
          },
        ],
      }),
      signal: AbortSignal.timeout(210000),
    },
  );
  const output = await response.json();
  assert.equal(
    response.status,
    200,
    `Inference failed: ${output.error?.code ?? "response"}`,
  );
  assert.match(output.choices?.[0]?.message?.content ?? "", /route works/i);
  const s = await api(`/sessions/${output.network_ai.session_id}`);
  assert.equal(s.state, "COMPLETED");
  assert.equal(s.billing_state, "SETTLED");
  assert.equal(s.route_id, profile.route_id);
  assert.equal(s.participants.length, 3);
  assert.equal(
    new Set(s.participants.map((p) => p.resource_domain_id)).size,
    1,
  );
  const rootReceipt = (
    await db.query("SELECT payload FROM receipts WHERE session_id=$1", [s.id])
  ).rows[0]?.payload;
  assert.equal(rootReceipt?.state, "COMPLETED");
  const workers = s.participants.filter((p) => p.role === "STAGE");
  assert.equal(workers.length, 2);
  assert.ok(
    workers.every(
      (p) =>
        p.receipt?.state === "COMPLETED" &&
        p.receipt.completed_commands > 0 &&
        BigInt(p.receipt.request_bytes) > 0n &&
        BigInt(p.receipt.response_bytes) > 0n,
    ),
  );
  const charge = BigInt(s.charged_microtu),
    paid = s.participants.reduce((sum, p) => sum + BigInt(p.paid_microtu), 0n);
  assert.equal(paid, charge - (charge * 2000n) / 10000n);
  await delay(1250);
  const after = await snapshots();
  const transfer = after.map((pair, i) => {
    for (const role of ["root", "stage"])
      for (const field of ["root_to_stage_bytes", "stage_to_root_bytes"])
        assert.ok(
          pair[role][field] > before[i][role][field],
          "Both directions of both QUIC pairs must carry this execution",
        );
    return Object.fromEntries(
      ["root", "stage"].map((role) => [
        role,
        Object.fromEntries(
          ["root_to_stage_bytes", "stage_to_root_bytes"].map((field) => [
            field,
            pair[role][field] - before[i][role][field],
          ]),
        ),
      ]),
    );
  });
  report.sessions.push({
    label,
    state: s.state,
    billing_state: s.billing_state,
    elapsed_ms: Date.now() - start,
    prompt_tokens: s.prompt_tokens,
    completion_tokens: s.completion_tokens,
    charged_microtu: s.charged_microtu,
    provider_paid_microtu: String(paid),
    platform_fee_microtu: String(charge - paid),
    worker_receipts: workers.map((p) => ({
      ordinal: p.ordinal,
      completed_commands: p.receipt.completed_commands,
      request_bytes: p.receipt.request_bytes,
      response_bytes: p.receipt.response_bytes,
      paid_microtu: p.paid_microtu,
    })),
    transfer_deltas: transfer,
    started_at: s.started_at,
    finished_at: s.finished_at,
  });
  return s;
}
try {
  const login = await api("/auth/login", "POST", {
    login: c.admin_login,
    password: c.admin_password,
  });
  const pending = (
    await db.query(
      "SELECT (SELECT count(*) FROM sessions WHERE state IN ('QUEUED','PREPARING','AUTHORIZED','RUNNING','CANCELLING'))::int AS sessions,(SELECT count(*) FROM route_availability_leases WHERE state IN ('OFFERED','ACTIVE','DRAINING'))::int AS windows",
    )
  ).rows[0];
  assert.deepEqual(
    pending,
    { sessions: 0, windows: 0 },
    "Run outside accepted work or readiness contracts",
  );
  const grants = (
    await db.query(
      "SELECT count(*)::int AS n FROM journal WHERE kind='LAB_GRANT'",
    )
  ).rows[0].n;
  const route = await ready();
  assert.ok(route.participants.every((p) => p.provider_id === login.user.id));
  const model = (await api("/models")).data.find(
    (m) => m.id === profile.model_id,
  );
  report.model = {
    parameters: "32.8B",
    artifact_sha256: model.manifest.artifact_sha256,
    revision: model.manifest.revision,
    manifest_sha256: route.manifest_sha256,
    route_sha256: route.route_sha256,
  };
  const engine = JSON.parse(
    await readFile(join(runtime, "cpu-route", "engine", "status.json"), "utf8"),
  );
  delete engine.pids;
  report.engine = engine;
  report.loaded_transport = await snapshots();
  for (const p of [43125, 43126]) {
    const h = await fetch(`http://127.0.0.1:${p}/health`).then((r) => r.json());
    assert.equal(h.rpc_route_bound, true);
    assert.equal(h.startup_budget_closed, true);
    assert.equal(h.ready, true);
  }
  pass("both_rpc_pairs_bound_loaded_and_guarded_on_one_physical_domain");
  key = await api("/keys", "POST", {
    label: "Temporary 32B RPC transport acceptance",
  });
  await infer("quic_complete_route");
  pass("32b_output_three_receipts_conserved_payout_and_measured_quic_bytes");
  const pair = await Promise.all([
    infer("concurrent_a"),
    infer("concurrent_b"),
  ]);
  pair.sort((x, y) => new Date(x.started_at) - new Date(y.started_at));
  assert.ok(new Date(pair[1].started_at) >= new Date(pair[0].finished_at));
  pass("concurrent_consumers_serialize_on_the_single_physical_domain");
  if (a.fault) {
    const response = await fetch(
      `http://127.0.0.1:${c.gateway_port}/v1/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: profile.model_id,
          stream: true,
          max_tokens: 128,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: "Count from 1 to 100, one number per line.",
            },
          ],
        }),
        signal: AbortSignal.timeout(210000),
      },
    );
    assert.ok(response.ok);
    const id = response.headers.get("x-network-ai-session-id");
    assert.ok(id);
    const drained = (async () => {
      for await (const _ of response.body) {
        /* Private text is deliberately discarded. */
      }
    })().catch(() => {});
    await until(async () => (await api(`/sessions/${id}`)).state === "RUNNING");
    needsRecovery = true;
    const faultAt = Date.now();
    await stopRouteRpcStage(2);
    const terminal = await until(async () => {
      const s = await api(`/sessions/${id}`);
      return ["FAILED", "CANCELLED", "INTERRUPTED"].includes(s.state) && s;
    }, 40);
    assert.equal(terminal.charged_microtu, "0");
    assert.ok(terminal.participants.every((p) => p.paid_microtu === "0"));
    const claimCount = (
      await db.query(
        "SELECT count(*)::int AS n FROM active_session_domains WHERE session_id=$1",
        [id],
      )
    ).rows[0].n;
    assert.equal(claimCount, 0);
    await drained;
    report.fault = {
      injected: "terminate_only_tracked_second_stage_quic_link",
      state: terminal.state,
      billing_state: terminal.billing_state,
      charged_microtu: terminal.charged_microtu,
      physical_claims_remaining: claimCount,
      detection_ms: Date.now() - faultAt,
      client_cancel_injected: false,
    };
    pass(
      "mid_execution_quic_loss_ends_session_without_charge_or_retained_physical_claim",
    );
    await stopCpu();
    await startCpuRoute(profile);
    await ready();
    needsRecovery = false;
    await infer("after_whole_route_restart");
    pass(
      "same_profile_reload_restores_real_32b_execution_without_new_identities",
    );
  }
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM journal WHERE kind='LAB_GRANT'",
      )
    ).rows[0].n,
    grants,
  );
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
  report.new_lab_grants = 0;
  report.ledger_projection_mismatches = 0;
  pass("existing_credits_only_with_zero_ledger_projection_mismatches");
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = error.message;
  throw error;
} finally {
  if (key) await api(`/keys/${key.id}`, "DELETE").catch(() => {});
  if (needsRecovery) {
    try {
      await stopCpu();
      await startCpuRoute(profile);
      await ready();
      report.cleanup_recovered_route = true;
    } catch {
      report.cleanup_recovered_route = false;
    }
  }
  if (cookie) await api("/auth/logout", "POST", {}).catch(() => {});
  await db.end();
  await writeFile(
    join(directory, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600, flush: true },
  );
  console.log(`Private RPC route evidence: ${join(directory, "report.json")}`);
}
