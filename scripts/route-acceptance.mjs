// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Actual 32B inference through three separately signed agents on one host.
// Public summaries omit prompts, responses, credentials, identities and logs.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import os from "node:os";
import { config, root, runtime, protectDirectory } from "./lab.mjs";

const { values: a } = parseArgs({
  options: {
    "engine-dir": { type: "string" },
    "model-dir": { type: "string" },
    manifest: { type: "string" },
    fault: { type: "boolean", default: false },
  },
});
assert.ok(
  a["engine-dir"] && a["model-dir"] && a.manifest,
  "Use --engine-dir PATH --model-dir PATH --manifest FILE [--fault]",
);
const artifact = JSON.parse(await readFile(resolve(a.manifest), "utf8"));
assert.ok(
  os.freemem() > artifact.files[0].bytes + 6 * 1024 ** 3,
  "Stop the project's idle CPU cluster before this campaign; insufficient free host RAM.",
);
const c = await config(),
  id = randomUUID(),
  directory = join(runtime, "route-campaigns", id);
await mkdir(directory, { recursive: true, mode: 0o700 });
await protectDirectory(directory);
const engineDirectory = join(directory, "engine");
await mkdir(engineDirectory, { mode: 0o700 });
const engineKey = join(engineDirectory, "engine-api-key.txt");
await writeFile(engineKey, randomBytes(32).toString("base64url") + "\n", {
  flag: "wx",
  mode: 0o600,
});
const model = `qwen32b-route-${id.slice(0, 8)}`;
const report = {
  schema_version: 1,
  evidence_type: "REAL_MODEL_PRIVATE_COMPLETE_ROUTE",
  observed_at: new Date().toISOString(),
  physical_hosts: 1,
  independent_operators: 0,
  operator_accounts: 1,
  agent_identities: 3,
  compute: "CPU",
  artifact_sha256: artifact.files[0].sha256,
  model_repository: artifact.model_id,
  checks: [],
  sessions: [],
  public_operation_approved: false,
};
const children = [],
  logs = [],
  invites = [];
let route,
  key,
  stopping = false,
  cookie = "",
  modelCreated = false;
