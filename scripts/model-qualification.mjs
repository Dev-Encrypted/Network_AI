// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Functional and timing observations through the real admission/receipt path.
// No grants, qualification changes, backend bypass, execution retry or downloads.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { config, root, runtime, protectDirectory } from "./lab.mjs";
import {
  compileSuite,
  checkEnvelope,
  assessAnswer,
  observeCompletion,
  sha256,
  completedRouteReceipts,
} from "./model-qualification-core.mjs";
const { values } = parseArgs({
  options: {
    model: { type: "string", multiple: true },
    suite: {
      type: "string",
      default: "adapters/qualification/text-functional-v1.json",
    },
    "dry-run": { type: "boolean", default: false },
  },
});
assert.ok(
  values.model?.length && values.model.length <= 8,
  "Use --model REGISTERED_ID [--model OTHER_ID] [--dry-run]",
);
assert.equal(
  new Set(values.model).size,
  values.model.length,
  "Duplicate model selection",
);
for (const model of values.model)
  assert.match(model, /^[a-z0-9][a-z0-9._-]{1,79}$/);
const suiteBytes = await readFile(resolve(values.suite)),
  suite = JSON.parse(suiteBytes),
  cases = compileSuite(suite),
  c = await config(),
  directory = join(runtime, "model-qualification", randomUUID());
await mkdir(directory, { recursive: true, mode: 0o700 });
await protectDirectory(directory);
const { Pool } = createRequire(
  new URL("../apps/control-api/package.json", import.meta.url),
)("pg");
const db = new Pool({
  connectionString: c.database_url,
  options: "-c search_path=nai,public",
});
const report = {
  schema_version: 1,
  evidence_type: "PRIVATE_ROUTE_FUNCTIONAL_QUALIFICATION",
  started_at: new Date().toISOString(),
  suite_id: suite.id,
  suite_sha256: sha256(suiteBytes),
  plan_sha256: null,
  dry_run: values["dry-run"],
  topology:
    "Existing private routes; this runner does not attest independent hosts or operators",
  unit: "LAB_TU",
  new_grants: null,
  cash_payments: false,
  automatic_qualification_changes: false,
  public_operation_approved: false,
  result: "INCOMPLETE",
  models: [],
  samples: [],
  cleanup: { key_revoked: null, logout: null },
};
let cookie = "",
  key,
  activeSession = null,
  failed = false;
const safeCode = (error) =>
  /^[a-zA-Z0-9_-]{1,80}$/.test(error?.code ?? "")
    ? error.code
    : "QUALIFICATION_FAILURE";
