// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// An owned Windows status-file read lock during actual 32B work. No synthetic receipts.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { config, runtime, protectDirectory } from "./lab.mjs";
import { workerStatus } from "../packages/contributor/src/supervisor.mjs";
assert.equal(
  process.platform,
  "win32",
  "This campaign uses Windows file-sharing semantics",
);
const c = await config(),
  profile = JSON.parse(await readFile(join(runtime, "cpu-route.json"), "utf8"));
assert.equal(profile.worker_supervision, "portable_contributors");
const { Pool } = createRequire(
  new URL("../apps/control-api/package.json", import.meta.url),
)("pg");
const db = new Pool({
  connectionString: c.database_url,
  options: "-c search_path=nai,public",
});
const directory = join(runtime, "contributor-state-campaigns", randomUUID());
await mkdir(directory, { recursive: true, mode: 0o700 });
await protectDirectory(directory);
const report = {
  schema_version: 1,
  evidence_type: "REAL_32B_WITH_WINDOWS_STATUS_READ_LOCK",
  observed_at: new Date().toISOString(),
  physical_hosts: 1,
  operator_accounts: 1,
  physical_resource_domains: 1,
  compute: "CPU",
  unit: "LAB_TU",
  lock_requested_ms: 9000,
  new_lab_grants: 0,
  os_isolation_established: false,
  public_network_operation_approved: false,
};
let cookie = "",
  key,
  lock,
  stream;
