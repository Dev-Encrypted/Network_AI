// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Actual installed model and driver observations on the authorized local computer.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import {
  config,
  runtime,
  protectDirectory,
  faultContributorComponent,
  faultServiceComponent,
} from "./lab.mjs";
import {
  deviceRouteDirectory,
  startDeviceRoute,
  stopDeviceRoute,
} from "./device-route.mjs";
import { loadDeviceRecipe } from "./device-route-profile.mjs";
import { workerStatus } from "../packages/contributor/src/supervisor.mjs";
import { loadProfile, hashFile } from "../packages/contributor/src/profile.mjs";
import { availableDevices } from "../packages/contributor/src/devices.mjs";
import {
  serviceStatus,
  childProcessIdentities,
  processIdentity,
} from "./service-process.mjs";
const { values: args } = parseArgs({
  options: {
    id: { type: "string" },
    fault: { type: "boolean", default: false },
    "root-host-fault": { type: "boolean", default: false },
    "competing-gpu-model": { type: "string" },
    "competing-cpu-model": { type: "string" },
  },
});
assert.ok(
  !(args.fault && args["root-host-fault"]),
  "Select one distinct fault campaign at a time",
);
const location = deviceRouteDirectory(args.id),
  recipe = await loadDeviceRecipe(join(location, "recipe.json"));
const installed = JSON.parse(
  await readFile(join(location, "installation.json"), "utf8"),
);
assert.equal(installed.enabled, true);
const c = await config();
const { Pool } = createRequire(
  new URL("../apps/control-api/package.json", import.meta.url),
)("pg");
const db = new Pool({
  connectionString: c.database_url,
  options: "-c search_path=nai,public",
});
const directory = join(runtime, "device-campaigns", randomUUID());
await mkdir(directory, { recursive: true, mode: 0o700 });
await protectDirectory(directory);
const report = {
  schema_version: 1,
  evidence_type: "REAL_SINGLE_HOST_CPU_CUDA_MODEL_ROUTE",
  observed_at: new Date().toISOString(),
  physical_hosts: 1,
  operator_accounts: 1,
  independent_operators: 0,
  relay_enabled: false,
  unit: "LAB_TU",
  cash_payments: false,
  new_domains: 0,
  database_observations_fabricated: false,
  public_operation_approved: false,
  sustainable_economics_established: false,
  execution_profile: recipe.model.execution_profile,
  sessions: [],
  response_observations: [],
  checks: [],
  faults: [],
};
let cookie = "",
  key,
  recovery = false;
const pass = (name) => {
  report.checks.push(name);
  console.log(`PASS ${name}`);
};
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
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
    redirect: "error",
  });
  const value = await r.json();
  assert.ok(r.ok, `API ${path}: ${r.status} ${value.error?.code ?? "unknown"}`);
  if (path === "/auth/login")
    cookie = r.headers.get("set-cookie").split(";")[0];
  return value;
}
async function until(probe, seconds = 45) {
  const end = Date.now() + seconds * 1000;
  do {
    const value = await probe();
    if (value) return value;
    await delay(250);
  } while (Date.now() < end);
  throw new Error(
    "Device campaign timed out; retained evidence identifies the incomplete phase",
  );
}
const ready = () =>
  until(async () =>
    (await api("/routes")).data.find(
      (r) => r.id === installed.route.id && r.available,
    ),
  );
