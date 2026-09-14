// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Compare identical pinned weights locally and across two trusted CPU RPC workers.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { root, runtime, protectDirectory } from "./lab.mjs";

const { values: a } = parseArgs({
  options: {
    network: { type: "boolean" },
    ...Object.fromEntries(
      ["engine-dir", "model-dir", "manifest"].map((k) => [
        k,
        { type: "string" },
      ]),
    ),
  },
});
if (!a["engine-dir"] || !a["model-dir"] || !a.manifest)
  throw new Error("Use --engine-dir PATH --model-dir PATH --manifest FILE");
const directory = join(runtime, "cluster-campaigns", randomUUID());
await mkdir(directory, { recursive: true, mode: 0o700 });
await protectDirectory(directory);
const prompts = [
  "The capital of France is",
  "2 + 2 =",
  "A reliable distributed system should",
];
const samples = [];
let child;
async function stop() {
  if (!child || child.exitCode !== null) return;
  const p = child;
  p.stdin.end("stop\n");
  await new Promise((res, rej) => {
    const timer = setTimeout(
      () => rej(new Error("Supervisor did not shut down")),
      15000,
    );
    p.once("exit", () => {
      clearTimeout(timer);
      res();
    });
  });
}
async function ready(path) {
  const end = Date.now() + 660000;
  while (Date.now() < end) {
    if (child.exitCode !== null)
      throw new Error(
        "Cluster supervisor failed; inspect private campaign logs",
      );
    try {
      return JSON.parse(await readFile(path, "utf8"));
    } catch {}
    await delay(500);
  }
  throw new Error("Cluster start timed out");
}
try {
  for (const workers of [0, 2]) {
    const phase = join(directory, `workers-${workers}`);
    child = spawn(
      process.execPath,
      [
        join(root, "scripts/cluster.mjs"),
        "--engine-dir",
        resolve(a["engine-dir"]),
        "--model-dir",
        resolve(a["model-dir"]),
        "--manifest",
        resolve(a.manifest),
        "--directory",
        phase,
        "--workers",
        String(workers),
        "--port",
        "43220",
        "--rpc-port",
        "43820",
        "--threads",
        "8",
      ],
      { cwd: root, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    child.stdout.on("data", () => {});
    child.stderr.on("data", () => {});
    const status = await ready(join(phase, "status.json"));
    const apiKey = (
      await readFile(join(phase, "engine-api-key.txt"), "utf8")
    ).trim();
    const results = [];
    for (const [index, prompt] of prompts.entries()) {
      const start = performance.now();
      const r = await fetch("http://127.0.0.1:43220/completion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          prompt,
          n_predict: 8,
          temperature: 0,
          seed: 71,
          return_tokens: true,
          cache_prompt: false,
        }),
        signal: AbortSignal.timeout(180000),
      });
      assert.equal(r.status, 200);
      const response = await r.json();
      assert.ok(
        Array.isArray(response.tokens) && response.tokens.length > 0,
        "Engine must expose generated token IDs for comparison",
      );
      results.push({
        prompt_index: index,
        generated_tokens: response.tokens,
        text_sha256: createHash("sha256")
          .update(response.content)
          .digest("hex"),
        elapsed_ms: Math.round(performance.now() - start),
        timings: response.timings,
      });
      console.log(
        `CPU workers=${workers}, prompt=${index + 1}/${prompts.length}, tokens=${response.tokens.length}`,
      );
    }
    const log = await readFile(join(phase, "engine.log"), "utf8");
    const buffers = log
      .split(/\r?\n/)
      .filter((line) =>
        /model buffer size|KV buffer size|offloaded|using device|model size/.test(
          line,
        ),
      );
    if (workers)
      assert.ok(
        buffers.some((line) => line.includes("43820")) &&
          buffers.some((line) => line.includes("43821")),
        "Both RPC workers must receive model buffers",
      );
    samples.push({
      workers,
      status: { ...status, pids: undefined },
      results,
      buffers,
    });
    await writeFile(
      join(phase, "samples.json"),
      JSON.stringify({ results, buffers }, null, 2) + "\n",
      { mode: 0o600 },
    );
    if (workers && a.network) {
      const network = spawn(
        process.execPath,
        [
          join(root, "scripts/link-acceptance.mjs"),
          "--cluster-manifest",
          resolve(a.manifest),
          "--backend-key-file",
          join(phase, "engine-api-key.txt"),
        ],
        { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
      );
      let output = "";
      network.stdout.on("data", (chunk) => {
        output += chunk.toString();
      });
      network.stderr.on("data", () => {});
      await new Promise((res, rej) => {
        network.once("error", rej);
        network.once("exit", (code) =>
          code === 0
            ? res()
            : rej(new Error("Network API cluster acceptance failed")),
        );
      });
      const networkReport = JSON.parse(output);
      await writeFile(
        join(directory, "network-api.json"),
        JSON.stringify(networkReport, null, 2) + "\n",
        { mode: 0o600 },
      );
      console.log(
        "The 32B CPU cluster completed and settled through the Network AI API and QUIC link.",
      );
    }
    await stop();
  }
  const matches = samples[0].results.map(
    (r, i) =>
      JSON.stringify(r.generated_tokens) ===
      JSON.stringify(samples[1].results[i].generated_tokens),
  );
  const report = {
    schema_version: 1,
    measured_at: new Date().toISOString(),
    physical_hosts: 1,
    compute: "CPU",
    samples_per_configuration: prompts.length,
    generated_tokens_per_prompt: 8,
    configurations: samples,
    token_parity: matches,
    equal_token_sequences: matches.filter(Boolean).length,
    all_equal: matches.every(Boolean),
    numerical_logits_compared: false,
    independent_participants: false,
    wan_qualified: false,
    production_qualified: false,
  };
  await writeFile(
    join(directory, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      report: join(directory, "report.json"),
      all_equal: report.all_equal,
      equal_token_sequences: report.equal_token_sequences,
      physical_hosts: 1,
    }),
  );
} finally {
  await stop();
}
