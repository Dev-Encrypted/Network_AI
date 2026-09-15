// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
export function compileSuite(suite) {
  assert.equal(suite.schema_version, 1);
  assert.match(suite.id, /^[a-z][a-z0-9-]{0,63}$/);
  assert.ok(
    Array.isArray(suite.cases) &&
      suite.cases.length > 0 &&
      suite.cases.length <= 64,
  );
  const ids = new Set();
  return suite.cases.map((source) => {
    assert.match(source.id, /^[a-z][a-z0-9-]{0,63}$/);
    assert.ok(!ids.has(source.id), "Duplicate qualification case");
    ids.add(source.id);
    assert.ok(
      Number.isInteger(source.max_tokens) &&
        source.max_tokens > 0 &&
        source.max_tokens <= 8192,
    );
    let messages = source.messages,
      expected = source.expected;
    if (source.retrieval) {
      assert.equal(messages, undefined);
      assert.equal(expected, undefined);
      const { rows, target } = source.retrieval;
      assert.ok(Number.isInteger(rows) && rows >= 2 && rows <= 256);
      assert.ok(Number.isInteger(target) && target >= 0 && target < rows);
      const label = (i) =>
        `code-${String((i * 17 + 31) % 997).padStart(3, "0")}`;
      const record = (i) =>
        `Record R${String(i).padStart(3, "0")} | label: ${label(i)}`;
      messages = [
        {
          role: "user",
          content: `Read these synthetic records. Return only the label for R${String(target).padStart(3, "0")}.\n${Array.from({ length: rows }, (_, i) => record(i)).join("\n")}`,
        },
      ];
      expected = { kind: "text", value: label(target) };
    }
    assert.ok(
      Array.isArray(messages) && messages.length >= 1 && messages.length <= 64,
    );
    for (const message of messages) {
      assert.ok(["system", "user", "assistant"].includes(message.role));
      assert.equal(typeof message.content, "string");
      assert.ok(Buffer.byteLength(message.content) <= 65536);
    }
    assert.ok(["text", "json"].includes(expected?.kind));
    if (expected.kind === "text") assert.equal(typeof expected.value, "string");
    else assert.notEqual(expected.value, undefined);
    return {
      id: source.id,
      max_tokens: source.max_tokens,
      messages,
      expected,
      input_bytes: messages.reduce(
        (sum, message) => sum + Buffer.byteLength(message.content),
        0,
      ),
    };
  });
}
export function checkEnvelope(item, manifest) {
  return (
    item.max_tokens <= manifest.max_output_tokens &&
    item.input_bytes <= manifest.max_input_bytes &&
    item.input_bytes + item.messages.length * 64 + item.max_tokens <=
      manifest.max_context_tokens
  );
}
export function assessAnswer(item, answer) {
  const text = answer.replace(/\r\n/g, "\n").trim();
  if (item.expected.kind === "text") return text === item.expected.value;
  try {
    return isDeepStrictEqual(JSON.parse(text), item.expected.value);
  } catch {
    return false;
  }
}
export function completedRouteReceipts(session, rootRecord) {
  const rootReceipt = rootRecord?.payload;
  const root = session.participants.filter((p) => p.role === "ROOT");
  assert.equal(
    root.length,
    1,
    "A complete route must have one root participant",
  );
  // The root inference receipt and the STAGE command receipts have different
  // protocols and storage. A missing root stage_receipt is expected.
  const rootComplete =
    rootReceipt?.state === "COMPLETED" &&
    rootRecord.node_id === root[0].node_id &&
    rootReceipt.session_id === session.id &&
    rootReceipt.prompt_tokens === session.prompt_tokens &&
    rootReceipt.completion_tokens === session.completion_tokens;
  return (
    Number(rootComplete) +
    session.participants.filter(
      (p) =>
        p.role === "STAGE" &&
        p.receipt?.state === "COMPLETED" &&
        p.receipt.completed_commands > 0 &&
        BigInt(p.receipt.request_bytes) > 0n &&
        BigInt(p.receipt.response_bytes) > 0n,
    ).length
  );
}
// Incremental UTF-8/SSE parsing, with separate byte and frame bounds. Do not
// treat a plausible answer, usage frame or transport EOF as the final marker.
export async function observeCompletion(
  body,
  startedAt,
  now = () => performance.now(),
) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const result = {
    content: "",
    reasoning: "",
    usage: null,
    finish_reason: null,
    first_content_ms: null,
    completed_ms: null,
    done: false,
  };
  let buffer = "",
    bytes = 0;
  function frame(raw) {
    const data = raw
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!data) return;
    assert.equal(result.done, false, "Unexpected data after completion marker");
    if (data === "[DONE]") {
      result.done = true;
      return;
    }
    const value = JSON.parse(data);
    assert.ok(
      !value.error,
      `Stream failed: ${String(value.error?.code ?? "unknown").slice(0, 80)}`,
    );
    const content = value.choices?.[0]?.delta?.content;
    if (typeof content === "string" && content.length) {
      result.first_content_ms ??= Math.round(now() - startedAt);
      result.content += content;
    }
    const reasoning = value.choices?.[0]?.delta?.reasoning_content;
    if (typeof reasoning === "string") result.reasoning += reasoning;
    if (value.usage) result.usage = value.usage;
    if (value.choices?.[0]?.finish_reason)
      result.finish_reason = value.choices[0].finish_reason;
  }
  for await (const chunk of body) {
    bytes += chunk.byteLength;
    assert.ok(
      bytes <= 4 * 1024 * 1024,
      "Qualification response exceeded 4 MiB",
    );
    buffer += decoder.decode(chunk, { stream: true });
    for (;;) {
      const separator = /\r?\n\r?\n/.exec(buffer);
      if (!separator) break;
      assert.ok(
        separator.index <= 1024 * 1024,
        "Qualification SSE frame exceeded 1 MiB",
      );
      frame(buffer.slice(0, separator.index));
      buffer = buffer.slice(separator.index + separator[0].length);
    }
    assert.ok(
      buffer.length <= 1024 * 1024,
      "Qualification SSE buffer exceeded 1 MiB",
    );
  }
  buffer += decoder.decode();
  assert.equal(buffer.trim(), "", "Incomplete SSE frame at EOF");
  assert.equal(result.done, true, "Stream ended without DONE");
  assert.ok(
    result.usage &&
      Number.isSafeInteger(result.usage.prompt_tokens) &&
      result.usage.prompt_tokens > 0,
  );
  assert.ok(
    Number.isSafeInteger(result.usage.completion_tokens) &&
      result.usage.completion_tokens > 0,
  );
  assert.ok(result.first_content_ms !== null, "No visible model output");
  result.completed_ms = Math.round(now() - startedAt);
  result.response_bytes = bytes;
  return result;
}
