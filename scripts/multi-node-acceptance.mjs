// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Two real agents on one physical domain. This is not evidence of a second machine.
import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { join } from "node:path";
import { config, runtime, root } from "./lab.mjs";
const c = await config();
const base = `http://127.0.0.1:${c.control_port}/api/v1`;
const login = await fetch(base + "/auth/login", {
  method: "POST",
  headers: { Origin: c.web_origin, "Content-Type": "application/json" },
  body: JSON.stringify({ login: c.admin_login, password: c.admin_password }),
});
assert.equal(login.status, 201);
const user = (await login.json()).user;
const cookie = login.headers.get("set-cookie").split(";")[0];
async function control(path, method = "GET", body) {
  const r = await fetch(base + path, {
    method,
    headers: {
      Cookie: cookie,
      Origin: c.web_origin,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.ok(r.ok, `Control HTTP ${r.status}`);
  return r.json();
}
const domains = (await control("/admin/domains")).data;
const domain = domains.find((d) => d.owner_id === user.id);
assert.ok(domain);
assert.equal(domain.slots, 1);
const invitation = await control("/admin/node-invites", "POST", {
  name: "Agente temporário da campanha",
  owner_id: user.id,
  resource_domain_id: domain.id,
  model_id: "qwen-local",
  base_url: "http://127.0.0.1:43104",
});
const inviteFile = join(runtime, `invite-${invitation.id}.json`);
await writeFile(inviteFile, JSON.stringify(invitation), {
  flag: "wx",
  mode: 0o600,
});
let child;
try {
  await new Promise((resolve, reject) => {
    const generator = spawn(
      process.execPath,
      [
        join(root, "scripts/node-config.mjs"),
        "--invite-file",
        inviteFile,
        "--backend-model",
        c.backend_model,
        "--port",
        "43104",
      ],
      { cwd: root, windowsHide: true, stdio: "ignore" },
    );
    generator.on("error", reject);
    generator.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("Operator profile generation failed")),
    );
  });
  const operatorPath = join(runtime, "operators", invitation.id, "config.json");
  const operator = JSON.parse(await readFile(operatorPath, "utf8"));
  for (const field of [
    "database_url",
    "database_owner_url",
    "gateway_secret",
    "admin_password",
    "capability_private_key_pem",
  ])
    assert.equal(operator[field], undefined);
  child = spawn(
    join(
      root,
      `target/debug/network-ai-node${process.platform === "win32" ? ".exe" : ""}`,
    ),
    [],
    {
      cwd: root,
      windowsHide: true,
      stdio: "ignore",
      env: { ...process.env, NETWORK_AI_CONFIG: operatorPath },
    },
  );
  for (let i = 0; i < 30; i++) {
    try {
      const health = await (
        await fetch("http://127.0.0.1:43104/health")
      ).json();
      if (health.node_id === invitation.id && health.ready) break;
    } catch {}
    await delay(200);
  }
  const catalog = (await control("/models")).data.find(
    (m) => m.id === "qwen-local",
  );
  assert.equal(catalog.ready_nodes, 2);
  const results = await Promise.all(
    [1, 2].map(async () => {
      const r = await fetch(
        `http://127.0.0.1:${c.gateway_port}/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            Origin: c.web_origin,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "qwen-local",
            messages: [
              { role: "user", content: "Responda apenas: execução validada." },
            ],
            max_tokens: 128,
            stream: false,
          }),
        },
      );
      const value = await r.json();
      assert.equal(r.status, 200);
      return control(`/sessions/${value.network_ai.session_id}`);
    }),
  );
  const sorted = results.sort(
    (a, b) => new Date(a.started_at) - new Date(b.started_at),
  );
  assert.ok(new Date(sorted[0].finished_at) <= new Date(sorted[1].started_at));
  for (const s of sorted) {
    assert.equal(s.state, "COMPLETED");
    assert.equal(s.resource_domain_id, domain.id);
  }
  await writeFile(
    join(runtime, "multi-node-report.json"),
    JSON.stringify(
      {
        evidence_type: "TWO_REAL_AGENTS_ONE_PHYSICAL_DOMAIN",
        observed_at: new Date().toISOString(),
        physical_hosts: 1,
        agents: 2,
        domain_slots: 1,
        concurrent_requests: 2,
        overlapping_executions: 0,
        completed: 2,
        operator_profile_contains_authority_secrets: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Two real agents registered; two concurrent requests completed without overlapping the single physical slot.",
  );
} finally {
  if (child && child.exitCode === null) child.kill();
  await control(`/nodes/${invitation.id}/state`, "POST", { state: "REVOKED" });
}
