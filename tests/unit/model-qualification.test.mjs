// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  compileSuite,
  checkEnvelope,
  assessAnswer,
  observeCompletion,
  completedRouteReceipts,
} from "../../scripts/model-qualification-core.mjs";
const suite = compileSuite(
  JSON.parse(
    await readFile(
      new URL(
        "../../adapters/qualification/text-functional-v1.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
);
test("complete-route assessment joins the root inference receipt and the two stage receipts", () => {
  const stage = {
    role: "STAGE",
    receipt: {
      state: "COMPLETED",
      completed_commands: 3,
      request_bytes: "12",
      response_bytes: "24",
    },
  };
  const session = {
    id: "session",
    prompt_tokens: 11,
    completion_tokens: 7,
    participants: [
      { node_id: "root", role: "ROOT", receipt: null },
      stage,
      structuredClone(stage),
    ],
  };
  const receipt = {
    node_id: "root",
    payload: {
      state: "COMPLETED",
      session_id: "session",
      prompt_tokens: 11,
      completion_tokens: 7,
    },
  };
  assert.equal(completedRouteReceipts(session, receipt), 3);
  assert.equal(completedRouteReceipts(session, undefined), 2);
  assert.equal(
    completedRouteReceipts(session, { ...receipt, node_id: "another-root" }),
    2,
  );
  assert.equal(
    completedRouteReceipts(session, {
      ...receipt,
      payload: { ...receipt.payload, completion_tokens: 8 },
    }),
    2,
  );
});
test("functional corpus stays inside the existing byte envelope and compares structured answers strictly", () => {
  const manifest = {
    max_output_tokens: 128,
    max_input_bytes: 1400,
    max_context_tokens: 2048,
  };
  assert.equal(suite.length, 8);
  assert.ok(suite.every((c) => checkEnvelope(c, manifest)));
  assert.equal(
    checkEnvelope(suite[0], { ...manifest, max_input_bytes: 1 }),
    false,
  );
  assert.equal(
    checkEnvelope(suite[4], { ...manifest, max_output_tokens: 64 }),
    false,
  );
  const item = suite[1];
  assert.equal(assessAnswer(item, '{"total":29,"cups":2,"mugs":3}'), true);
  assert.equal(
    assessAnswer(item, '{"total":29,"cups":2,"mugs":3,"extra":0}'),
    false,
  );
  assert.equal(
    assessAnswer(item, '```json\n{"total":29,"cups":2,"mugs":3}\n```'),
    false,
  );
  assert.equal(assessAnswer(suite[0], "300\r\n"), true);
  assert.equal(assessAnswer(suite[0], "The answer is 300"), false);
});
const wire =
  'data: {"choices":[{"delta":{"content":"ação 雪"}}]}\r\n\r\n' +
  'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":3}}\n\n' +
  'event: network_ai_receipt\ndata: {"state":"COMPLETED"}\n\n' +
  "data: [DONE]\n\n";
async function* chunks(text, width = 1) {
  const bytes = Buffer.from(text);
  for (let i = 0; i < bytes.length; i += width)
    yield bytes.subarray(i, i + width);
}
test("stream observation preserves split Unicode, ignores receipt metadata and requires complete usage", async () => {
  const observed = await observeCompletion(chunks(wire), 10, () => 17);
  assert.equal(observed.content, "ação 雪");
  assert.equal(observed.first_content_ms, 7);
  assert.equal(observed.completed_ms, 7);
  assert.equal(observed.finish_reason, "stop");
  assert.equal(observed.usage.completion_tokens, 3);
});
test("truncated or failed inference cannot pass because it emitted a plausible answer", async () => {
  await assert.rejects(
    observeCompletion(chunks(wire.replace("data: [DONE]\n\n", "")), 0),
    /without DONE/,
  );
  await assert.rejects(
    observeCompletion(chunks(wire.slice(0, -1)), 0),
    /Incomplete SSE/,
  );
  await assert.rejects(
    observeCompletion(
      chunks('data: {"error":{"code":"inference_interrupted"}}\n\n'),
      0,
    ),
    /inference_interrupted/,
  );
  await assert.rejects(
    observeCompletion(chunks(wire + "data: {}\n\n"), 0),
    /after completion/,
  );
});
test("a malformed corpus fails before any model work", () => {
  assert.throws(() =>
    compileSuite({
      schema_version: 1,
      id: "bad",
      cases: [{ id: "x", max_tokens: 16, retrieval: { rows: 3, target: 3 } }],
    }),
  );
  assert.throws(() =>
    compileSuite({ schema_version: 1, id: "bad", cases: [suite[0], suite[0]] }),
  );
});
