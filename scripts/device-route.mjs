// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Resumable one-host installation. Device domains are reused, never minted here.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, readdir, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "node:net";
import { createSocket } from "node:dgram";
import {
  config,
  root,
  runtime,
  protectDirectory,
  launch,
  stopManagedDeviceRoute,
} from "./lab.mjs";
import { acquire } from "./artifacts.mjs";
import { ensureRpcIdentity, configureRpc } from "./rpc-config.mjs";
import { loadDeviceRecipe } from "./device-route-profile.mjs";
import {
  ensureIdentity,
  configureWorker,
} from "../packages/contributor/src/configure.mjs";
import {
  hashFile,
  loadProfile,
  enginePin,
  verifyPinnedFiles,
} from "../packages/contributor/src/profile.mjs";
import { prepareDevice } from "../packages/contributor/src/devices.mjs";
import { atomicJson } from "../packages/contributor/src/state.mjs";
import { workerStatus } from "../packages/contributor/src/supervisor.mjs";

export function deviceRouteDirectory(id) {
  assert.match(id, /^[a-z][a-z0-9-]{0,31}$/);
  return join(runtime, "device-routes", id);
}
async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
async function matching(path, value) {
  try {
    assert.ok(
      isDeepStrictEqual(await json(path), value),
      "Existing configuration differs; keep this identity and use a new explicit recipe",
    );
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    await writeFile(path, JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
      flush: true,
    });
  }
}
async function sessionApi() {
  const c = await config();
  let cookie;
  const api = async (path, method = "GET", body) => {
    const response = await fetch(
      `http://127.0.0.1:${c.control_port}/api/v1${path}`,
      {
        method,
        headers: {
          Cookie: cookie ?? "",
          Origin: c.web_origin,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      },
    );
    const value = await response.json();
    assert.ok(
      response.ok,
      `Device route API ${path}: ${value.error?.code ?? response.status}`,
    );
    if (path === "/auth/login")
      cookie = response.headers.get("set-cookie").split(";")[0];
    return value;
  };
  const { user } = await api("/auth/login", "POST", {
    login: c.admin_login,
    password: c.admin_password,
  });
  return {
    c,
    api,
    user,
    close: () => api("/auth/logout", "POST", {}).catch(() => {}),
  };
}
async function idle(api) {
  const sessions = (await api("/sessions")).data;
  const windows = [
    ...(await api("/availability/leases")).data,
    ...(await api("/availability/routes")).data,
  ];
  assert.ok(
    !sessions.some((s) =>
      ["QUEUED", "PREPARING", "AUTHORIZED", "RUNNING", "CANCELLING"].includes(
        s.state,
      ),
    ) &&
      !windows.some((w) => ["OFFERED", "ACTIVE", "DRAINING"].includes(w.state)),
    "Finish active sessions and accepted windows before configuring hardware",
  );
}
async function verifyRuntime(recipe) {
  assert.equal(
    process.platform,
    "win32",
    "This device adapter currently qualifies Windows x64 binaries only",
  );
  assert.equal(process.arch, "x64");
  const pin = await enginePin("llama-b10964-win-x64-cpu");
  await verifyPinnedFiles(recipe.root_engine_directory, pin.files);
  const checked = new Map([[recipe.root_engine_directory, pin.id]]);
  for (const stage of recipe.stages) {
    if (!checked.has(stage.engine.directory)) {
      await verifyPinnedFiles(
        stage.engine.directory,
        (await enginePin(stage.engine.id)).files,
      );
      checked.set(stage.engine.directory, stage.engine.id);
    } else
      assert.equal(
        stage.engine.id,
        checked.get(stage.engine.directory),
        "One verified directory cannot represent two engine builds",
      );
  }
  for (const binary of Object.values(recipe.binaries)) {
    const info = await lstat(binary.path);
    assert.ok(
      info.isFile() && !info.isSymbolicLink(),
      "Native binary must be a regular file",
    );
    assert.equal(
      await hashFile(binary.path),
      binary.sha256,
      "Native binary pin changed",
    );
  }
  const artifact = await json(recipe.artifact_manifest);
  assert.equal(
    artifact.files.length,
    1,
    "This adapter needs one complete GGUF",
  );
  assert.ok(artifact.files[0].path.endsWith(".gguf"));
  assert.equal(artifact.revision, recipe.model.revision);
  assert.equal(artifact.files[0].sha256, recipe.model.artifact_sha256);
  assert.equal(artifact.files[0].url, recipe.model.source_url);
  assert.equal(artifact.license_id, recipe.model.license_id);
  await acquire(artifact, recipe.model_directory, true);
}
async function headroom(recipe) {
  const groups = new Map();
  for (const stage of recipe.stages) {
    const key =
      stage.device.kind === "CPU" ? "CPU" : stage.device.uuid.toLowerCase();
    const group = groups.get(key) ?? { stage, budget: 0, reserve: 0 };
    group.budget += stage.device.buffer_budget_mib;
    group.reserve = Math.max(group.reserve, stage.device.reserve_mib);
    groups.set(key, group);
  }
  for (const { stage, budget, reserve } of groups.values()) {
    const observed = await prepareDevice({
      ...stage,
      mode: "private_contributor_device",
    });
    assert.ok(
      observed.snapshot().memory_free_mib >= budget + reserve,
      "Combined device budgets leave insufficient physical headroom",
    );
  }
}
async function portsFree(recipe) {
  const ports = [
    ["tcp", recipe.root_http_port],
    ["tcp", recipe.engine_port],
  ];
  for (const stage of recipe.stages)
    for (const [key, value] of Object.entries(stage.ports))
      ports.push([key.includes("udp") ? "udp" : "tcp", value]);
  for (const [kind, port] of ports)
    await new Promise((resolve, reject) => {
      const socket = kind === "tcp" ? createServer() : createSocket("udp4");
      socket.once("error", (error) => {
        try {
          socket.close();
        } catch {}
        reject(
          Object.assign(
            new Error(`Device route port ${port} is occupied or unavailable`),
            { code: error.code },
          ),
        );
      });
      const done = () => socket.close(resolve);
      if (kind === "tcp")
        socket.listen({ host: "127.0.0.1", port, exclusive: true }, done);
      else socket.bind(port, "127.0.0.1", done);
    });
}
export async function installedDeviceRoutes() {
  let entries;
  try {
    entries = await readdir(join(runtime, "device-routes"), {
      withFileTypes: true,
    });
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
  const ids = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-z][a-z0-9-]{0,31}$/.test(entry.name))
      continue;
    try {
      if (
        (
          await json(
            join(deviceRouteDirectory(entry.name), "installation.json"),
          )
        ).enabled === true
      )
        ids.push(entry.name);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  return ids.sort();
}
export async function startDeviceRoute(id, options = {}) {
  const directory = deviceRouteDirectory(id),
    recipe = await loadDeviceRecipe(join(directory, "recipe.json"));
  assert.equal(recipe.id, id);
  const state = await json(join(directory, "installation.json"));
  assert.ok(
    state.route &&
      state.invites?.length === recipe.stages.length + 1 &&
      (state.enabled || options.installing),
    "Incomplete installation; resume install with the original recipe",
  );
  await verifyRuntime(recipe);
  const prefix = `device_${id}`;
  // All profiles and bindings are checked before starting any native component.
  const workers = [];
  for (let index = 0; index < recipe.stages.length; index++) {
    const file = join(directory, `operator-${index + 1}`, "worker.json");
    const loaded = await loadProfile(file);
    assert.equal(loaded.profile.node.id, state.invites[index + 1].id);
    assert.equal(loaded.profile.binding.route_id, state.route.id);
    assert.equal(loaded.profile.binding.route_sha256, state.route.route_sha256);
    assert.deepEqual(loaded.profile.device, recipe.stages[index].device);
    const stage = recipe.stages[index];
    assert.deepEqual(loaded.profile.engine, stage.engine);
    assert.equal(loaded.profile.threads, stage.threads);
    assert.equal(loaded.profile.node.backend_model, recipe.model.backend_model);
    assert.equal(loaded.profile.node.http_port, stage.ports.http);
    assert.equal(loaded.profile.binding.manifest_sha256, state.manifest_sha256);
    assert.deepEqual(loaded.profile.ports, {
      worker_rpc: stage.ports.worker_rpc,
      guard_rpc: stage.ports.guard_rpc,
      control_forward: stage.ports.control_to_coordinator,
    });
    assert.deepEqual(
      loaded.profile.binaries,
      Object.fromEntries(
        Object.entries(recipe.binaries).filter(([key]) => key !== "node"),
      ),
    );
    workers.push({ file, profile: loaded.profile });
  }
  // Idempotent restarts reuse running supervisors; their per-allocation probes
  // remain active. Fresh workers perform headroom preflight in startWorker.
  const statuses = await Promise.all(
    workers.map((worker) => workerStatus(worker.file).catch(() => null)),
  );
  if (statuses.every((status) => !status?.live)) await headroom(recipe);
  try {
    for (const [index, worker] of workers.entries()) {
      const i = index + 1,
        stage = recipe.stages[index];
      await launch(
        `${prefix}_control_${i}`,
        worker.profile.binaries.http.path,
        [],
        stage.ports.control_from_root,
        null,
        {
          listenerOnly: true,
          linkConfigPath: join(directory, `root-control-${i}`, "link.json"),
        },
      );
      await launch(
        `${prefix}_contributor_${i}`,
        process.execPath,
        [
          join(root, "packages/contributor/bin/worker.mjs"),
          "start",
          "--config",
          worker.file,
        ],
        stage.ports.http,
        null,
        { workerConfigPath: worker.file },
      );
      const rpcFolder = join(directory, `root-rpc-${i}`),
        rpc = await json(join(rpcFolder, "rpc.json"));
      assert.equal(rpc.binding.route_id, state.route.id);
      assert.equal(rpc.binding.route_sha256, state.route.route_sha256);
      assert.equal(rpc.binding.manifest_sha256, state.manifest_sha256);
      assert.equal(rpc.binding.stage_node_id, worker.profile.node.id);
      assert.equal(rpc.local_port, stage.ports.root_rpc);
      await launch(
        `${prefix}_rpc_${i}`,
        worker.profile.binaries.rpc.path,
        ["--config", join(rpcFolder, "rpc.json")],
        rpc.local_port,
        null,
        { rpcStatusFile: join(rpcFolder, "rpc-status.json") },
      );
    }
    const engine = join(directory, "engine");
    await launch(
      `${prefix}_cluster`,
      process.execPath,
      [
        join(root, "scripts/cluster.mjs"),
        "--engine-dir",
        recipe.root_engine_directory,
        "--model-dir",
        recipe.model_directory,
        "--manifest",
        recipe.artifact_manifest,
        "--directory",
        engine,
        "--workers",
        String(recipe.stages.length),
        "--worker-supervision",
        "external",
        "--port",
        String(recipe.engine_port),
        "--rpc-port",
        String(recipe.stages[0].ports.worker_rpc),
        "--rpc-forward-port",
        String(recipe.stages[0].ports.root_rpc),
        "--rpc-transport",
        "iroh-direct-quic-guarded-rpc",
        "--threads",
        String(recipe.root_threads),
        "--context",
        String(recipe.model.max_context_tokens),
        "--batch",
        String(recipe.batch),
        "--tensor-split",
        recipe.stages.map((s) => s.tensor_weight).join(","),
      ],
      recipe.engine_port,
      `http://127.0.0.1:${recipe.engine_port}/health`,
      {
        healthSeconds: 600,
        healthKeyFile: join(engine, "engine-api-key.txt"),
        shutdownFile: join(engine, "stop.request"),
      },
    );
    await launch(
      `${prefix}_root`,
      recipe.binaries.node.path,
      [],
      recipe.root_http_port,
      `http://127.0.0.1:${recipe.root_http_port}/health`,
      { configPath: join(directory, "operator-0", "config.json") },
    );
  } catch (e) {
    await stopManagedDeviceRoute(id, recipe.stages.length);
    throw e;
  }
}
export async function stopDeviceRoute(id) {
  const recipe = await loadDeviceRecipe(
    join(deviceRouteDirectory(id), "recipe.json"),
  );
  await stopManagedDeviceRoute(id, recipe.stages.length);
}
export async function installDeviceRoute(file) {
  const recipe = await loadDeviceRecipe(file),
    directory = deviceRouteDirectory(recipe.id);
  await verifyRuntime(recipe);
  const { c, api, user, close } = await sessionApi();
  let state,
    statePath,
    installed = false;
  try {
    await idle(api);
    const domains = (await api("/admin/domains")).data;
    for (const id of new Set([
      recipe.root_resource_domain_id,
      ...recipe.stages.map((s) => s.resource_domain_id),
    ]))
      assert.ok(
        domains.some(
          (d) => d.id === id && d.owner_id === user.id && d.slots === 1,
        ),
        "Choose existing one-slot domains owned by this operator; installation cannot invent or duplicate physical capacity",
      );
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await protectDirectory(directory);
    await matching(join(directory, "recipe.json"), recipe);
    statePath = join(directory, "installation.json");
    try {
      state = await json(statePath);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      state = {
        schema_version: 1,
        enabled: false,
        phase: "PREPARED",
        idempotency_key: randomUUID(),
        invites: [],
        route: null,
      };
      await atomicJson(statePath, state);
    }
    if (state.enabled) {
      await startDeviceRoute(recipe.id);
      return;
    }
    await stopManagedDeviceRoute(recipe.id, recipe.stages.length);
    await headroom(recipe);
    await portsFree(recipe);
    let model = (await api("/models")).data.find(
      (m) => m.id === recipe.model.model_id,
    );
    if (model)
      assert.deepEqual(
        model.manifest,
        recipe.model,
        "Published model differs from the exact recipe",
      );
    else model = await api("/models", "POST", recipe.model);
    state.manifest_sha256 = model.manifest_sha256;
    await atomicJson(statePath, state);
    await api(`/admin/models/${recipe.model.model_id}/qualify`, "POST", {
      state: "LOCAL_PREVIEW",
      note: "Explicit one-host device installation with pinned artifacts and memory budgets. Runtime qualification is private; no independent-host, performance, market-price or public-network claim.",
    });
    const currentNodes = (await api("/nodes")).data;
    for (let i = state.invites.length; i <= recipe.stages.length; i++) {
      const name = `${recipe.id} / ${i === 0 ? "root" : `stage ${i}`}`;
      assert.ok(
        !currentNodes.some(
          (n) => n.name === name && n.model_id === recipe.model.model_id,
        ),
        "An earlier invitation exists without its private checkpoint; inspect it before retrying instead of creating a duplicate",
      );
      const stage = recipe.stages[i - 1];
      const invite = await api("/admin/node-invites", "POST", {
        name,
        owner_id: user.id,
        resource_domain_id:
          i === 0 ? recipe.root_resource_domain_id : stage.resource_domain_id,
        model_id: recipe.model.model_id,
        base_url: `http://127.0.0.1:${i === 0 ? recipe.root_http_port : stage.ports.control_from_root}`,
        node_kind: i === 0 ? "ROUTE_ROOT" : "RPC_STAGE",
      });
      state.invites.push(invite);
      await atomicJson(statePath, state);
    }
    if (!state.route) {
      state.route = await api("/routes", "POST", {
        name: recipe.name,
        model_id: recipe.model.model_id,
        idempotency_key: state.idempotency_key,
        participants: state.invites.map((invite, i) => ({
          node_id: invite.id,
          share_bps:
            i === 0 ? recipe.root_share_bps : recipe.stages[i - 1].share_bps,
        })),
      });
      await atomicJson(statePath, state);
    }
    await api(`/routes/${state.route.id}/accept`, "POST", {
      route_sha256: state.route.route_sha256,
    });
    const engine = join(directory, "engine");
    await mkdir(engine, { recursive: true, mode: 0o700 });
    const keyFile = join(engine, "engine-api-key.txt");
    let engineKey;
    try {
      engineKey = (await readFile(keyFile, "utf8")).trim();
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      engineKey = randomBytes(32).toString("base64url");
      await writeFile(keyFile, engineKey + "\n", {
        flag: "wx",
        mode: 0o600,
        flush: true,
      });
    }
    assert.match(engineKey, /^[A-Za-z0-9_-]{43}$/);
    const rootDir = join(directory, "operator-0");
    await mkdir(rootDir, { recursive: true, mode: 0o700 });
    const rootInvite = state.invites[0];
    await matching(join(rootDir, "config.json"), {
      mode: "private_lab",
      control_port: c.control_port,
      gateway_port: c.gateway_port,
      capability_public_key: rootInvite.operator.capability_public_key,
      node_id: rootInvite.id,
      node_kind: "ROUTE_ROOT",
      node_invite: rootInvite.invite,
      node_name: recipe.name,
      node_port: recipe.root_http_port,
      backend_url: `http://127.0.0.1:${recipe.engine_port}`,
      backend_api_key: engineKey,
      backend_model: recipe.model.backend_model,
      backend_kind: "openai",
      state_dir: rootDir,
      web_origin: c.web_origin,
    });
    for (const [index, stage] of recipe.stages.entries()) {
      const i = index + 1,
        op = join(directory, `operator-${i}`),
        control = join(directory, `root-control-${i}`),
        rpc = join(directory, `root-rpc-${i}`);
      const identity = await ensureIdentity(op),
        controlIdentity = await ensureRpcIdentity(control),
        rpcIdentity = await ensureRpcIdentity(rpc);
      const binding = {
        stage_node_id: state.invites[i].id,
        route_id: state.route.id,
        route_sha256: state.route.route_sha256,
        manifest_sha256: state.manifest_sha256,
      };
      const settings = {
        schema_version: 1,
        mode: "private_contributor_device",
        device: stage.device,
        node: {
          name: stage.name,
          http_port: stage.ports.http,
          backend_model: recipe.model.backend_model,
        },
        binding,
        ports: {
          worker_rpc: stage.ports.worker_rpc,
          guard_rpc: stage.ports.guard_rpc,
          control_forward: stage.ports.control_to_coordinator,
        },
        control: {
          peer_id: controlIdentity.id,
          peer_addresses: [`127.0.0.1:${stage.ports.control_udp_root}`],
          bind_addr: `127.0.0.1:${stage.ports.control_udp_stage}`,
        },
        rpc: {
          peer_id: rpcIdentity.id,
          peer_addresses: [`127.0.0.1:${stage.ports.rpc_udp_root}`],
          bind_addr: `127.0.0.1:${stage.ports.rpc_udp_stage}`,
        },
        engine: stage.engine,
        binaries: Object.fromEntries(
          Object.entries(recipe.binaries).filter(([key]) => key !== "node"),
        ),
        threads: stage.threads,
        startup_compute_commands: 4,
      };
      await matching(join(op, "settings.json"), settings);
      await configureWorker(op, state.invites[i], settings);
      const controlPrivate = await json(join(control, "identity.private.json"));
      await matching(join(control, "link.json"), {
        schema_version: 1,
        role: "control",
        node_id: state.invites[i].id,
        secret_key: controlPrivate.secret_key,
        peer_id: identity.control.id,
        peer_addresses: [settings.control.bind_addr],
        bind_addr: settings.control.peer_addresses[0],
        forward_port: stage.ports.control_from_root,
        target_port: c.control_port,
      });
      await configureRpc({
        directory: rpc,
        role: "root",
        binding,
        peer: { schema_version: 1, id: identity.rpc.id },
        peerAddress: settings.rpc.bind_addr,
        bind: settings.rpc.peer_addresses[0],
        localPort: stage.ports.root_rpc,
      });
    }
    await api(`/admin/routes/${state.route.id}/qualify`, "POST", {
      state: "LOCAL_PREVIEW",
      note: "One-host, one-operator device route. Layer weights and provider payment shares are separately specified. Existing CPU/GPU domains are reused. Runtime readiness and a real inference campaign are required; no public hardware or market qualification.",
    });
    for (const invite of state.invites)
      await api(`/nodes/${invite.id}/state`, "POST", { state: "READY" });
    state.phase = "STARTING";
    await atomicJson(statePath, state);
    await startDeviceRoute(recipe.id, { installing: true });
    let ready = false;
    for (let i = 0; i < 45; i++) {
      ready = (await api("/routes")).data.some(
        (r) => r.id === state.route.id && r.available,
      );
      if (ready) break;
      await delay(1000);
    }
    assert.ok(
      ready,
      "Device route did not become available; stopped configuration is retained for explicit resume",
    );
    state.enabled = true;
    state.phase = "READY";
    await atomicJson(statePath, state);
    installed = true;
    console.log(
      `Device route ${recipe.id} is ready. Run a real inference campaign before publishing hardware evidence.`,
    );
  } finally {
    if (!installed && state && !state.enabled) {
      await stopManagedDeviceRoute(recipe.id, recipe.stages.length).catch(
        () => {},
      );
      for (const invite of state.invites)
        await api(`/nodes/${invite.id}/state`, "POST", {
          state: "PAUSED",
        }).catch(() => {});
      state.phase = "STOPPED_AFTER_FAILURE";
      await atomicJson(statePath, state);
    }
    await close();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const { values: args, positionals } = parseArgs({
    allowPositionals: true,
    options: { recipe: { type: "string" }, id: { type: "string" } },
  });
  assert.equal(
    positionals.length,
    1,
    "Use install --recipe FILE, start --id ID, stop --id ID, or list",
  );
  if (positionals[0] === "install") {
    assert.ok(args.recipe);
    await installDeviceRoute(args.recipe);
  } else if (positionals[0] === "start") await startDeviceRoute(args.id);
  else if (positionals[0] === "stop") await stopDeviceRoute(args.id);
  else {
    assert.equal(positionals[0], "list");
    console.log(JSON.stringify(await installedDeviceRoutes()));
  }
}
