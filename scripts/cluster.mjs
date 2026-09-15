// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Trusted root with explicitly weighted RPC workers. RPC sockets stay on loopback.
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { connect } from "node:net";
import { protectDirectory } from "./lab.mjs";
import { acquire } from "./artifacts.mjs";
import { clusterOptions } from "./cluster-options.mjs";
import { workerEnvironment } from "../packages/contributor/src/profile.mjs";

const { values: a } = parseArgs({
  options: Object.fromEntries(
    [
      "engine-dir",
      "model-dir",
      "manifest",
      "directory",
      "workers",
      "worker-supervision",
      "port",
      "rpc-port",
      "rpc-forward-port",
      "rpc-transport",
      "threads",
      "context",
      "batch",
      "tensor-split",
    ].map((k) => [k, { type: "string" }]),
  ),
});
if (!a["engine-dir"] || !a["model-dir"] || !a.manifest || !a.directory)
  throw new Error(
    "Use --engine-dir PATH --model-dir PATH --manifest FILE --directory PATH [--workers 0..15 --tensor-split 1,1 --context 2048 --port 43220 --rpc-port 43820 --threads 8]",
  );
const {
  workers,
  port,
  rpc,
  threads,
  context,
  batch,
  split,
  externalWorkers,
  rawPorts,
  forwardPorts,
} = clusterOptions(a);
const manifest = JSON.parse(await readFile(resolve(a.manifest), "utf8"));
if (manifest.files.length !== 1 || !manifest.files[0].path.endsWith(".gguf"))
  throw new Error("This adapter requires one complete GGUF");
await acquire(manifest, resolve(a["model-dir"]), true);
const directory = resolve(a.directory);
await mkdir(directory, { recursive: true, mode: 0o700 });
await protectDirectory(directory);
const keyPath = join(directory, "engine-api-key.txt");
let apiKey;
try {
  apiKey = (await readFile(keyPath, "utf8")).trim();
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  apiKey = randomBytes(32).toString("base64url");
  await writeFile(keyPath, apiKey + "\n", { flag: "wx", mode: 0o600 });
}
if (!/^[A-Za-z0-9_-]{43}$/.test(apiKey))
  throw new Error("Invalid private engine key file");
const engine = resolve(a["engine-dir"]),
  suffix = process.platform === "win32" ? ".exe" : "";
const children = [],
  logs = [];
