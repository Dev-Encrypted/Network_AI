// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { config, restart, runtime } from "./lab.mjs";
const c = await config();
const base = `http://127.0.0.1:${c.control_port}/api/v1`;
const login = await fetch(base + "/auth/login", {
  method: "POST",
  headers: { Origin: c.web_origin, "Content-Type": "application/json" },
  body: JSON.stringify({ login: c.admin_login, password: c.admin_password }),
});
assert.equal(login.status, 201);
const cookie = login.headers.get("set-cookie").split(";")[0];
async function getSession(id) {
  return (
    await fetch(base + `/sessions/${id}`, { headers: { Cookie: cookie } })
  ).json();
}
const before = await (
  await fetch(`http://127.0.0.1:${c.node_port}/health`)
).json();
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
      model: "qwen-local",
      messages: [
        {
          role: "user",
          content: "Escreva os números de 1 até 500 por extenso, um por linha.",
        },
      ],
      stream: true,
      max_tokens: 512,
    }),
  },
);
assert.equal(response.status, 200);
const id = response.headers.get("x-network-ai-session-id");
assert.ok(id);
const reader = response.body.getReader();
const drain = (async () => {
  try {
    while (!(await reader.read()).done) {}
  } catch {}
})();
for (let i = 0; i < 100; i++) {
  const s = await getSession(id);
  if (s.state === "RUNNING") break;
  await delay(30);
}
assert.equal((await getSession(id)).state, "RUNNING");
const start = Date.now();
await restart("node");
let recovered;
for (let i = 0; i < 30; i++) {
  recovered = await getSession(id);
  if (["INTERRUPTED", "CANCELLED"].includes(recovered.state)) break;
  await delay(500);
}
// The gateway may request cleanup before the new node epoch reaches the
// reconciler. Both terminal labels must still identify the actual interruption.
assert.ok(["INTERRUPTED", "CANCELLED"].includes(recovered.state));
assert.equal(recovered.error_code, "execution_interrupted");
assert.equal(recovered.charged_microtu, "0");
assert.equal(recovered.billing_state, "REFUNDED");
const after = await (
  await fetch(`http://127.0.0.1:${c.node_port}/health`)
).json();
assert.ok(after.epoch > before.epoch);
assert.equal(after.ready, true);
const { Pool } = createRequire(
  new URL("../apps/control-api/package.json", import.meta.url),
)("pg");
const db = new Pool({
  connectionString: c.database_url,
  options: "-c search_path=nai,public",
});
try {
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM active_session_domains WHERE session_id=$1",
        [id],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM receipts WHERE session_id=$1",
        [id],
      )
    ).rows[0].n,
    0,
  );
} finally {
  await db.end();
}
await drain;
await writeFile(
  join(runtime, "fault-report.json"),
  JSON.stringify(
    {
      evidence_type: "REAL_NODE_PROCESS_RESTART",
      observed_at: new Date().toISOString(),
      physical_hosts: 1,
      session_id: id,
      epoch_before: before.epoch,
      epoch_after: after.epoch,
      recovery_ms: Date.now() - start,
      state: recovered.state,
      error_code: recovered.error_code,
      client_cancel_injected: false,
      retained_physical_claims: 0,
      signed_receipts_from_terminated_node: 0,
      billing_state: recovered.billing_state,
      charged_microtu: "0",
      ready_after: true,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Real node interruption: old epoch fenced, reservation refunded, node ready after restart.",
);
