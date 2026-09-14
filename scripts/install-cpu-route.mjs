// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Install a qualified, single-host 32B route without creating fictitious devices.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import {
  config,
  root,
  runtime,
  protectDirectory,
  backup,
  startCpuRoute,
  stopCpu,
} from "./lab.mjs";
import { acquire } from "./artifacts.mjs";
const { values: a } = parseArgs({
  options: Object.fromEntries(
    ["engine-dir", "model-dir", "manifest"].map((k) => [k, { type: "string" }]),
  ),
});
assert.ok(
  a["engine-dir"] && a["model-dir"] && a.manifest,
  "Use --engine-dir PATH --model-dir PATH --manifest FILE",
);
const profilePath = join(runtime, "cpu-route.json");
try {
  await readFile(profilePath);
  throw new Error(
    "A managed route is already configured. Use lab:start; its credentials and identities are preserved.",
  );
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const artifact = JSON.parse(await readFile(resolve(a.manifest), "utf8"));
assert.equal(
  artifact.model_id,
  "Qwen/Qwen3-32B-GGUF",
  "This installer supports only the documented Qwen3-32B profile.",
);
assert.equal(artifact.files.length, 1);
assert.equal(artifact.revision, "938a7432affaec9157f883a87164e2646ae17555");
assert.equal(
  artifact.files[0].sha256,
  "efd971561896866f0e910cce52761ca77b1b138090c7f15fe284676d57d1f689",
);
assert.equal(
  process.platform,
  "win32",
  "This managed installer is qualified for the documented Windows CPU binary; other hosts need a separately measured profile.",
);
const engineHash = createHash("sha256");
for await (const bytes of createReadStream(
  join(resolve(a["engine-dir"]), "llama-server.exe"),
))
  engineHash.update(bytes);
assert.equal(
  engineHash.digest("hex"),
  "aa2e1f5c67be55f11be26ae58d643a545ca07c6de498f6f870330ac2f4dfec73",
  "The engine differs from the measured b10964 Windows CPU binary.",
);
await acquire(artifact, resolve(a["model-dir"]), true);
const c = await config(),
  directory = join(runtime, "cpu-route");
await mkdir(directory, { recursive: true, mode: 0o700 });
await protectDirectory(directory);
const profile = {
  schema_version: 1,
  engine_dir: resolve(a["engine-dir"]),
  model_dir: resolve(a["model-dir"]),
  manifest: resolve(a.manifest),
  model_id: "qwen3-32b-route-private",
};
let cookie = "",
  route,
  installed = false,
  cpuChanged = false;
const invites = [];
async function api(path, method = "GET", body) {
  const r = await fetch(`http://127.0.0.1:${c.control_port}/api/v1${path}`, {
    method,
    headers: {
      Cookie: cookie,
      Origin: c.web_origin,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const v = await r.json();
  assert.ok(
    r.ok,
    `Private route configuration rejected: ${path} ${v.error?.code ?? ""}`,
  );
  return v;
}
async function configure(args) {
  await new Promise((res, rej) => {
    const p = spawn(
      process.execPath,
      [join(root, "scripts/node-config.mjs"), ...args],
      { cwd: root, windowsHide: true, stdio: "ignore" },
    );
    p.once("error", rej);
    p.once("exit", (code) =>
      code === 0
        ? res()
        : rej(
            new Error(
              "Operator configuration failed; private state retained for inspection.",
            ),
          ),
    );
  });
}
try {
  const login = await fetch(
    `http://127.0.0.1:${c.control_port}/api/v1/auth/login`,
    {
      method: "POST",
      headers: { Origin: c.web_origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        login: c.admin_login,
        password: c.admin_password,
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  assert.ok(login.ok);
  const user = (await login.json()).user;
  cookie = login.headers.get("set-cookie").split(";")[0];
  assert.ok(
    !(await api("/sessions")).data.some((s) =>
      ["QUEUED", "PREPARING", "AUTHORIZED", "RUNNING", "CANCELLING"].includes(
        s.state,
      ),
    ),
    "Finish active private sessions before changing the CPU group.",
  );
  await backup();
  const nodes = (await api("/nodes")).data;
  let domain;
  try {
    const old = JSON.parse(
      await readFile(
        join(runtime, "cpu-cluster", "operator", "config.json"),
        "utf8",
      ),
    );
    const node = nodes.find(
      (n) => n.id === old.node_id && n.owner_id === user.id,
    );
    assert.ok(
      node,
      "The installed CPU domain could not be verified; do not create a duplicate physical resource.",
    );
    domain = node.resource_domain_id;
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (!domain)
    domain = (
      await api("/admin/domains", "POST", {
        name: "CPU and RAM · local guarded 32B route",
        owner_id: user.id,
        slots: 1,
      })
    ).id;
  const model = (await api("/models")).data.find(
    (m) => m.id === profile.model_id,
  );
  if (model)
    assert.equal(model.manifest.artifact_sha256, artifact.files[0].sha256);
  else
    await api("/models", "POST", {
      schema_version: 1,
      model_id: profile.model_id,
      display_name: "Qwen3-32B · rota CPU privada",
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
        "Official 32.8B Q4_K_M; guarded two-stage CPU route on one host, one operator, one physical domain and one slot. Three signed participant receipts; no public/WAN qualification.",
      trust_policy: "private_lab",
    });
  await api(`/admin/models/${profile.model_id}/qualify`, "POST", {
    state: "LOCAL_PREVIEW",
    note: "Explicit private installation of the measured single-host 32B route. Stage observations are trusted and do not prove independent work or economic viability.",
  });
  const engine = join(directory, "engine"),
    key = join(engine, "engine-api-key.txt");
  await mkdir(engine, { recursive: true, mode: 0o700 });
  try {
    await writeFile(key, randomBytes(32).toString("base64url") + "\n", {
      flag: "wx",
      mode: 0o600,
    });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
  for (let i = 0; i < 3; i++) {
    const invite = await api("/admin/node-invites", "POST", {
      name: i === 0 ? "Qwen3-32B · nó principal" : `Qwen3-32B · etapa CPU ${i}`,
      owner_id: user.id,
      resource_domain_id: domain,
      model_id: profile.model_id,
      base_url: `http://127.0.0.1:${43124 + i}`,
      node_kind: i === 0 ? "ROUTE_ROOT" : "RPC_STAGE",
    });
    invites.push(invite);
    const file = join(directory, `invitation-${i}-${randomUUID()}.json`);
    await writeFile(file, JSON.stringify(invite), { flag: "wx", mode: 0o600 });
    await configure([
      "--invite-file",
      file,
      "--backend-model",
      "network-ai-qualified-model",
      "--backend-url",
      "http://127.0.0.1:43224",
      "--backend-kind",
      "openai",
      "--backend-key-file",
      key,
      "--port",
      String(43124 + i),
      "--directory",
      join(directory, `operator-${i}`),
    ]);
  }
  cpuChanged = true;
  await stopCpu();
  await startCpuRoute(profile);
  route = await api("/routes", "POST", {
    name: "Qwen3-32B · complete private CPU route",
    model_id: profile.model_id,
    idempotency_key: randomUUID(),
    participants: invites.map((n, i) => ({
      node_id: n.id,
      share_bps: i === 0 ? 1000 : 4500,
    })),
  });
  await api(`/routes/${route.id}/accept`, "POST", {
    route_sha256: route.route_sha256,
  });
  await api(`/admin/routes/${route.id}/qualify`, "POST", {
    state: "LOCAL_PREVIEW",
    note: "Single-host route: one root and two real CPU workers, shared domain, explicit 10/45/45 division of the provider pool. No independent operator, WAN or market-cost qualification.",
  });
  let ready = false;
  for (let i = 0; i < 15; i++) {
    ready = (await api("/routes")).data.some(
      (r) => r.id === route.id && r.available,
    );
    if (ready) break;
    await delay(1000);
  }
  assert.ok(
    ready,
    "Complete route did not become available; inspect the retained private logs.",
  );
  await writeFile(
    profilePath,
    JSON.stringify(
      {
        ...profile,
        route_id: route.id,
        domain_id: domain,
        node_ids: invites.map((n) => n.id),
      },
      null,
      2,
    ) + "\n",
    { flag: "wx", mode: 0o600, flush: true },
  );
  installed = true;
  console.log(
    "Managed 32B route installed. lab:start/lab:stop now manage its three signed agents and guarded CPU workers. The previous CPU profile is retained without loading a second model copy.",
  );
} finally {
  if (!installed) {
    if (cpuChanged) await stopCpu().catch(() => {});
    if (route)
      await api(`/admin/routes/${route.id}/qualify`, "POST", {
        state: "REVOKED",
        note: "Incomplete installation was stopped; private evidence retained for diagnosis.",
      }).catch(() => {});
    for (const invite of invites)
      await api(`/nodes/${invite.id}/state`, "POST", {
        state: "REVOKED",
      }).catch(() => {});
  }
  if (cookie) await api("/auth/logout", "POST", {}).catch(() => {});
}