let stopping = false;
const stopTimer = setInterval(() => {
  void stat(join(directory, "stop.request"))
    .then(() => stop())
    .catch((e) => {
      if (e.code !== "ENOENT") stop(1);
    });
}, 400);
stopTimer.unref();
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearInterval(stopTimer);
  for (const p of children) if (p.exitCode === null && !p.killed) p.kill();
  for (const stream of logs) stream.end();
  process.exitCode = code;
}
function launch(name, file, args) {
  const log = createWriteStream(join(directory, `${name}.log`), {
    flags: "a",
    mode: 0o600,
  });
  logs.push(log);
  const p = spawn(join(engine, file + suffix), args, {
    cwd: directory,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: workerEnvironment(),
  });
  children.push(p);
  p.stdout.pipe(log, { end: false });
  p.stderr.pipe(log, { end: false });
  p.once("error", () => {
    console.error(`${name} could not start`);
    stop(1);
  });
  p.once("exit", () => {
    if (!stopping) {
      console.error(`${name} stopped; draining the whole local cluster`);
      stop(1);
    }
  });
  return p;
}
async function listening(p) {
  return new Promise((res) => {
    const s = connect({ host: "127.0.0.1", port: p });
    s.setTimeout(300);
    s.once("connect", () => {
      s.destroy();
      res(true);
    });
    s.once("error", () => res(false));
    s.once("timeout", () => {
      s.destroy();
      res(false);
    });
  });
}
async function waitFor(probe, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until && !stopping) {
    if (await probe()) return;
    await delay(250);
  }
  throw new Error("Cluster did not become ready; inspect private logs");
}
try {
  for (let i = 0; i < (externalWorkers ? 0 : workers); i++)
    launch(`worker-${i}`, "ggml-rpc-server", [
      "--host",
      "127.0.0.1",
      "--port",
      String(rpc + i),
      "--device",
      "CPU",
      "--threads",
      String(threads),
    ]);
  for (const workerPort of externalWorkers ? forwardPorts : rawPorts)
    await waitFor(() => listening(workerPort), 15000);
  const args = [
    "--model",
    join(resolve(a["model-dir"]), manifest.files[0].path),
    "--alias",
    "network-ai-qualified-model",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--ctx-size",
    String(context),
    "--parallel",
    "1",
    "--threads",
    String(threads),
    "--threads-batch",
    String(threads),
    "--batch-size",
    String(batch),
    "--ubatch-size",
    String(batch),
    "--fit",
    "off",
    "--no-webui",
    "--no-slots",
    "--no-repack",
    "--reasoning-budget",
    "0",
    "--verbosity",
    "4",
    "--no-agent",
    "--cors-origins",
    "http://127.0.0.1",
    "--api-key-file",
    keyPath,
  ];
  args.push(
    ...(workers
      ? [
          "--rpc",
          forwardPorts.map((p) => `127.0.0.1:${p}`).join(","),
          "--split-mode",
          "layer",
          "--tensor-split",
          split.join(","),
          "--gpu-layers",
          "99",
        ]
      : ["--device", "none", "--gpu-layers", "0"]),
  );
  // Guarded stages require a session capability for every compute command.
  // Loading weights is separate from paid execution; suppress engine warmup.
  if (a["rpc-forward-port"]) args.push("--no-warmup");
  launch("engine", "llama-server", args);
  const readyAt = Date.now();
  await waitFor(async () => {
    try {
      return (
        await fetch(`http://127.0.0.1:${port}/health`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(1000),
        })
      ).ok;
    } catch {
      return false;
    }
  }, 600000);
  const binaryHash = createHash("sha256");
  for await (const chunk of createReadStream(
    join(engine, "llama-server" + suffix),
  ))
    binaryHash.update(chunk);
  await writeFile(
    join(directory, "status.json"),
    JSON.stringify(
      {
        schema_version: 1,
        physical_hosts: externalWorkers ? null : 1,
        physical_host_evidence: externalWorkers
          ? "not inferred from loopback tunnel endpoints"
          : "workers launched by this root on this host",
        workers,
        worker_supervision: externalWorkers ? "contributor" : "root_cluster",
        transport: workers
          ? (a["rpc-transport"] ?? "loopback-ggml-rpc")
          : "local-cpu",
        transport_evidence:
          "operator_configuration; verify independent link counters and session receipts",
        host: "127.0.0.1",
        port,
        model: manifest.model_id,
        revision: manifest.revision,
        artifact_sha256: manifest.files[0].sha256,
        engine_sha256: binaryHash.digest("hex"),
        context,
        batch,
        tensor_split: split,
        worker_devices: externalWorkers
          ? "explicit contributor profiles; inspect their hardware observations"
          : "CPU",
        slots: 1,
        threads_per_worker: threads,
        cpu_repack: false,
        rpc_guarded: Boolean(a["rpc-forward-port"]),
        ready_ms: Date.now() - readyAt,
        pids: children.map((p) => p.pid),
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  console.log(
    `Trusted local model root ready on 127.0.0.1:${port}; ${workers} RPC workers; inspect contributor placement for physical host count.`,
  );
} catch (error) {
  stop(1);
  throw error;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
// Piped supervisors use this on Windows, where process.kill may bypass JS signal handlers.
process.stdin.on("data", (chunk) => {
  if (chunk.length <= 16 && chunk.toString().trim() === "stop") stop();
});
