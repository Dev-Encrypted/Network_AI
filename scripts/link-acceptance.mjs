// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Real model through two QUIC peers, one gateway and a separately enrolled node.
// Both peers run on ONE physical machine. This is not a LAN/WAN benchmark.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { config, root, runtime, protectDirectory } from "./lab.mjs";
import { parseArgs } from "node:util";

const c = await config();
const { values: options } = parseArgs({
  options: Object.fromEntries(
    ["cluster-manifest", "backend-key-file"].map((k) => [
      k,
      { type: "string" },
    ]),
  ),
});
const artifact = options["cluster-manifest"]
  ? JSON.parse(await readFile(options["cluster-manifest"], "utf8"))
  : null;
const backend = artifact
  ? {
      backend_model: "network-ai-qualified-model",
      backend_url: "http://127.0.0.1:43220",
      backend_kind: "openai",
    }
  : c;
if (artifact && !options["backend-key-file"])
  throw new Error("The cluster profile requires --backend-key-file");
const campaign = join(runtime, "link-campaigns", randomUUID());
await mkdir(campaign, { recursive: true, mode: 0o700 });
await protectDirectory(campaign);
const base = `http://127.0.0.1:${c.control_port}/api/v1`;
const login = await fetch(base + "/auth/login", {
  method: "POST",
  headers: { Origin: c.web_origin, "Content-Type": "application/json" },
  body: JSON.stringify({ login: c.admin_login, password: c.admin_password }),
});
assert.ok(login.ok);
const user = (await login.json()).user;
const cookie = login.headers.get("set-cookie").split(";")[0];
async function control(path, method = "GET", body) {
  const r = await fetch(base + path, {
    method,
    headers: {
      Cookie: cookie,
      Origin: c.web_origin,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.ok(r.ok, `Control rejected ${path}: HTTP ${r.status}`);
  return r.json();
}
const children = [];
function child(program, args, env = {}) {
  const p = spawn(program, args, {
    cwd: root,
    windowsHide: true,
    stdio: "ignore",
    env: { ...process.env, ...env },
  });
  children.push(p);
  return p;
}
async function cli(file, args) {
  const p = child(process.execPath, [join(root, "scripts", file), ...args]);
  await new Promise((resolve, reject) => {
    p.once("error", reject);
    p.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${file} failed`)),
    );
  });
}
async function waitFor(probe, ms = 15000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if (await probe()) return;
    } catch {}
    await delay(200);
  }
  throw new Error("Local acceptance readiness timeout");
}
let invitation, lease, modelId;
try {
  let model = (await control("/models")).data.find(
    (m) => m.id === "qwen-local",
  );
  assert.ok(model?.available);
  const primary = (await control("/nodes")).data.find(
    (n) => n.id === c.node_id,
  );
  assert.ok(primary);
  let domainId = primary.resource_domain_id;
  if (artifact) {
    const domain = await control("/admin/domains", "POST", {
      name: "Private CPU cluster campaign (one physical host)",
      owner_id: user.id,
      slots: 1,
    });
    domainId = domain.id;
    model = {
      manifest: {
        schema_version: 1,
        model_id: "qwen3-32b-cpu",
        display_name: "Official Qwen3-32B CPU cluster",
        backend_model: backend.backend_model,
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
          "Pinned official GGUF on trusted CPU RPC workers; one host.",
        trust_policy: "private_lab",
      },
    };
  }
  modelId = `quic-${randomUUID()}`;
  await control("/models", "POST", {
    ...model.manifest,
    model_id: modelId,
    display_name: "Private QUIC acceptance",
    description:
      "Temporary real-engine acceptance configuration; one physical host.",
  });
  await control(`/admin/models/${modelId}/qualify`, "POST", {
    state: "LOCAL_PREVIEW",
    note: "Temporary same-host real-engine QUIC acceptance; no WAN claim.",
  });
  invitation = await control("/admin/node-invites", "POST", {
    name: "Private QUIC campaign node",
    owner_id: user.id,
    resource_domain_id: domainId,
    model_id: modelId,
    base_url: "http://127.0.0.1:43112",
  });
  const invitePath = join(campaign, "invitation.json");
  await writeFile(invitePath, JSON.stringify(invitation), {
    flag: "wx",
    mode: 0o600,
  });
  const controlDir = join(campaign, "control");
  const nodeDir = join(campaign, "node");
  await cli("link-config.mjs", ["identity", "--directory", controlDir]);
  await cli("link-config.mjs", ["identity", "--directory", nodeDir]);
  for (const [dir, role, peer, bind, forward, target] of [
    [
      controlDir,
      "control",
      nodeDir,
      "127.0.0.1:43812",
      "43112",
      String(c.control_port),
    ],
    [nodeDir, "node", controlDir, "127.0.0.1:43813", "43114", "43113"],
  ])
    await cli("link-config.mjs", [
      "configure",
      "--directory",
      dir,
      "--role",
      role,
      "--node-id",
      invitation.id,
      "--peer-file",
      join(peer, "identity.json"),
      "--peer-address",
      role === "control" ? "127.0.0.1:43813" : "127.0.0.1:43812",
      "--bind",
      bind,
      "--forward-port",
      forward,
      "--target-port",
      target,
    ]);
  const ext = process.platform === "win32" ? ".exe" : "";
  for (const dir of [controlDir, nodeDir])
    child(join(root, `target/debug/network-ai-link${ext}`), [], {
      NETWORK_AI_LINK_CONFIG: join(dir, "link.json"),
    });
  await waitFor(
    async () =>
      (await fetch("http://127.0.0.1:43114/api/v1/admin/users")).status === 403,
  );
  await cli("node-config.mjs", [
    "--invite-file",
    invitePath,
    "--backend-model",
    backend.backend_model,
    "--backend-url",
    backend.backend_url,
    "--backend-kind",
    backend.backend_kind,
    ...(options["backend-key-file"]
      ? ["--backend-key-file", options["backend-key-file"]]
      : []),
    "--port",
    "43113",
    "--control-port",
    "43114",
    "--directory",
    join(nodeDir, "operator"),
  ]);
  const profile = join(nodeDir, "operator", "config.json");
  const operator = JSON.parse(await readFile(profile, "utf8"));
  for (const key of [
    "database_url",
    "database_owner_url",
    "admin_password",
    "gateway_secret",
    "capability_private_key_pem",
  ])
    assert.equal(operator[key], undefined);
  child(join(root, `target/debug/network-ai-node${ext}`), [], {
    NETWORK_AI_CONFIG: profile,
  });
  await waitFor(
    async () =>
      (await (await fetch("http://127.0.0.1:43112/health")).json()).ready ===
      true,
  );
  lease = await control("/availability/leases", "POST", {
    node_id: invitation.id,
    duration_seconds: 30,
    rate_microtu_per_second: "1000",
    idempotency_key: randomUUID(),
  });
  await control(`/availability/leases/${lease.id}/accept`, "POST", {});
  const start = performance.now();
  const response = await fetch(
    `http://127.0.0.1:${c.gateway_port}/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: c.web_origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          {
            role: "user",
            content:
              "Reply with one short sentence confirming that inference completed.",
          },
        ],
        max_tokens: 96,
        stream: false,
      }),
      signal: AbortSignal.timeout(180000),
    },
  );
  const answer = await response.json();
  assert.equal(response.status, 200);
  assert.ok(answer.choices?.[0]?.message?.content);
  const session = await control(`/sessions/${answer.network_ai.session_id}`);
  assert.equal(session.node_id, invitation.id);
  assert.equal(session.state, "COMPLETED");
  assert.equal(session.billing_state, "SETTLED");
  const elapsed = performance.now() - start;
  await delay(2500);
  const ended = await control(
    `/availability/leases/${lease.id}/cancel`,
    "POST",
    {},
  );
  assert.ok(BigInt(ended.paid_microtu) > 0n);
  assert.ok(BigInt(ended.paid_microtu) <= BigInt(ended.budget_microtu));
  const report = {
    schema_version: 1,
    measured_at: new Date().toISOString(),
    physical_hosts: 1,
    transport: "iroh-1.2.0/direct-QUIC",
    relay_enabled: false,
    registration_over_quic: true,
    heartbeat_over_quic: true,
    inference_over_quic: true,
    receipt_over_quic: true,
    control_admin_route_rejected: true,
    operator_profile_has_no_coordinator_secrets: true,
    funded_readiness_paid: true,
    lease_closed_with_remaining_refund: true,
    session_state: session.state,
    billing_state: session.billing_state,
    prompt_tokens: session.prompt_tokens,
    completion_tokens: session.completion_tokens,
    elapsed_ms: Math.round(elapsed),
    lan_wan_qualified: false,
    distributed_between_participants: false,
    backend_profile: artifact
      ? "official-qwen3-32b-trusted-cpu-cluster"
      : "existing-local-gpu-model",
  };
  await writeFile(
    join(campaign, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (lease)
    await control(`/availability/leases/${lease.id}/cancel`, "POST", {}).catch(
      () => undefined,
    );
  if (invitation)
    await control(`/nodes/${invitation.id}/state`, "POST", {
      state: "REVOKED",
    }).catch(() => undefined);
  if (modelId)
    await control(`/admin/models/${modelId}/qualify`, "POST", {
      state: "REVOKED",
      note: "Temporary QUIC acceptance configuration retired after campaign.",
    }).catch(() => undefined);
  for (const p of children) if (p.exitCode === null && !p.killed) p.kill();
}
