// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Reassess preserved responses/settlements after an evaluator correction.
// Does not generate a response, change a threshold or replace the original run.
import assert from "node:assert/strict";
import { readFile, writeFile, realpath } from "node:fs/promises";
import { resolve, join, relative, isAbsolute } from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { config, runtime, root } from "./lab.mjs";
import {
  sha256,
  assessAnswer,
  completedRouteReceipts,
} from "./model-qualification-core.mjs";
const { values } = parseArgs({ options: { directory: { type: "string" } } });
assert.ok(values.directory, "Use --directory PRIVATE_CAMPAIGN_DIRECTORY");
const base = await realpath(join(runtime, "model-qualification")),
  directory = await realpath(resolve(values.directory)),
  path = relative(base, directory);
assert.ok(
  path && !isAbsolute(path) && !path.startsWith(".."),
  "Review must stay inside the private qualification directory",
);
const originalBytes = await readFile(join(directory, "report.json")),
  original = JSON.parse(originalBytes),
  planBytes = await readFile(join(directory, "plan.json")),
  plan = JSON.parse(planBytes);
assert.equal(original.schema_version, 1);
assert.equal(original.plan_sha256, sha256(planBytes));
assert.ok(
  ["PASS", "FAIL"].includes(original.result) && original.completed_at,
  "The campaign must finish before review",
);
assert.equal(
  original.samples.length,
  plan.cases.length * plan.models.length,
  "An incomplete campaign retains its missing cases",
);
const c = await config(),
  { Pool } = createRequire(
    new URL("../apps/control-api/package.json", import.meta.url),
  )("pg"),
  db = new Pool({
    connectionString: c.database_url,
    options: "-c search_path=nai,public",
  });