async function snapshots() {
  const records = [];
  for (let i = 1; i <= recipe.stages.length; i++) {
    const worker = await workerStatus(
      join(location, `operator-${i}`, "worker.json"),
    );
    assert.ok(worker.live && worker.ready && worker.rpc_memory);
    assert.equal(worker.containment?.parent_pid, worker.pid);
    assert.equal(worker.containment?.boot_id, worker.boot_id);
    assert.equal(worker.containment?.kill_on_close, true);
    assert.ok(
      BigInt(worker.rpc_memory.allocated_bytes) <=
        BigInt(worker.rpc_memory.limit_bytes),
    );
    assert.ok(
      BigInt(worker.rpc_memory.peak_allocated_bytes) <=
        BigInt(worker.rpc_memory.limit_bytes),
    );
    const rpc = await json(join(location, `root-rpc-${i}`, "rpc-status.json"));
    assert.ok(Math.abs(Date.now() - rpc.observed_at_unix_ms) < 5000);
    assert.equal(rpc.counters.active_tunnels, 1);
    records.push({
      ordinal: i,
      device: worker.device,
      rpc_memory: worker.rpc_memory,
      transport: rpc.transport,
      counters: rpc.counters,
    });
  }
  return records;
}
async function request(model, stream = false, max = 16) {
  return fetch(`http://127.0.0.1:${c.gateway_port}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key.token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify({
      model,
      stream,
      max_tokens: max,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: stream
            ? "Count from 1 to 100, one number per line."
            : "Reply only with these two words: route works.",
        },
      ],
    }),
    signal: AbortSignal.timeout(210000),
  });
}
async function settled(id, label, mixed = true) {
  const s = await until(async () => {
    const s = await api(`/sessions/${id}`);
    return s.state === "COMPLETED" && s.billing_state === "SETTLED" && s;
  });
  if (mixed) {
    assert.equal(s.route_id, installed.route.id);
    assert.equal(s.participants.length, recipe.stages.length + 1);
    const domains = [
      ...new Set(s.participants.map((p) => p.resource_domain_id)),
    ].sort();
    assert.deepEqual(
      domains,
      [
        ...new Set([
          recipe.root_resource_domain_id,
          ...recipe.stages.map((st) => st.resource_domain_id),
        ]),
      ].sort(),
    );
    const root = (
      await db.query("SELECT payload FROM receipts WHERE session_id=$1", [s.id])
    ).rows[0]?.payload;
    assert.equal(root?.state, "COMPLETED");
    assert.ok(
      s.participants
        .filter((p) => p.role === "STAGE")
        .every(
          (p) =>
            p.receipt?.state === "COMPLETED" &&
            p.receipt.completed_commands > 0 &&
            BigInt(p.receipt.request_bytes) > 0n &&
            BigInt(p.receipt.response_bytes) > 0n,
        ),
    );
    const charge = BigInt(s.charged_microtu),
      paid = s.participants.reduce(
        (sum, p) => sum + BigInt(p.paid_microtu),
        0n,
      );
    assert.equal(paid, charge - (charge * 2000n) / 10000n);
    report.sessions.push({
      label,
      model: s.model_id,
      state: s.state,
      billing_state: s.billing_state,
      started_at: s.started_at,
      finished_at: s.finished_at,
      prompt_tokens: s.prompt_tokens,
      completion_tokens: s.completion_tokens,
      charged_microtu: s.charged_microtu,
      provider_paid_microtu: String(paid),
      platform_fee_microtu: String(charge - paid),
      worker_receipts: s.participants
        .filter((p) => p.role === "STAGE")
        .map((p) => ({
          ordinal: p.ordinal,
          completed_commands: p.receipt.completed_commands,
          request_bytes: p.receipt.request_bytes,
          response_bytes: p.receipt.response_bytes,
          paid_microtu: p.paid_microtu,
        })),
    });
  } else
    report.sessions.push({
      label,
      model: s.model_id,
      state: s.state,
      billing_state: s.billing_state,
      started_at: s.started_at,
      finished_at: s.finished_at,
      prompt_tokens: s.prompt_tokens,
      completion_tokens: s.completion_tokens,
      charged_microtu: s.charged_microtu,
    });
  return s;
}
async function infer(label, model = recipe.model.model_id) {
  const manifest =
    model === recipe.model.model_id
      ? recipe.model
      : (await api("/models")).data.find((m) => m.id === model)?.manifest;
  assert.ok(manifest, "Competing model must already be registered");
  const max =
    model === recipe.model.model_id
      ? 16
      : Math.min(256, manifest.max_output_tokens);
  const r = await request(model, false, max),
    result = await r.json();
  report.response_observations.push({
    label,
    model,
    requested_max_tokens: max,
    status: r.status,
    finish_reason: result.choices?.[0]?.finish_reason ?? null,
    visible_characters: result.choices?.[0]?.message?.content?.length ?? 0,
    reasoning_characters:
      result.choices?.[0]?.message?.reasoning_content?.length ?? 0,
    usage: result.usage ?? null,
  });
  assert.equal(
    r.status,
    200,
    `Inference ${label}: ${result.error?.code ?? "response"}`,
  );
  assert.ok(
    result.choices?.[0]?.message?.content?.trim(),
    "A real response must contain visible text",
  );
  return settled(
    result.network_ai.session_id,
    label,
    model === recipe.model.model_id,
  );
}
async function stream() {
  const r = await request(recipe.model.model_id, true, 64);
  assert.ok(r.ok, `Mixed stream rejected: ${r.status}`);
  const id = r.headers.get("x-network-ai-session-id");
  assert.ok(id);
  const drained = (async () => {
    for await (const _ of r.body) {
      /* No private text recorded. */
    }
  })().catch(() => {});
  await until(async () => (await api(`/sessions/${id}`)).state === "RUNNING");
  return { id, drained };
}
try {
  const login = await api("/auth/login", "POST", {
    login: c.admin_login,
    password: c.admin_password,
  });
  const pending = (
    await db.query(
      "SELECT (SELECT count(*) FROM sessions WHERE state IN ('QUEUED','PREPARING','AUTHORIZED','RUNNING','CANCELLING'))::int AS sessions,((SELECT count(*) FROM route_availability_leases WHERE state IN ('OFFERED','ACTIVE','DRAINING'))+(SELECT count(*) FROM availability_leases WHERE state IN ('OFFERED','ACTIVE')))::int AS windows",
    )
  ).rows[0];
  assert.deepEqual(pending, { sessions: 0, windows: 0 });
  const grants = (
    await db.query(
      "SELECT count(*)::int AS n FROM journal WHERE kind='LAB_GRANT'",
    )
  ).rows[0].n;
  const route = await ready();
  assert.ok(route.participants.every((p) => p.provider_id === login.user.id));
  assert.deepEqual(
    (await api("/models")).data.find((m) => m.id === recipe.model.model_id)
      .manifest,
    recipe.model,
  );
  report.model = {
    artifact_sha256: recipe.model.artifact_sha256,
    revision: recipe.model.revision,
    manifest_sha256: route.manifest_sha256,
    route_sha256: route.route_sha256,
  };
  report.physical_resource_domains = new Set(
    route.participants.map((p) => p.resource_domain_id),
  ).size;
  report.contributor_pins = [];
  for (let i = 1; i <= recipe.stages.length; i++) {
    const { profile, pin } = await loadProfile(
      join(location, `operator-${i}`, "worker.json"),
    );
    report.contributor_pins.push({
      ordinal: i,
      engine_id: pin.id,
      verified_engine_files: pin.files.length,
      guardian_sha256: profile.binaries.guardian.sha256,
      http_sha256: profile.binaries.http.sha256,
      rpc_sha256: profile.binaries.rpc.sha256,
      backend_credentials_present: false,
    });
  }
  report.before = await snapshots();
  report.inventory_before = await availableDevices();
  for (const gpu of report.inventory_before.devices.filter(
    (d) => d.kind === "CUDA",
  ))
    delete gpu.uuid;
  key = await api("/keys", "POST", {
    label: "Temporary mixed-device model acceptance",
  });
  await infer("mixed_cuda_cpu");
  pass("real_mixed_model_output_and_all_signed_receipts_conserve_payment");
  const pair = await Promise.all([
    infer("mixed_concurrent_a"),
    infer("mixed_concurrent_b"),
  ]);
  pair.sort((a, b) => new Date(a.started_at) - new Date(b.started_at));
  assert.ok(new Date(pair[1].started_at) >= new Date(pair[0].finished_at));
  pass("mixed_consumers_serialize_on_shared_physical_resources");
  for (const [kind, model] of [
    ["gpu", args["competing-gpu-model"]],
    ["cpu", args["competing-cpu-model"]],
  ]) {
    if (!model) continue;
    const active = await stream();
    const claims = (
      await db.query(
        "SELECT resource_domain_id FROM active_session_domains WHERE session_id=$1 ORDER BY resource_domain_id",
        [active.id],
      )
    ).rows;
    assert.equal(claims.length, report.physical_resource_domains);
    const contender = infer(`existing_${kind}_model_after_shared_claim`, model);
    const first = await settled(active.id, `mixed_owns_${kind}_domain`);
    await active.drained;
    const second = await contender;
    const contenderDomains = (
      await db.query(
        "SELECT resource_domain_id FROM sessions WHERE id=$1 AND resource_domain_id IS NOT NULL UNION SELECT resource_domain_id FROM session_domains WHERE session_id=$1",
        [second.id],
      )
    ).rows;
    const expectedDomain =
      kind === "cpu"
        ? recipe.root_resource_domain_id
        : recipe.stages.find((stage) => stage.device.kind === "CUDA")
            ?.resource_domain_id;
    assert.ok(
      expectedDomain &&
        claims.some((claim) => claim.resource_domain_id === expectedDomain) &&
        contenderDomains.some(
          (claim) => claim.resource_domain_id === expectedDomain,
        ),
      "Both real sessions must be bound to the same tested physical resource",
    );
    assert.ok(new Date(second.started_at) >= new Date(first.finished_at));
    pass(`existing_${kind}_model_waits_for_the_same_physical_resource`);
  }
  report.after_inference = await snapshots();
  for (const [i, snapshot] of report.after_inference.entries()) {
    assert.ok(
      snapshot.counters.root_to_stage_bytes >
        report.before[i].counters.root_to_stage_bytes,
    );
    assert.ok(
      snapshot.counters.stage_to_root_bytes >
        report.before[i].counters.stage_to_root_bytes,
    );
    assert.equal(snapshot.rpc_memory.rejected_allocations, 0);
  }
  pass("both_real_backends_stay_within_observed_buffer_budgets");
  if (args.fault) {
    const index = recipe.stages.findIndex((s) => s.device.kind === "CUDA") + 1;
    assert.ok(index > 0, "CUDA fault evidence requires a CUDA stage");
    const before = await workerStatus(
      join(location, `operator-${index}`, "worker.json"),
    );
    const active = await stream();
    recovery = true;
    const faultAt = Date.now();
    await faultContributorComponent(index, "worker", recipe.id);
    const terminal = await until(async () => {
      const s = await api(`/sessions/${active.id}`);
      return (
        ["FAILED", "INTERRUPTED", "CANCELLED"].includes(s.state) &&
        s.billing_state === "REFUNDED" &&
        s
      );
    }, 45);
    await active.drained;
    assert.equal(terminal.charged_microtu, "0");
    assert.ok(terminal.participants.every((p) => p.paid_microtu === "0"));
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM active_session_domains WHERE session_id=$1",
          [active.id],
        )
      ).rows[0].n,
      0,
    );
    const stopped = await until(async () => {
      const s = await workerStatus(
        join(location, `operator-${index}`, "worker.json"),
      );
      return !s.live && !s.process_alive && s;
    });
    report.faults.push({
      injected: "terminate_owned_cuda_worker",
      state: terminal.state,
      billing_state: terminal.billing_state,
      charged_microtu: "0",
      retained_claims: 0,
      terminal_and_cleanup_ms: Date.now() - faultAt,
      contributor_phase: stopped.phase,
      original_worker_pid_observed: Boolean(before.component_pids.worker),
      client_cancel_injected: false,
    });
    pass("cuda_worker_loss_refunds_and_releases_both_resource_claims");
    await stopDeviceRoute(recipe.id);
    await startDeviceRoute(recipe.id);
    await ready();
    recovery = false;
    await infer("after_cuda_worker_reload");
    report.after_recovery = await snapshots();
    pass("same_profile_and_identities_reload_after_cuda_failure");
  }
  if (args["root-host-fault"]) {
    const services = await json(join(runtime, "processes.json")),
      name = `device_${recipe.id}_cluster`,
      entry = services[name];
    assert.ok(
      entry.service,
      "Root host fault requires the installed protected service",
    );
    const before = await serviceStatus(entry.service.profile);
    const descendants = await childProcessIdentities(before.child_pid);
    const engine = descendants.find(
      (p) =>
        p.program.toLowerCase() ===
        join(recipe.root_engine_directory, "llama-server.exe").toLowerCase(),
    );
    assert.ok(
      engine,
      "Observe the actual owned model server before injecting failure",
    );
    const siblings = [];
    for (const [key, value] of Object.entries(services))
      if (key !== name && value.service) {
        const s = await serviceStatus(value.service.profile);
        if (s.live)
          siblings.push({
            profile: value.service.profile,
            boot: s.boot_id,
            pid: s.pid,
          });
      }
    const active = await stream();
    recovery = true;
    const faultAt = Date.now();
    const killed = await faultServiceComponent(name, "host");
    const terminal = await until(async () => {
      const s = await api(`/sessions/${active.id}`);
      return (
        ["FAILED", "INTERRUPTED", "CANCELLED"].includes(s.state) &&
        s.billing_state === "REFUNDED" &&
        s
      );
    }, 45);
    await active.drained;
    assert.equal(terminal.charged_microtu, "0");
    assert.ok(terminal.participants.every((p) => p.paid_microtu === "0"));
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM active_session_domains WHERE session_id=$1",
          [active.id],
        )
      ).rows[0].n,
      0,
    );
    for (const pid of [
      killed.host.pid,
      killed.child.pid,
      killed.guardian_pid,
      engine.pid,
    ])
      await until(async () => !(await processIdentity(pid)));
    for (const sibling of siblings) {
      const current = await serviceStatus(sibling.profile);
      assert.equal(current.live, true);
      assert.equal(current.pid, sibling.pid);
      assert.equal(current.boot_id, sibling.boot);
    }
    report.service_faults = [
      {
        injected: "terminate_owned_root_service_host",
        guardian_sha256: killed.guardian_sha256,
        state: terminal.state,
        billing_state: terminal.billing_state,
        charged_microtu: "0",
        retained_claims: 0,
        terminal_and_cleanup_ms: Date.now() - faultAt,
        owned_host_guardian_cluster_and_model_server_gone: true,
        unchanged_live_sibling_services: siblings.length,
        client_cancel_injected: false,
      },
    ];
    pass(
      "root_host_loss_closes_actual_model_process_tree_refunds_and_preserves_other_services",
    );
    await stopDeviceRoute(recipe.id);
    await startDeviceRoute(recipe.id);
    await ready();
    recovery = false;
    await infer("after_root_service_host_reload");
    report.after_recovery = await snapshots();
    pass("same_model_route_and_participants_reload_after_root_host_failure");
  }
  const engine = await json(join(location, "engine", "status.json"));
  delete engine.pids;
  report.engine = engine;
  report.inventory_after = await availableDevices();
  for (const gpu of report.inventory_after.devices.filter(
    (d) => d.kind === "CUDA",
  ))
    delete gpu.uuid;
  report.profile_sha256 = await hashFile(join(location, "recipe.json"));
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
  report.result = "PASS";
  pass("no_new_grants_and_zero_ledger_projection_mismatches");
} catch (e) {
  report.result = "FAIL";
  report.error = e.message;
  throw e;
} finally {
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
  if (recovery) {
    try {
      await stopDeviceRoute(recipe.id);
      await startDeviceRoute(recipe.id);
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
  console.log(`Private device evidence: ${join(directory, "report.json")}`);
}
