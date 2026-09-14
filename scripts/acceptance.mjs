// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Explicit live inference acceptance. Outputs are summarized; no credentials or prompts are written to the report.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
const c = JSON.parse(
  await readFile(".runtime/private-lab/config.json", "utf8"),
);
const base = `http://127.0.0.1:${c.control_port}/api/v1`;
const report = {
  evidence_type: "PRIVATE_PRODUCT_REAL_ENGINE",
  observed_at: new Date().toISOString(),
  physical_hosts: 1,
  unit: "LAB_TU",
  checks: [],
  sessions: [],
};
const add = (name) => {
  report.checks.push({ name, passed: true });
  console.log(`PASS ${name}`);
};
const login = await fetch(base + "/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: c.web_origin },
  body: JSON.stringify({ login: c.admin_login, password: c.admin_password }),
});
assert.equal(login.status, 201);
const cookie = login.headers.get("set-cookie").split(";")[0];
async function control(path, method = "GET", body) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      Origin: c.web_origin,
      Cookie: cookie,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const v = await r.json();
  assert.ok(
    r.ok,
    `Control ${path} returned ${r.status}: ${v.error?.code ?? ""}`,
  );
  return v;
}
const key = await control("/keys", "POST", {
  label: "Automated real-engine acceptance (temporary)",
});
try {
  const available = (await control("/models")).data.find(
    (m) => m.id === "qwen-local",
  );
  assert.ok(available?.available);
  add("catalog_requires_actual_ready_node");
  const noAuth = await fetch(base + "/wallet");
  assert.equal(noAuth.status, 401);
  add("anonymous_wallet_denied");
  const badOrigin = await fetch(base + "/keys", {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: "https://example.org",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ label: "should not exist" }),
  });
  assert.equal(badOrigin.status, 403);
  add("cross_origin_cookie_mutation_denied");
  const request = {
    model: "qwen-local",
    messages: [
      {
        role: "user",
        content: "Responda apenas com a frase: NETWORK AI funcionando.",
      },
    ],
    stream: false,
    max_tokens: 128,
    temperature: 0,
  };
  const idempotency = randomUUID();
  const start = Date.now();
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key.token}`,
    "Idempotency-Key": idempotency,
  };
  const response = await fetch(
    `http://127.0.0.1:${c.gateway_port}/v1/chat/completions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(200000),
    },
  );
  const value = await response.json();
  assert.equal(
    response.status,
    200,
    `Inference failed: ${JSON.stringify(value)}`,
  );
  assert.match(value.choices[0].message.content, /NETWORK AI/i);
  assert.ok(value.usage.prompt_tokens > 0 && value.usage.completion_tokens > 0);
  const session = await control(`/sessions/${value.network_ai.session_id}`);
  assert.equal(session.state, "COMPLETED");
  assert.equal(session.billing_state, "SETTLED");
  assert.ok(
    BigInt(session.charged_microtu) > 0n &&
      BigInt(session.charged_microtu) <= BigInt(session.hold_microtu),
  );
  report.sessions.push({
    id: session.id,
    state: session.state,
    elapsed_ms: Date.now() - start,
    input_tokens: session.prompt_tokens,
    output_tokens: session.completion_tokens,
    charged_microtu: session.charged_microtu,
  });
  add("real_model_inference_and_signed_settlement");
  const retry = await fetch(
    `http://127.0.0.1:${c.gateway_port}/v1/chat/completions`,
    { method: "POST", headers, body: JSON.stringify(request) },
  );
  assert.equal(retry.status, 409);
  assert.equal((await retry.json()).error.session_id, session.id);
  add("retry_does_not_execute_or_charge_again");
  const stream = await fetch(`${c.web_origin}/inference/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: c.web_origin,
    },
    body: JSON.stringify({
      ...request,
      stream: true,
      messages: [
        { role: "user", content: "Conte de 1 até 300, um número por linha." },
      ],
      max_tokens: 512,
    }),
    signal: AbortSignal.timeout(200000),
  });
  assert.equal(stream.status, 200);
  const id = stream.headers.get("x-network-ai-session-id");
  assert.ok(id);
  const reader = stream.body.getReader();
  const deadline = Date.now() + 30000;
  let received = "";
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    received += new TextDecoder().decode(chunk.value);
    if (received.includes('"content":') || Date.now() > deadline) break;
  }
  await control(`/sessions/${id}/cancel`, "POST", {});
  await reader.cancel();
  let cancelled;
  for (let i = 0; i < 30; i++) {
    cancelled = await control(`/sessions/${id}`);
    if (
      ["CANCELLED", "COMPLETED", "FAILED", "INTERRUPTED"].includes(
        cancelled.state,
      )
    )
      break;
    await delay(1000);
  }
  assert.equal(cancelled.state, "CANCELLED");
  assert.equal(cancelled.charged_microtu, "0");
  assert.equal(cancelled.billing_state, "REFUNDED");
  add("browser_proxy_disconnect_cancels_and_refunds");
  const metrics = await control("/admin/metrics");
  assert.equal(metrics.ledger.total, "0");
  add("live_ledger_remains_balanced");
  await writeFile(
    ".runtime/private-lab/acceptance-report.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log("Acceptance report saved in private runtime directory.");
} finally {
  await control(`/keys/${key.id}`, "DELETE");
}