const review = {
  schema_version: 1,
  evidence_type: "PRESERVED_CAMPAIGN_RECEIPT_REASSESSMENT",
  reviewed_at: new Date().toISOString(),
  original_report_sha256: sha256(originalBytes),
  original_result: original.result,
  plan_sha256: original.plan_sha256,
  suite_sha256: original.suite_sha256,
  original_records_replaced: false,
  new_inference_requests: 0,
  changed_cases_or_thresholds: false,
  correction:
    "Count the root inference receipt from receipts and STAGE command receipts from stage_receipts",
  source_sha256: Object.fromEntries(
    await Promise.all(
      [
        "scripts/model-qualification-review.mjs",
        "scripts/model-qualification-core.mjs",
      ].map(async (p) => [p, sha256(await readFile(join(root, p)))]),
    ),
  ),
  models: original.models,
  samples: [],
  result: "INCOMPLETE",
  unit: "LAB_TU",
  cash_payments: false,
  public_operation_approved: false,
  original_cleanup: original.cleanup,
  new_grants: original.new_grants,
  ledger_projection_mismatches: original.ledger_projection_mismatches,
};
const seen = new Set();
try {
  for (const sample of original.samples) {
    const item = plan.cases.find((v) => v.id === sample.case_id),
      model = plan.models.find((v) => v.model_id === sample.model_id);
    assert.ok(
      item &&
        model &&
        /^[a-z0-9-]+$/.test(item.id) &&
        /^[a-z0-9._-]+$/.test(model.model_id),
    );
    assert.ok(!seen.has(item.id + "/" + model.model_id));
    seen.add(item.id + "/" + model.model_id);
    assert.match(sample.session_id, /^[a-f0-9-]{36}$/);
    const observed = JSON.parse(
      await readFile(
        join(directory, `${item.id}-${model.model_id}.response.json`),
        "utf8",
      ),
    );
    assert.equal(sha256(observed.content), sample.response_sha256);
    assert.deepEqual(observed.usage, sample.usage);
    assert.equal(observed.finish_reason, sample.finish_reason);
    assert.equal(
      assessAnswer(item, observed.content),
      sample.semantic_pass,
      "The semantic score must not change during receipt review",
    );
    const session = (
      await db.query("SELECT * FROM sessions WHERE id=$1", [sample.session_id])
    ).rows[0];
    assert.equal(session.model_id, sample.model_id);
    const route = (
      await db.query("SELECT route_sha256 FROM execution_routes WHERE id=$1", [
        session.route_id,
      ])
    ).rows[0];
    assert.equal(route.route_sha256, model.route_sha256);
    const body = {
      model: model.model_id,
      messages: item.messages,
      max_tokens: item.max_tokens,
      temperature: 0,
      stream: true,
      stream_options: { include_usage: true },
    };
    assert.equal(
      session.request_sha256,
      sha256(JSON.stringify(body)),
      "Preserved plan does not match the admitted request",
    );
    assert.equal(session.state, sample.state);
    assert.equal(session.billing_state, sample.billing_state);
    assert.equal(String(session.charged_microtu), sample.charged_microtu);
    assert.equal(session.prompt_tokens, observed.usage.prompt_tokens);
    assert.equal(session.completion_tokens, observed.usage.completion_tokens);
    assert.ok(
      session.completion_tokens <= item.max_tokens &&
        session.prompt_tokens + session.completion_tokens <=
          model.max_context_tokens,
    );
    session.participants = (
      await db.query(
        "SELECT p.node_id,p.role,p.paid_microtu,r.payload AS receipt FROM session_participants p LEFT JOIN stage_receipts r ON r.session_id=p.session_id AND r.node_id=p.node_id WHERE p.session_id=$1 ORDER BY p.ordinal",
        [sample.session_id],
      )
    ).rows;
    const receipt = (
        await db.query(
          "SELECT node_id,payload FROM receipts WHERE session_id=$1",
          [sample.session_id],
        )
      ).rows[0],
      receiptCount = completedRouteReceipts(session, receipt),
      claims = (
        await db.query(
          "SELECT count(*)::int AS n FROM active_session_domains WHERE session_id=$1",
          [sample.session_id],
        )
      ).rows[0].n,
      paid = session.participants.reduce(
        (sum, p) => sum + BigInt(p.paid_microtu),
        0n,
      ),
      charge = BigInt(session.charged_microtu);
    assert.equal(claims, 0);
    assert.equal(paid, charge - (charge * 2000n) / 10000n);
    const accepted =
      sample.semantic_pass &&
      !sample.error_code &&
      observed.finish_reason === "stop" &&
      session.state === "COMPLETED" &&
      session.billing_state === "SETTLED" &&
      receiptCount === model.participant_count;
    // Allowlist includes no session/account/node IDs, local paths, prompts,
    // responses or signing/configuration material.
    review.samples.push({
      case_id: sample.case_id,
      model_id: sample.model_id,
      input_bytes: sample.input_bytes,
      requested_max_tokens: sample.requested_max_tokens,
      semantic_pass: sample.semantic_pass,
      accepted,
      state: sample.state,
      billing_state: sample.billing_state,
      finish_reason: observed.finish_reason,
      prompt_tokens: observed.usage.prompt_tokens,
      completion_tokens: observed.usage.completion_tokens,
      cached_prompt_tokens_reported:
        observed.usage.prompt_tokens_details?.cached_tokens ?? null,
      first_content_ms: observed.first_content_ms,
      completed_ms: observed.completed_ms,
      response_sha256: sample.response_sha256,
      response_characters: sample.response_characters,
      original_extracted_receipts: sample.participant_receipts,
      verified_completed_receipts: receiptCount,
      retained_domain_claims: claims,
      charged_microtu: String(charge),
      provider_paid_microtu: String(paid),
    });
  }
  // Independently check the original campaign's exact temporary key. Older
  // runners did not persist its ID; their fixed label, owner and time window
  // must resolve to exactly one record, otherwise cleanup stays unverified.
  const keys = (
    await db.query(
      "SELECT revoked_at FROM api_keys WHERE user_id=(SELECT user_id FROM sessions WHERE id=$1) AND label='Temporary functional model qualification' AND created_at >= $2 AND created_at <= $3",
      [
        original.samples[0].session_id,
        original.started_at,
        original.completed_at,
      ],
    )
  ).rows;
  review.cleanup_observed = {
    observed_at: new Date().toISOString(),
    key_records_matched: keys.length,
    key_revoked_confirmed: keys.length === 1 && keys[0].revoked_at !== null,
    logout_reported_by_original_runner: original.cleanup.logout,
  };
  review.result =
    review.samples.every((s) => s.accepted) &&
    review.cleanup_observed.key_revoked_confirmed &&
    original.cleanup.logout === true
      ? "PASS"
      : "FAIL";
  review.accepted_samples = review.samples.filter((s) => s.accepted).length;
  review.scheduled_samples = plan.cases.length * plan.models.length;
  review.response_parity = plan.cases.map((item) => {
    const hashes = review.samples
      .filter((s) => s.case_id === item.id)
      .map((s) => s.response_sha256);
    return {
      case_id: item.id,
      byte_equal_responses: new Set(hashes).size === 1,
    };
  });
} finally {
  await db.end();
  const destination = join(directory, `review-${randomUUID()}.json`);
  await writeFile(destination, JSON.stringify(review, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
    flush: true,
  });
  console.log(`Private reassessment: ${destination}`);
}
console.log(
  `Reassessment: ${review.accepted_samples}/${review.scheduled_samples} accepted; ${review.result}; no new inference`,
);
if (review.result !== "PASS") process.exitCode = 1;
