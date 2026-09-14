// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { join } from "node:path";
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
async function session(id) {
  return (
    await fetch(base + `/sessions/${id}`, { headers: { Cookie: cookie } })
  ).json();
}
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
          content:
            "Escreva uma frase curta dizendo que o recibo será sincronizado.",
        },
      ],
      stream: true,
      max_tokens: 128,
    }),
  },
);
assert.equal(response.status, 200);
const id = response.headers.get("x-network-ai-session-id");
assert.ok(id);
const text = response.text();
for (let i = 0; i < 100; i++) {
  if ((await session(id)).state === "RUNNING") break;
  await delay(20);
}
assert.equal((await session(id)).state, "RUNNING");
await restart("control", 4000);
const stream = await text;
assert.ok(stream.includes("[DONE]"));
assert.ok(
  stream.includes("receipt_pending"),
  "The bounded control outage must overlap receipt delivery",
);
let recovered;
for (let i = 0; i < 30; i++) {
  recovered = await session(id);
  if (recovered.state === "COMPLETED") break;
  await delay(500);
}
assert.equal(recovered.state, "COMPLETED");
assert.equal(recovered.billing_state, "SETTLED");
await writeFile(
  join(runtime, "outbox-report.json"),
  JSON.stringify(
    {
      evidence_type: "REAL_CONTROL_OUTAGE_WITH_RECEIPT_OUTBOX",
      observed_at: new Date().toISOString(),
      session_id: id,
      control_downtime_ms: 4000,
      stream_completed_while_receipt_pending: true,
      state: recovered.state,
      billing_state: recovered.billing_state,
      charged_microtu: recovered.charged_microtu,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Receipt outbox survived a control outage and settled the original session after recovery.",
);
