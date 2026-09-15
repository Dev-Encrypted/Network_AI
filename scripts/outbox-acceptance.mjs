// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { join } from "node:path";
import { config, launch, stopApplicationComponent, runtime } from "./lab.mjs";
import { serviceStatus, serviceFiles } from "./service-process.mjs";
import { atomicJson } from "../packages/contributor/src/state.mjs";
const c = await config();
const base = `http://127.0.0.1:${c.control_port}/api/v1`;
const control = JSON.parse(
  await readFile(join(runtime, "processes.json"), "utf8"),
).control;
assert.ok(control, "Start the tracked control service before this campaign");
// Observe ownership before requesting inference so process inspection cannot
// delay injection until after a short model response has already settled.
const owned = control.service
  ? await serviceStatus(control.service.profile)
  : null;
if (owned) assert.ok(owned.live && owned.child_alive);
async function until(probe, timeout = 12000) {
  const deadline = Date.now() + timeout;
  do {
    if (await probe()) return;
    await delay(50);
  } while (Date.now() < deadline);
  throw new Error("Bounded outbox observation timed out");
}
const restoreControl = () =>
  launch(
    "control",
    control.program,
    control.args,
    control.port,
    `${base}/health`,
    control.options ?? {},
  );
const reachable = async () => {
  try {
    return (await fetch(`${base}/health`, { signal: AbortSignal.timeout(300) }))
      .ok;
  } catch {
    return false;
  }
};
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
          content: "Count from 1 to 100, one number per line.",
        },
      ],
      stream: true,
      max_tokens: 128,
    }),
    signal: AbortSignal.timeout(45000),
  },
);
assert.equal(response.status, 200);
const id = response.headers.get("x-network-ai-session-id");
assert.ok(id);
const text = response.text();
text.catch(() => {});
for (let i = 0; i < 100; i++) {
  if ((await session(id)).state === "RUNNING") break;
  await delay(20);
}
assert.equal((await session(id)).state, "RUNNING");
let observedOutageMs;
const receiptFile = join(c.state_dir, "node", "outbox", `${id}.json`);
let persisted;
try {
  if (owned)
    await atomicJson(serviceFiles(control.service.profile).stop, {
      boot_id: owned.boot_id,
    });
  else await stopApplicationComponent("control");
  await until(async () => !(await reachable()), 5000);
  const unavailableAt = Date.now();
  // Keep the coordinator unavailable until actual persistence is observed.
  // The bound stops a failed experiment from becoming an indefinite outage.
  await until(async () => {
    try {
      persisted = JSON.parse(await readFile(receiptFile, "utf8"));
      return true;
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      return false;
    }
  });
  assert.equal(persisted.session_id, id);
  assert.equal(persisted.state, "COMPLETED");
  assert.equal(persisted.stream_done, true);
  assert.equal(await reachable(), false);
  let timer;
  let stream;
  try {
    stream = await Promise.race([
      text,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Pending-receipt stream did not finish")),
          7000, // The node's signed receipt request itself has a five-second timeout.
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  assert.ok(stream.includes("[DONE]"));
  assert.ok(
    stream.includes("receipt_pending"),
    "The observed outage must overlap receipt delivery",
  );
  await restoreControl();
  observedOutageMs = Date.now() - unavailableAt;
} finally {
  if (!(await reachable())) await restoreControl();
}
let recovered;
for (let i = 0; i < 30; i++) {
  recovered = await session(id);
  if (recovered.state === "COMPLETED") break;
  await delay(500);
}
assert.equal(recovered.state, "COMPLETED");
assert.equal(recovered.billing_state, "SETTLED");
assert.equal(recovered.prompt_tokens, persisted.prompt_tokens);
assert.equal(recovered.completion_tokens, persisted.completion_tokens);
assert.equal(recovered.events.filter((e) => e.kind === "terminal").length, 1);
await until(async () => {
  try {
    await readFile(receiptFile);
    return false;
  } catch (e) {
    if (e.code === "ENOENT") return true;
    throw e;
  }
});
await writeFile(
  join(runtime, "outbox-report.json"),
  JSON.stringify(
    {
      evidence_type: "REAL_CONTROL_OUTAGE_WITH_RECEIPT_OUTBOX",
      observed_at: new Date().toISOString(),
      session_id: id,
      observed_control_outage_ms: observedOutageMs,
      outage_observation:
        "first failed health check through confirmed restored readiness",
      receipt_wait_bound_ms: 12000,
      pending_stream_wait_bound_ms: 7000,
      receipt_observed_on_disk_while_control_unavailable: true,
      outbox_removed_after_acceptance: true,
      terminal_settlements: 1,
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