async function api(path, method = "GET", body) {
  const r = await fetch(`http://127.0.0.1:${c.control_port}/api/v1${path}`, {
    method,
    headers: {
      Cookie: cookie,
      Origin: c.web_origin,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const v = await r.json();
  assert.ok(r.ok, `API ${path}: ${v.error?.code ?? r.status}`);
  if (path === "/auth/login")
    cookie = r.headers.get("set-cookie").split(";")[0];
  return v;
}
async function until(fn, seconds = 45) {
  const end = Date.now() + seconds * 1000;
  do {
    const v = await fn();
    if (v) return v;
    await delay(100);
  } while (Date.now() < end);
  throw new Error("Contributor status acceptance timed out");
}
const workerFile = (i) =>
  join(runtime, "cpu-route", "portable", `operator-${i}`, "worker.json");
const health = async (i) =>
  (
    await fetch(`http://127.0.0.1:${43224 + i}/health`, {
      signal: AbortSignal.timeout(2000),
    })
  ).json();
try {
  await api("/auth/login", "POST", {
    login: c.admin_login,
    password: c.admin_password,
  });
  await until(async () =>
    (await api("/routes")).data.some(
      (r) => r.id === profile.route_id && r.available,
    ),
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM sessions WHERE state IN ('QUEUED','PREPARING','AUTHORIZED','RUNNING','CANCELLING')",
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM route_availability_leases WHERE state IN ('OFFERED','ACTIVE','DRAINING')",
      )
    ).rows[0].n,
    0,
  );
  const grants = (
    await db.query("SELECT count(*)::int n FROM journal WHERE kind='LAB_GRANT'")
  ).rows[0].n;
  const before = await until(async () => {
    const s = await workerStatus(workerFile(2));
    return s.live && s.ready && s;
  });
  const beforeErrorLog = await readFile(
    join(runtime, "route_contributor_2.err.log"),
    "utf8",
  );
  key = await api("/keys", "POST", {
    label: "Temporary contributor status-file acceptance",
  });
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
  stream = (async () => {
    for await (const _ of response.body) {
      /* Do not retain private model text. */
    }
  })();
  await until(async () => (await api(`/sessions/${id}`)).state === "RUNNING");
  const locked = Promise.withResolvers(),
    lockDone = Promise.withResolvers();
  const command =
    '$ErrorActionPreference="Stop"; $stream=[System.IO.File]::Open($env:NAI_STATUS_READ_LOCK,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::Read); try { Write-Output "locked"; Start-Sleep -Milliseconds 9000 } finally {$stream.Dispose()}';
  lock = spawn(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NAI_STATUS_READ_LOCK: join(
          runtime,
          "cpu-route/portable/operator-2/state/worker-status.json",
        ),
      },
    },
  );
  let text = "";
  lock.stdout.on("data", (c) => {
    text += c;
    if (text.includes("locked")) locked.resolve();
  });
  lock.stderr.resume();
  lock.once("error", (e) => {
    locked.reject(e);
    lockDone.reject(e);
  });
  lock.once("exit", (code) => {
    if (code === 0) lockDone.resolve();
    else {
      const e = new Error("Read-only file lock failed");
      locked.reject(e);
      lockDone.reject(e);
    }
  });
  await locked.promise;
  const started = Date.now();
  await delay(5600);
  const during = await workerStatus(workerFile(2));
  assert.equal(during.process_alive, true);
  assert.equal(during.status_fresh, false);
  assert.equal(during.live, false);
  assert.equal(during.ready, false);
  assert.equal(during.pid, before.pid);
  assert.equal((await health(2)).ready, true);
  report.stale_status_did_not_claim_readiness = true;
  report.live_guard_ready_during_stale_telemetry = true;
  report.session_state_during_lock = (await api(`/sessions/${id}`)).state;
  assert.ok(
    ["RUNNING", "COMPLETED"].includes(report.session_state_during_lock),
  );
  await lockDone.promise;
  report.lock_elapsed_ms = Date.now() - started;
  const after = await until(async () => {
    const s = await workerStatus(workerFile(2));
    return s.live && s.ready && s;
  });
  assert.equal(after.pid, before.pid);
  assert.equal(after.boot_id, before.boot_id);
  assert.deepEqual(after.component_pids, before.component_pids);
  report.same_supervisor_boot_and_children_survived = true;
  await stream;
  const session = await until(async () => {
    const s = await api(`/sessions/${id}`);
    return s.state === "COMPLETED" && s.billing_state === "SETTLED" && s;
  }, 180);
  const rootReceipt = (
    await db.query("SELECT payload FROM receipts WHERE session_id=$1", [id])
  ).rows[0]?.payload;
  assert.equal(rootReceipt?.state, "COMPLETED");
  const stages = session.participants.filter((p) => p.role === "STAGE");
  assert.equal(stages.length, 2);
  assert.ok(
    stages.every(
      (p) =>
        p.receipt?.state === "COMPLETED" && p.receipt.completed_commands > 0,
    ),
  );
  const paid = session.participants.reduce(
      (n, p) => n + BigInt(p.paid_microtu),
      0n,
    ),
    charge = BigInt(session.charged_microtu);
  assert.equal(paid, charge - (charge * 2000n) / 10000n);
  report.session = {
    state: session.state,
    billing_state: session.billing_state,
    prompt_tokens: session.prompt_tokens,
    completion_tokens: session.completion_tokens,
    charged_microtu: session.charged_microtu,
    provider_paid_microtu: String(paid),
    platform_fee_microtu: String(charge - paid),
    accepted_receipts: 3,
    physical_domains: new Set(
      session.participants.map((p) => p.resource_domain_id),
    ).size,
  };
  const log = (
    await readFile(join(runtime, "route_contributor_2.err.log"), "utf8")
  ).slice(beforeErrorLog.length);
  const diagnostics = log
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(
      (v) =>
        v &&
        ["worker_status_degraded", "worker_status_recovered"].includes(v.event),
    );
  assert.ok(
    diagnostics.some(
      (v) => v.event === "worker_status_degraded" && v.operation === "replace",
    ),
  );
  assert.ok(diagnostics.some((v) => v.event === "worker_status_recovered"));
  report.diagnostics = diagnostics;
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM journal WHERE kind='LAB_GRANT'",
      )
    ).rows[0].n,
    grants,
  );
  assert.equal(
    (await db.query("SELECT sum(balance)::text total FROM ledger_accounts"))
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
  report.ledger_projection_mismatches = 0;
  report.result = "PASS";
  console.log(
    "PASS actual 32B work, three receipts and unchanged contributor processes across a 9-second Windows status-file read lock",
  );
} catch (error) {
  report.result = "FAIL";
  report.error = error.message;
  throw error;
} finally {
  if (lock?.exitCode === null) lock.kill();
  await stream?.catch(() => {});
  if (key) {
    try {
      assert.equal((await api(`/keys/${key.id}`, "DELETE")).revoked, true);
      report.cleanup_key_revoked = true;
    } catch {
      report.cleanup_key_revoked = false;
      report.result = "FAIL";
      process.exitCode = 1;
    }
  }
  if (cookie) await api("/auth/logout", "POST", {}).catch(() => {});
  await db.end();
  await writeFile(
    join(directory, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600, flush: true },
  );
  console.log(
    `Private status-lock evidence: ${join(directory, "report.json")}`,
  );
}