function launch(name, program, args, env = {}) {
  const log = createWriteStream(join(directory, `${name}.log`), {
    flags: "a",
    mode: 0o600,
  });
  logs.push(log);
  const child = spawn(program, args, {
    cwd: root,
    env: { ...process.env, ...env },
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  const record = { name, child, failed: false };
  children.push(record);
  child.once("error", () => {
    record.failed = true;
  });
  child.once("exit", (code) => {
    if (!stopping && code !== 0) record.failed = true;
  });
  return child;
}
async function command(name, program, args, env = {}) {
  const child = launch(name, program, args, env);
  await new Promise((res, rej) => {
    child.once("error", rej);
    child.once("exit", (code) =>
      code === 0
        ? res()
        : rej(new Error(`${name} failed; inspect private log`)),
    );
  });
}
async function api(path, method = "GET", body) {
  const r = await fetch(`http://127.0.0.1:${c.control_port}/api/v1${path}`, {
    method,
    headers: {
      Cookie: cookie,
      Origin: c.web_origin,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const value = await r.json();
  assert.ok(r.ok, `${path}: ${r.status} ${value.error?.code ?? ""}`);
  return value;
}
async function waitFor(check, label, ms = 30000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    assert.ok(
      !children.some((p) => p.failed),
      "A campaign process exited; inspect private logs",
    );
    if (await check().catch(() => false)) return;
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${label}; inspect private logs`);
}
const pass = (name) => {
  report.checks.push(name);
  console.log(`PASS ${name}`);
};
async function infer(label) {
  const start = Date.now();
  const r = await fetch(
    `http://127.0.0.1:${c.gateway_port}/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key.token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({
        model,
        stream: false,
        max_tokens: 16,
        temperature: 0,
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
  const output = await r.json();
  assert.equal(
    r.status,
    200,
    `Route inference failed: ${output.error?.code ?? "response"}`,
  );
  assert.match(output.choices[0].message.content, /route works/i);
  const s = await api(`/sessions/${output.network_ai.session_id}`);
  assert.equal(s.state, "COMPLETED");
  assert.equal(s.billing_state, "SETTLED");
  assert.equal(s.participants.length, 3);
  assert.equal(
    new Set(s.participants.map((p) => p.resource_domain_id)).size,
    1,
  );
  const workers = s.participants.filter((p) => p.role === "STAGE");
  assert.ok(
    workers.every(
      (p) =>
        p.receipt?.state === "COMPLETED" &&
        p.receipt.completed_commands > 0 &&
        BigInt(p.paid_microtu) > 0n,
    ),
  );
  assert.equal(
    s.participants.reduce((n, p) => n + BigInt(p.paid_microtu), 0n),
    BigInt(s.charged_microtu) - (BigInt(s.charged_microtu) * 2000n) / 10000n,
  );
  const summary = {
    label,
    state: s.state,
    billing_state: s.billing_state,
    input_tokens: s.prompt_tokens,
    output_tokens: s.completion_tokens,
    elapsed_ms: Date.now() - start,
    charge_microtu: s.charged_microtu,
    workers: workers.map((p) => ({
      ordinal: p.ordinal,
      completed_commands: p.receipt.completed_commands,
      request_bytes: p.receipt.request_bytes,
      response_bytes: p.receipt.response_bytes,
      paid_microtu: p.paid_microtu,
    })),
    started_at: s.started_at,
    finished_at: s.finished_at,
  };
  report.sessions.push(summary);
  return s;
}
try {
  const login = await fetch(
    `http://127.0.0.1:${c.control_port}/api/v1/auth/login`,
    {
      method: "POST",
      headers: { Origin: c.web_origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        login: c.admin_login,
        password: c.admin_password,
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  assert.ok(login.ok);
  const user = (await login.json()).user;
  cookie = login.headers.get("set-cookie").split(";")[0];
  const current = (await api("/nodes")).data;
  let domain;
  try {
    const installed = JSON.parse(
      await readFile(
        join(runtime, "cpu-cluster", "operator", "config.json"),
        "utf8",
      ),
    );
    domain = current.find(
      (n) => n.id === installed.node_id && n.owner_id === user.id,
    )?.resource_domain_id;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!domain)
    domain = (
      await api("/admin/domains", "POST", {
        name: "Local CPU and RAM · guarded route",
        owner_id: user.id,
        slots: 1,
      })
    ).id;
  await api("/models", "POST", {
    schema_version: 1,
    model_id: model,
    display_name: "Qwen3-32B · guarded route campaign",
    backend_model: "network-ai-qualified-model",
    revision: artifact.revision,
    artifact_sha256: artifact.files[0].sha256,
    license_id: artifact.license_id,
    source_url: artifact.files[0].url,
    modality: "text",
    max_context_tokens: 2048,
    max_output_tokens: 128,
    max_input_bytes: 1400,
    input_rate_microtu: "1000",
    output_rate_microtu: "3000",
    rate_denominator: 1,
    description:
      "Verified 32.8B Q4_K_M; three signed agents and two trusted CPU RPC workers on one physical host.",
    trust_policy: "private_lab",
  });
  modelCreated = true;
  await api(`/admin/models/${model}/qualify`, "POST", {
    state: "LOCAL_PREVIEW",
    note: "Explicit private same-host route campaign using verified official weights; no independent operator or WAN qualification.",
  });
  for (let i = 0; i < 3; i++) {
    const invite = await api("/admin/node-invites", "POST", {
      name: `Guarded CPU route part ${i}`,
      owner_id: user.id,
      resource_domain_id: domain,
      model_id: model,
      base_url: `http://127.0.0.1:${43124 + i}`,
      node_kind: i === 0 ? "ROUTE_ROOT" : "RPC_STAGE",
    });
    invites.push(invite);
    const path = join(directory, `invitation-${i}.json`);
    await writeFile(path, JSON.stringify(invite), { flag: "wx", mode: 0o600 });
    await command(`configure-${i}`, process.execPath, [
      join(root, "scripts/node-config.mjs"),
      "--invite-file",
      path,
      "--backend-model",
      "network-ai-qualified-model",
      "--port",
      String(43124 + i),
      "--backend-url",
      "http://127.0.0.1:43224",
      "--backend-kind",
      "openai",
      "--backend-key-file",
      engineKey,
      "--directory",
      join(directory, `operator-${i}`),
    ]);
  }
  for (let i = 1; i < 3; i++)
    launch(`stage-${i}`, process.execPath, [
      join(root, "scripts/stage-agent.mjs"),
      "--config",
      join(directory, `operator-${i}`, "config.json"),
      "--rpc-listen-port",
      String(43841 + i),
      "--rpc-target-port",
      String(43839 + i),
      "--startup-compute-commands",
      "4",
    ]);
  await waitFor(async () => {
    const values = await Promise.all(
      [43125, 43126].map((p) =>
        fetch(`http://127.0.0.1:${p}/health`).then((r) => r.ok),
      ),
    );
    return values.every(Boolean);
  }, "stage HTTP listeners");
  launch("cluster", process.execPath, [
    join(root, "scripts/cluster.mjs"),
    "--engine-dir",
    resolve(a["engine-dir"]),
    "--model-dir",
    resolve(a["model-dir"]),
    "--manifest",
    resolve(a.manifest),
    "--directory",
    engineDirectory,
    "--workers",
    "2",
    "--port",
    "43224",
    "--rpc-port",
    "43840",
    "--rpc-forward-port",
    "43842",
    "--threads",
    "8",
  ]);
  console.log("Loading the verified 32B model through the guarded CPU stages.");
  await waitFor(
    async () => {
      const values = await Promise.all(
        [43125, 43126].map((p) =>
          fetch(`http://127.0.0.1:${p}/health`).then((r) => r.json()),
        ),
      );
      return values.every((v) => v.ready);
    },
    "guarded model readiness",
    600000,
  );
  launch(
    "root",
    join(
      root,
      `target/debug/network-ai-node${process.platform === "win32" ? ".exe" : ""}`,
    ),
    [],
    { NETWORK_AI_CONFIG: join(directory, "operator-0", "config.json") },
  );
  await waitFor(
    async () =>
      (await fetch("http://127.0.0.1:43124/health").then((r) => r.json()))
        .ready,
    "root node readiness",
  );
  route = await api("/routes", "POST", {
    name: "Verified 32B private complete route",
    model_id: model,
    idempotency_key: randomUUID(),
    participants: invites.map((n, i) => ({
      node_id: n.id,
      share_bps: i === 0 ? 1000 : 4500,
    })),
  });
  await api(`/routes/${route.id}/accept`, "POST", {
    route_sha256: route.route_sha256,
  });
  await api(`/admin/routes/${route.id}/qualify`, "POST", {
    state: "LOCAL_PREVIEW",
    note: "Private same-host RPC guard campaign; one operator and one CPU domain, with separately signed stage observations.",
  });
  key = await api("/keys", "POST", {
    label: "Temporary complete-route acceptance",
  });
  report.startup = await Promise.all(
    [43125, 43126].map(async (p) => {
      const health = await fetch(`http://127.0.0.1:${p}/health`).then((r) =>
        r.json(),
      );
      assert.equal(health.startup_budget_closed, true);
      return {
        completed_commands: health.startup_compute_commands,
        budget: 4,
        billable: false,
        closed: true,
      };
    }),
  );
  pass("three_agents_ready_one_physical_domain");
  await infer("complete_route");
  pass("real_32b_inference_three_receipts_and_conserved_payout");
  const pair = await Promise.all([
    infer("concurrent_a"),
    infer("concurrent_b"),
  ]);
  pair.sort((x, y) => new Date(x.started_at) - new Date(y.started_at));
  assert.ok(new Date(pair[1].started_at) >= new Date(pair[0].finished_at));
  pass("concurrent_calls_do_not_overlap_the_shared_domain");
  if (a.fault) {
    const stream = await fetch(
      `http://127.0.0.1:${c.gateway_port}/v1/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
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
    const session = stream.headers.get("x-network-ai-session-id");
    assert.ok(session);
    await waitFor(
      async () => (await api(`/sessions/${session}`)).state === "RUNNING",
      "fault session claim",
    );
    children.find((p) => p.name === "stage-2").child.kill();
    // Keep the client connected: only the stage process is deliberately lost.
    const drained = (async () => {
      for await (const _ of stream.body) {
        /* discard private text */
      }
    })().catch(() => {});
    // A killed stage is an expected observation in this branch.
    for (const p of children) p.failed = false;
    const until = Date.now() + 30000;
    let ended;
    while (Date.now() < until) {
      ended = await api(`/sessions/${session}`);
      if (["FAILED", "CANCELLED", "INTERRUPTED"].includes(ended.state)) break;
      await delay(500);
    }
    assert.ok(["FAILED", "CANCELLED", "INTERRUPTED"].includes(ended.state));
    assert.equal(ended.charged_microtu, "0");
    await drained;
    report.fault = {
      state: ended.state,
      billing_state: ended.billing_state,
      charged_microtu: ended.charged_microtu,
      client_cancel_injected: false,
    };
    pass("stage_process_loss_cancels_or_fails_without_charge");
  }
  report.engine = JSON.parse(
    await readFile(join(engineDirectory, "status.json"), "utf8"),
  );
  delete report.engine.pids;
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  throw error;
} finally {
  stopping = true;
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
  if (route)
    await api(`/admin/routes/${route.id}/qualify`, "POST", {
      state: "REVOKED",
      note: "Temporary route campaign ended; historical evidence is retained.",
    }).catch(() => {});
  for (const invite of invites)
    await api(`/nodes/${invite.id}/state`, "POST", { state: "REVOKED" }).catch(
      () => {},
    );
  if (modelCreated)
    await api(`/admin/models/${model}/qualify`, "POST", {
      state: "REVOKED",
      note: "Temporary route campaign ended; not a permanent production offer.",
    }).catch(() => {});
  for (const { child } of children)
    if (child.exitCode === null && !child.killed) child.stdin.write("stop\n");
  for (
    let i = 0;
    i < 20 &&
    children.some(({ child }) => child.exitCode === null && !child.killed);
    i++
  )
    await delay(250);
  for (const { child } of children)
    if (child.exitCode === null && !child.killed) child.kill();
  for (const log of logs) log.end();
  if (cookie) await api("/auth/logout", "POST", {}).catch(() => {});
  await writeFile(
    join(directory, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600, flush: true },
  );
  console.log(
    `Private route evidence saved: ${join(directory, "report.json")}`,
  );
}
