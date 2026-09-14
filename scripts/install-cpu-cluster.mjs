// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Explicitly enable the already downloaded private 32B CPU experiment in lab:start.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import {
  config,
  root,
  runtime,
  startCpuCluster,
  start,
  protectDirectory,
} from "./lab.mjs";

const { values: a } = parseArgs({
  options: Object.fromEntries(
    ["engine-dir", "model-dir", "manifest"].map((k) => [k, { type: "string" }]),
  ),
});
if (!a["engine-dir"] || !a["model-dir"] || !a.manifest)
  throw new Error("Use --engine-dir PATH --model-dir PATH --manifest FILE");
const path = join(runtime, "cpu-cluster.json");
try {
  await readFile(path);
  throw new Error("A managed CPU cluster is already configured; use lab:start");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const profile = {
  schema_version: 1,
  engine_dir: resolve(a["engine-dir"]),
  model_dir: resolve(a["model-dir"]),
  manifest: resolve(a.manifest),
  node_config: join(runtime, "cpu-cluster", "operator", "config.json"),
};
await startCpuCluster(profile);
const c = await config(),
  artifact = JSON.parse(await readFile(profile.manifest, "utf8"));
const base = `http://127.0.0.1:${c.control_port}/api/v1`;
const login = await fetch(base + "/auth/login", {
  method: "POST",
  headers: { Origin: c.web_origin, "Content-Type": "application/json" },
  body: JSON.stringify({ login: c.admin_login, password: c.admin_password }),
});
assert.ok(login.ok);
const user = (await login.json()).user,
  cookie = login.headers.get("set-cookie").split(";")[0];
async function api(endpoint, body) {
  const r = await fetch(base + endpoint, {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: c.web_origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  assert.ok(r.ok, `Private configuration rejected: ${endpoint}`);
  return r.json();
}
const model = "qwen3-32b-cpu-private";
const catalog = await (
  await fetch(base + "/models", { headers: { Cookie: cookie } })
).json();
const existing = catalog.data.find((m) => m.id === model);
if (existing)
  assert.equal(existing.manifest.artifact_sha256, artifact.files[0].sha256);
else
  await api("/models", {
    schema_version: 1,
    model_id: model,
    display_name: "Qwen3-32B · CPU privado",
    backend_model: "network-ai-qualified-model",
    revision: artifact.revision,
    artifact_sha256: artifact.files[0].sha256,
    license_id: artifact.license_id,
    source_url: artifact.files[0].url,
    modality: "text",
    max_context_tokens: 2048,
    max_output_tokens: 128,
    max_input_bytes: 1400,
    input_rate_microtu: "1000",
    output_rate_microtu: "3000",
    rate_denominator: 1,
    description:
      "Official 32.8B Q4_K_M. Two CPU RPC workers on one physical host; 2048 context, one slot, private experiment.",
    trust_policy: "private_lab",
  });
await api(`/admin/models/${model}/qualify`, {
  state: "LOCAL_PREVIEW",
  note: "Explicit private CPU experiment with verified official weights; no WAN, independent-participant or production qualification.",
});
const domain = await api("/admin/domains", {
  name: "CPU e RAM locais · cluster 32B",
  owner_id: user.id,
  slots: 1,
});
const invite = await api("/admin/node-invites", {
  name: "Operador CPU · Qwen3-32B",
  owner_id: user.id,
  resource_domain_id: domain.id,
  model_id: model,
  base_url: "http://127.0.0.1:43123",
});
const directory = join(runtime, "cpu-cluster");
await mkdir(directory, { recursive: true, mode: 0o700 });
await protectDirectory(directory);
const invitation = join(directory, "invitation.json");
await writeFile(invitation, JSON.stringify(invite), {
  flag: "wx",
  mode: 0o600,
});
await new Promise((res, rej) => {
  const p = spawn(
    process.execPath,
    [
      join(root, "scripts/node-config.mjs"),
      "--invite-file",
      invitation,
      "--backend-model",
      "network-ai-qualified-model",
      "--backend-url",
      "http://127.0.0.1:43220",
      "--backend-kind",
      "openai",
      "--backend-key-file",
      join(directory, "engine", "engine-api-key.txt"),
      "--port",
      "43123",
      "--directory",
      join(directory, "operator"),
    ],
    { cwd: root, windowsHide: true, stdio: "ignore" },
  );
  p.once("error", rej);
  p.once("exit", (code) =>
    code === 0 ? res() : rej(new Error("Operator profile creation failed")),
  );
});
await writeFile(path, JSON.stringify(profile, null, 2) + "\n", {
  flag: "wx",
  mode: 0o600,
});
await start({ noBuild: true });
console.log(
  "The private Qwen3-32B CPU model is configured. lab:start and lab:stop now manage its supervisor and node.",
);