async function api(path, method = "GET", body) {
  const response = await fetch(
    `http://127.0.0.1:${c.control_port}/api/v1${path}`,
    {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Cookie: cookie,
        Origin: c.web_origin,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  const value = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(`Control request failed: ${response.status}`),
      { code: value.error?.code },
    );
  if (path === "/auth/login")
    cookie = response.headers.get("set-cookie").split(";")[0];
  return value;
}
async function terminal(id) {
  const deadline = Date.now() + 45000;
  do {
    const session = await api(`/sessions/${id}`);
    if (
      ["SETTLED", "REFUNDED"].includes(session.billing_state) &&
      ["COMPLETED", "FAILED", "CANCELLED", "INTERRUPTED"].includes(
        session.state,
      )
    )
      return session;
    await delay(250);
  } while (Date.now() < deadline);
  throw Object.assign(
    new Error("Session has not reached terminal accounting"),
    { code: "TERMINAL_ACCOUNTING_TIMEOUT" },
  );
}
async function persist() {
  await writeFile(
    join(directory, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600, flush: true },
  );
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
  assert.deepEqual(
    pending,
    { sessions: 0, windows: 0 },
    "Run only when the private lab is idle",
  );
  const grants = Number(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM journal WHERE kind='LAB_GRANT'",
      )
    ).rows[0].n,
  );
  const models = (await api("/models")).data,
    routes = (await api("/routes")).data;
  const selected = values.model.map((id) => {
    const model = models.find((m) => m.id === id),
      matching = routes.filter((r) => r.model_id === id && r.available);
    assert.ok(model?.manifest, `Model ${id} must already be registered`);
    assert.equal(
      matching.length,
      1,
      `Model ${id} must have exactly one available route`,
    );
    const route = matching[0];
    assert.ok(
      route.participants.length >= 2 &&
        route.participants.every((p) => p.provider_id === login.user.id),
      "This private campaign uses only the existing operator's complete routes",
    );
    for (const item of cases)
      assert.ok(
        checkEnvelope(item, model.manifest),
        `Case ${item.id} exceeds the existing envelope for ${id}`,
      );
    report.models.push({
      model_id: id,
      artifact_sha256: model.manifest.artifact_sha256,
      revision: model.manifest.revision,
      license_id: model.manifest.license_id,
      manifest_sha256: route.manifest_sha256,
      route_sha256: route.route_sha256,
      max_context_tokens: model.manifest.max_context_tokens,
      max_input_bytes: model.manifest.max_input_bytes,
      max_output_tokens: model.manifest.max_output_tokens,
      execution_profile: model.manifest.execution_profile ?? null,
      participant_count: route.participants.length,
      declared_resource_domain_count: new Set(
        route.participants.map((p) => p.resource_domain_id),
      ).size,
    });
    return { id, route, manifest: model.manifest };
  });
  const plan = {
    schema_version: 1,
    created_before_inference: new Date().toISOString(),
    suite_sha256: report.suite_sha256,
    source_sha256: Object.fromEntries(
      await Promise.all(
        [
          "scripts/model-qualification.mjs",
          "scripts/model-qualification-core.mjs",
        ].map(async (path) => [path, sha256(await readFile(join(root, path)))]),
      ),
    ),
    cases,
    models: report.models,
    temperature: 0,
    stream: true,
    execution_retries: 0,
    order:
      "For each case, alternate the starting model index; run one request at a time",
    acceptance:
      "Exact normalized text or deep JSON equality, stop finish reason, matching usage, all participant receipts, settled charge and zero retained domain claims",
    timing:
      "Client wall time includes gateway, queue, model and final receipts; no pure decode throughput or SLA claim",
  };
  const planBytes = JSON.stringify(plan, null, 2) + "\n";
  report.plan_sha256 = sha256(planBytes);
  await writeFile(join(directory, "plan.json"), planBytes, {
    flag: "wx",
    mode: 0o600,
    flush: true,
  });
  await persist();
  console.log(
    `Plan ${report.plan_sha256}: ${selected.length} models, ${cases.length} cases, ${cases.length * selected.length} scheduled requests`,
  );
  if (!values["dry-run"]) {
    key = await api("/keys", "POST", {
      label: "Temporary functional model qualification",
    });
    for (const [caseIndex, item] of cases.entries()) {
      for (let offset = 0; offset < selected.length; offset++) {
        const model = selected[(caseIndex + offset) % selected.length],
          started = performance.now();
        const sample = {
          case_id: item.id,
          model_id: model.id,
          input_bytes: item.input_bytes,
          requested_max_tokens: item.max_tokens,
          state: "INCOMPLETE",
          semantic_pass: false,
          accepted: false,
        };
        report.samples.push(sample);
        let observation;
        try {
          const response = await fetch(
            `http://127.0.0.1:${c.gateway_port}/v1/chat/completions`,
            {
              method: "POST",
              redirect: "error",
              signal: AbortSignal.timeout(210000),
              headers: {
                Authorization: `Bearer ${key.token}`,
                "Content-Type": "application/json",
                "Idempotency-Key": randomUUID(),
              },
              body: JSON.stringify({
                model: model.id,
                messages: item.messages,
                max_tokens: item.max_tokens,
                temperature: 0,
                stream: true,
                stream_options: { include_usage: true },
              }),
            },
          );
          sample.http_status = response.status;
          activeSession = response.headers.get("x-network-ai-session-id");
          if (activeSession) assert.match(activeSession, /^[a-f0-9-]{36}$/);
          if (!response.ok) {
            const error = await response.json();
            throw Object.assign(new Error("Inference was rejected"), {
              code: error.error?.code,
            });
          }
          assert.ok(
            activeSession,
            "Gateway did not supply the admitted session identity",
          );
          sample.session_id = activeSession;
          observation = await observeCompletion(response.body, started);
          sample.semantic_pass = assessAnswer(item, observation.content);
          sample.finish_reason = observation.finish_reason;
          sample.usage = observation.usage;
          sample.first_content_ms = observation.first_content_ms;
          sample.completed_ms = observation.completed_ms;
          sample.response_sha256 = sha256(observation.content);
          sample.response_characters = observation.content.length;
          sample.reasoning_characters = observation.reasoning.length;
          // Raw responses are private even though this corpus contains only
          // synthetic prompts. Public evidence is separately allowlisted.
          await writeFile(
            join(directory, `${item.id}-${model.id}.response.json`),
            JSON.stringify(observation, null, 2) + "\n",
            { flag: "wx", mode: 0o600, flush: true },
          );
        } catch (error) {
          sample.error_code = safeCode(error);
          if (activeSession)
            await api(`/sessions/${activeSession}/cancel`, "POST", {}).catch(
              () => {},
            );
        }
        if (activeSession) {
          const session = await terminal(activeSession);
          assert.equal(session.model_id, model.id);
          assert.equal(session.route_id, model.route.id);
          sample.state = session.state;
          sample.billing_state = session.billing_state;
          sample.charged_microtu = session.charged_microtu;
          const rootReceipt = (
            await db.query(
              "SELECT node_id,payload FROM receipts WHERE session_id=$1",
              [activeSession],
            )
          ).rows[0];
          sample.participant_receipts = completedRouteReceipts(
            session,
            rootReceipt,
          );
          const retained = (
            await db.query(
              "SELECT count(*)::int AS n FROM active_session_domains WHERE session_id=$1",
              [activeSession],
            )
          ).rows[0].n;
          sample.retained_domain_claims = retained;
          assert.equal(retained, 0);
          const paid = session.participants.reduce(
              (sum, p) => sum + BigInt(p.paid_microtu),
              0n,
            ),
            charge = BigInt(session.charged_microtu);
          sample.provider_paid_microtu = String(paid);
          if (session.billing_state === "SETTLED") {
            assert.equal(paid, charge - (charge * 2000n) / 10000n);
            assert.equal(
              observation?.usage.prompt_tokens,
              session.prompt_tokens,
            );
            assert.equal(
              observation?.usage.completion_tokens,
              session.completion_tokens,
            );
            assert.ok(session.completion_tokens <= item.max_tokens);
            assert.ok(
              session.prompt_tokens + session.completion_tokens <=
                model.manifest.max_context_tokens,
            );
          } else assert.equal(charge, 0n);
          sample.accepted =
            !sample.error_code &&
            sample.semantic_pass &&
            observation?.finish_reason === "stop" &&
            session.state === "COMPLETED" &&
            session.billing_state === "SETTLED" &&
            sample.participant_receipts === model.route.participants.length;
          activeSession = null;
        }
        console.log(
          `${sample.accepted ? "PASS" : "FAIL"} ${item.id} / ${model.id}: ${sample.state}, ${sample.completed_ms ?? "unknown"} ms`,
        );
        await persist();
      }
    }
  }
  report.new_grants =
    Number(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM journal WHERE kind='LAB_GRANT'",
        )
      ).rows[0].n,
    ) - grants;
  assert.equal(report.new_grants, 0);
  assert.equal(
    (await db.query("SELECT sum(balance)::text AS total FROM ledger_accounts"))
      .rows[0].total,
    "0",
  );
  report.ledger_projection_mismatches = (
    await db.query(
      "SELECT a.id FROM ledger_accounts a LEFT JOIN journal_lines l ON l.account_id=a.id GROUP BY a.id HAVING a.balance<>coalesce(sum(l.amount),0)",
    )
  ).rowCount;
  assert.equal(report.ledger_projection_mismatches, 0);
  report.completed_at = new Date().toISOString();
  report.result = values["dry-run"]
    ? "PREFLIGHT_PASS"
    : report.samples.length === cases.length * selected.length &&
        report.samples.every((s) => s.accepted)
      ? "PASS"
      : "FAIL";
} catch (error) {
  report.result = "FAIL";
  report.error_code = safeCode(error);
  // Error messages can include assertion values; keep full diagnostics private.
  await writeFile(join(directory, "error.txt"), String(error.stack ?? error), {
    mode: 0o600,
    flush: true,
  });
  failed = true;
} finally {
  if (activeSession) {
    try {
      await api(`/sessions/${activeSession}/cancel`, "POST", {});
      await terminal(activeSession);
      report.cleanup.session_terminal = true;
    } catch {
      report.cleanup.session_terminal = false;
      failed = true;
    }
  }
  if (key) {
    try {
      assert.equal((await api(`/keys/${key.id}`, "DELETE")).revoked, true);
      assert.ok(
        (
          await db.query("SELECT revoked_at FROM api_keys WHERE id=$1", [
            key.id,
          ])
        ).rows[0]?.revoked_at,
      );
      report.cleanup.key_revoked = true;
    } catch {
      report.cleanup.key_revoked = false;
      failed = true;
    }
  }
  if (cookie) {
    try {
      await api("/auth/logout", "POST", {});
      report.cleanup.logout = true;
    } catch {
      report.cleanup.logout = false;
      failed = true;
    }
  }
  await db.end();
  if (failed) report.result = "FAIL";
  await persist();
  console.log(
    `Private qualification report: ${join(directory, "report.json")}`,
  );
}
if (failed || report.result === "FAIL") process.exitCode = 1;
