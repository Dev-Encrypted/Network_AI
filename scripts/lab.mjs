// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { spawn, execFileSync } from "node:child_process";
import {
  mkdir,
  readFile,
  writeFile,
  open,
  chmod,
  stat,
  readdir,
  unlink,
} from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import {
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  createHash,
} from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { finished } from "node:stream/promises";
import net from "node:net";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const runtime = join(root, ".runtime", "private-lab");
export const configPath = join(runtime, "config.json");
const processesPath = join(runtime, "processes.json");
const require = createRequire(join(root, "apps/control-api/package.json"));
const { Pool } = require("pg");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const secret = () => randomBytes(32).toString("base64url");
const composeArgs = [
  "compose",
  "--project-name",
  "network-ai-private-lab",
  "--env-file",
  join(runtime, "compose.env"),
  "-f",
  join(root, "infra/compose/private-lab.yaml"),
];
function command(program, args, options = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(program, args, {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
      ...options,
    });
    p.on("error", reject);
    p.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${program} exited with ${code}`)),
    );
  });
}
async function pnpm(args) {
  // Invoke pnpm's JS entry directly on Windows, avoiding shell interpolation of workspace paths.
  const runningEntry = process.env.npm_execpath;
  if (
    runningEntry &&
    /pnpm\.(c?js)$/i.test(runningEntry) &&
    (await exists(runningEntry))
  )
    return command(process.execPath, [runningEntry, ...args]);
  if (process.platform === "win32") {
    const entry = join(
      dirname(
        execFileSync("where.exe", ["pnpm"], {
          encoding: "utf8",
          windowsHide: true,
        })
          .trim()
          .split(/\r?\n/)[0],
      ),
      "node_modules/pnpm/bin/pnpm.cjs",
    );
    if (await exists(entry)) return command(process.execPath, [entry, ...args]);
    const corepack = join(
      dirname(dirname(dirname(dirname(entry)))),
      "node_modules/corepack/dist/pnpm.js",
    );
    if (await exists(corepack))
      return command(process.execPath, [corepack, ...args]);
    throw new Error(
      "Could not locate the pnpm JS entry. Run this command through pnpm lab:init or install pnpm globally.",
    );
  }
  return command("pnpm", args);
}
async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
export async function config() {
  return JSON.parse(await readFile(configPath, "utf8"));
}
export async function protectDirectory(path) {
  if (process.platform === "win32") {
    const identity = execFileSync("whoami.exe", [], {
      encoding: "utf8",
      windowsHide: true,
    }).trim();
    execFileSync(
      "icacls.exe",
      [path, "/inheritance:r", "/grant:r", `${identity}:(OI)(CI)F`],
      { stdio: "ignore", windowsHide: true },
    );
  } else await chmod(path, 0o700);
}
async function privateJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}
async function databaseUp() {
  await command("docker", [...composeArgs, "up", "-d", "--wait", "postgres"]);
}
export function assertFreshEnvironment() {
  // A second checkout must not recreate the shared container with newly generated credentials.
  const existing = execFileSync(
    "docker",
    [
      "ps",
      "--all",
      "--filter",
      "name=^/network-ai-private-lab-postgres$",
      "--format",
      "{{.ID}}",
    ],
    {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    },
  ).trim();
  if (existing)
    throw new Error(
      "A private-lab database already exists on this host. Restore its matching private configuration before initializing another checkout.",
    );
}
export async function init() {
  // Schema upgrades must not race an older coordinator accepting new leases.
  // Check the configured port as well as managed ownership: an untracked
  // manually started coordinator cannot safely coexist with this initializer.
  if (await exists(configPath)) {
    const previous = await config();
    if (await listening(previous.control_port))
      throw new Error(
        "Stop the private control service before initialization or schema migrations; use lab:start --no-build to reuse the running installation.",
      );
  }
  await mkdir(runtime, { recursive: true });
  await protectDirectory(runtime);
  if (!(await exists(configPath))) {
    assertFreshEnvironment();
    const keys = generateKeyPairSync("ed25519");
    const postgres = secret();
    const app = secret();
    const value = {
      mode: "private_lab",
      database_owner_url: `postgresql://network_ai_owner:${postgres}@127.0.0.1:54329/network_ai`,
      database_url: `postgresql://network_ai_runtime:${app}@127.0.0.1:54329/network_ai`,
      postgres_password: postgres,
      runtime_password: app,
      control_port: 43101,
      gateway_port: 43102,
      node_port: 43103,
      web_origin: "http://127.0.0.1:43100",
      cookie_name: "nai_session",
      gateway_secret: secret(),
      capability_private_key_pem: keys.privateKey.export({
        format: "pem",
        type: "pkcs8",
      }),
      capability_public_key: keys.publicKey
        .export({ format: "der", type: "spki" })
        .subarray(-32)
        .toString("base64url"),
      admin_login: "admin",
      admin_password: secret(),
      node_id: randomUUID(),
      node_invite: secret(),
      node_name: "Operador local",
      backend_url: "http://127.0.0.1:1235",
      backend_model: "Qwen3.8-27B / Q4",
      backend_kind: "lmstudio",
      state_dir: runtime,
    };
    await writeFile(configPath, JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    await writeFile(
      join(runtime, "credentials.txt"),
      `NETWORK AI — laboratório privado\n\nURL: ${value.web_origin}\nUsuário: ${value.admin_login}\nSenha: ${value.admin_password}\n\nArquivo privado. Não publicar nem compartilhar.\n`,
      { flag: "wx", mode: 0o600 },
    );
  }
  const c = await config();
  await writeFile(
    join(runtime, "compose.env"),
    `NETWORK_AI_POSTGRES_PASSWORD=${c.postgres_password}\n`,
    { mode: 0o600 },
  );
  await databaseUp();
  await pnpm(["--filter", "@network-ai/contracts", "build"]);
  await pnpm(["--filter", "@network-ai/control-api", "build"]);
  const { passwordHash, canonical } =
    await import("../apps/control-api/dist/security.js");
  const { createAccounts, post, availableAccount } =
    await import("../apps/control-api/dist/ledger.js");
  const pool = new Pool({
    connectionString: c.database_owner_url,
    options: "-c search_path=nai,public",
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const role = await client.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [
      "network_ai_runtime",
    ]);
    if (!role.rowCount) {
      // Only locally generated base64url is accepted in this DDL literal; it cannot contain SQL delimiters.
      if (!/^[A-Za-z0-9_-]{40,100}$/.test(c.runtime_password))
        throw new Error("Invalid generated database credential");
      await client.query(
        `CREATE ROLE network_ai_runtime LOGIN PASSWORD '${c.runtime_password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`,
      );
    }
    const migrationDirectory = join(root, "infra/migrations");
    for (const file of (await readdir(migrationDirectory))
      .filter((name) => /^\d{3}_[a-z_]+\.sql$/.test(name))
      .sort()) {
      const version = Number(file.slice(0, 3));
      const bytes = await readFile(join(migrationDirectory, file));
      const sha = digest(bytes);
      const table = await client.query(
        "SELECT to_regclass('nai.schema_migrations') AS name",
      );
      const previous = table.rows[0].name
        ? (
            await client.query(
              "SELECT sha256 FROM nai.schema_migrations WHERE version=$1",
              [version],
            )
          ).rows[0]
        : undefined;
      if (previous) {
        if (previous.sha256 !== sha)
          throw new Error(
            `Migration ${version} checksum changed; create a new migration`,
          );
      } else {
        await client.query(bytes.toString("utf8"));
        await client.query(
          "INSERT INTO nai.schema_migrations(version,sha256) VALUES($1,$2)",
          [version, sha],
        );
      }
    }
    let user = (
      await client.query("SELECT id FROM nai.users WHERE login=$1", [
        c.admin_login,
      ])
    ).rows[0];
    if (!user) {
      user = { id: randomUUID() };
      await client.query(
        "INSERT INTO nai.users(id,login,name,password_hash,role) VALUES($1,$2,$3,$4,'admin')",
        [
          user.id,
          c.admin_login,
          "Dev-Encrypted",
          await passwordHash(c.admin_password),
        ],
      );
      await createAccounts(client, user.id);
      await post(
        client,
        "bootstrap:private-lab",
        "LAB_GRANT",
        [
          ["lab:issuer", -100_000_000n],
          [availableAccount(user.id), 100_000_000n],
        ],
        {
          reason:
            "Explicit bootstrap of 100 LAB_TU for private acceptance tests; no cash value",
          policy: "private-lab-v1",
        },
      );
    }
    const model = {
      schema_version: 1,
      model_id: "qwen-local",
      display_name: "Qwen local · 27B Q4",
      backend_model: c.backend_model,
      revision: "local-f0-2026-09-14",
      artifact_sha256:
        "4c5e2db039e9325ac7724c8846c71356a24ad1cdfa28002d73ecb6be645f9675",
      license_id: "LicenseRef-Upstream-Unqualified",
      source_url:
        "https://huggingface.co/JonathanColetti/Qwen3.8-27B-Uncensored-GGUF",
      modality: "text",
      max_context_tokens: 8192,
      max_output_tokens: 512,
      max_input_bytes: 6000,
      input_rate_microtu: "1000",
      output_rate_microtu: "3000",
      rate_denominator: 1,
      description:
        "Modelo já carregado no LM Studio. Uso privado; origem e licença ainda não qualificadas para oferta pública.",
      trust_policy: "private_lab",
    };
    await client.query(
      `INSERT INTO nai.models(id,manifest,manifest_sha256,state,publisher_id,qualification_note)
      VALUES($1,$2,$3,'LOCAL_PREVIEW',$4,$5) ON CONFLICT(id) DO NOTHING`,
      [
        model.model_id,
        model,
        digest(canonical(model)),
        user.id,
        "Inferência local F0; um host. Medição declarada pelo engine. Sem qualificação comercial ou WAN.",
      ],
    );
    let domain = (
      await client.query(
        "SELECT id FROM nai.resource_domains WHERE owner_id=$1 ORDER BY created_at LIMIT 1",
        [user.id],
      )
    ).rows[0];
    if (!domain) {
      domain = { id: randomUUID() };
      await client.query(
        "INSERT INTO nai.resource_domains(id,name,slots,owner_id) VALUES($1,$2,1,$3)",
        [domain.id, "GPU local · capacidade compartilhada", user.id],
      );
    }
    await client.query(
      "INSERT INTO nai.nodes(id,owner_id,name,resource_domain_id,model_id,base_url) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING",
      [
        c.node_id,
        user.id,
        c.node_name,
        domain.id,
        model.model_id,
        `http://127.0.0.1:${c.node_port}`,
      ],
    );
    await client.query(
      `INSERT INTO nai.node_invites(token_hash,node_id,expires_at) VALUES($1,$2,now()+interval '24 hours') ON CONFLICT DO NOTHING`,
      [digest(c.node_invite), c.node_id],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
  console.log(
    `Ambiente inicializado. Credenciais privadas: ${join(runtime, "credentials.txt")}`,
  );
}
async function listening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}
async function waitHealth(url, seconds = 45, keyFile) {
  for (let i = 0; i < seconds; i++) {
    try {
      const headers = keyFile
        ? {
            Authorization: `Bearer ${(await readFile(keyFile, "utf8")).trim()}`,
          }
        : {};
      if ((await fetch(url, { headers, signal: AbortSignal.timeout(1500) })).ok)
        return;
    } catch {}
    await delay(1000);
  }
  throw new Error(`Service did not become healthy: ${url}`);
}
async function readProcesses() {
  return (await exists(processesPath))
    ? JSON.parse(await readFile(processesPath, "utf8"))
    : {};
}
export async function launch(name, program, args, port, health, options = {}) {
  const c = await config();
  const processes = await readProcesses();
  if (await owned(processes[name])) {
    await waitHealth(
      health,
      options.healthSeconds ?? 45,
      options.healthKeyFile,
    );
    console.log(`${name}: já está em execução`);
    return;
  }
  if (await listening(port)) {
    throw new Error(`Port ${port} is already occupied by an untracked process`);
  }
  if (options.shutdownFile) {
    const expected = managedShutdownPath(name);
    if (resolve(options.shutdownFile) !== expected)
      throw new Error("Unexpected managed shutdown path");
    await unlink(expected).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
  const out = await open(join(runtime, `${name}.out.log`), "a");
  const err = await open(join(runtime, `${name}.err.log`), "a");
  const child = spawn(program, args, {
    cwd: root,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", out.fd, err.fd],
    env: {
      ...process.env,
      NETWORK_AI_CONFIG: options.configPath ?? configPath,
      NEXT_TELEMETRY_DISABLED: "1",
      NETWORK_AI_CONTROL_URL: `http://127.0.0.1:${c.control_port}`,
      NETWORK_AI_GATEWAY_URL: `http://127.0.0.1:${c.gateway_port}`,
    },
  });
  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  child.unref();
  await out.close();
  await err.close();
  processes[name] = {
    pid: child.pid,
    program,
    args,
    port,
    started_at: new Date().toISOString(),
    options,
  };
  await privateJson(processesPath, processes);
  await waitHealth(health, options.healthSeconds ?? 45, options.healthKeyFile);
  console.log(`${name}: pronto em 127.0.0.1:${port}`);
}
async function owned(entry) {
  if (!entry || !Number.isSafeInteger(entry.pid)) return false;
  try {
    if (process.platform === "win32") {
      const script = `$p=Get-CimInstance Win32_Process -Filter "ProcessId = ${entry.pid}"; if($p){$p | Select-Object ExecutablePath,CommandLine | ConvertTo-Json -Compress}`;
      const info = JSON.parse(
        execFileSync(
          "powershell.exe",
          ["-NoProfile", "-NonInteractive", "-Command", script],
          { encoding: "utf8", windowsHide: true },
        ),
      );
      const command = (info.CommandLine ?? "").toLowerCase();
      return (
        command.includes(root.toLowerCase()) &&
        command.includes(entry.program.toLowerCase())
      );
    }
    const args = await readFile(`/proc/${entry.pid}/cmdline`, "utf8");
    return args.includes(root) && args.includes(entry.program);
  } catch {
    return false;
  }
}
export async function start(options = {}) {
  if (!(await exists(configPath))) await init();
  else await databaseUp();
  if (!options.noBuild && !process.argv.includes("--no-build")) {
    const active = await readProcesses();
    for (const entry of Object.values(active))
      if (await owned(entry))
        throw new Error(
          "Stop the running private services before rebuilding, or use lab:start --no-build to reuse them.",
        );
    await pnpm(["build"]);
    await command("cargo", [
      "build",
      "-p",
      "network-ai-node",
      "-p",
      "network-ai-gateway",
      "--locked",
    ]);
  }
  const c = await config();
  const suffix = process.platform === "win32" ? ".exe" : "";
  await launch(
    "control",
    process.execPath,
    [join(root, "apps/control-api/dist/main.js")],
    c.control_port,
    `http://127.0.0.1:${c.control_port}/api/v1/health`,
  );
  await launch(
    "node",
    join(root, `target/debug/network-ai-node${suffix}`),
    [],
    c.node_port,
    `http://127.0.0.1:${c.node_port}/health`,
  );
  await launch(
    "gateway",
    join(root, `target/debug/network-ai-gateway${suffix}`),
    [],
    c.gateway_port,
    `http://127.0.0.1:${c.gateway_port}/health`,
  );
  const next = require.resolve("next/dist/bin/next", {
    paths: [join(root, "apps/web")],
  });
  await launch(
    "web",
    process.execPath,
    [next, "start", join(root, "apps/web"), "-H", "127.0.0.1", "-p", "43100"],
    43100,
    c.web_origin,
  );
  if (
    !options.skipCpu &&
    !process.argv.includes("--skip-cpu") &&
    (await exists(join(runtime, "cpu-route.json")))
  ) {
    await startCpuRoute(
      JSON.parse(await readFile(join(runtime, "cpu-route.json"), "utf8")),
    );
  } else if (
    !options.skipCpu &&
    !process.argv.includes("--skip-cpu") &&
    (await exists(join(runtime, "cpu-cluster.json")))
  ) {
    const cpu = JSON.parse(
      await readFile(join(runtime, "cpu-cluster.json"), "utf8"),
    );
    await startCpuCluster(cpu);
    await launch(
      "cpu_node",
      join(root, `target/debug/network-ai-node${suffix}`),
      [],
      43123,
      "http://127.0.0.1:43123/health",
      { configPath: cpu.node_config },
    );
  }
  console.log(
    `NETWORK AI disponível em ${c.web_origin}. Login no arquivo privado de credenciais.`,
  );
}
function managedShutdownPath(name) {
  if (name === "cpu_cluster")
    return join(runtime, "cpu-cluster", "engine", "stop.request");
  if (name === "route_cluster")
    return join(runtime, "cpu-route", "engine", "stop.request");
  throw new Error("Unknown managed supervisor identity");
}
export async function stopCpu() {
  return stopNames([
    "route_root",
    "cpu_node",
    "route_cluster",
    "route_stage_1",
    "route_stage_2",
    "cpu_cluster",
  ]);
}
export async function stop() {
  return stopNames([
    "web",
    "gateway",
    "route_root",
    "cpu_node",
    "node",
    "route_cluster",
    "route_stage_1",
    "route_stage_2",
    "cpu_cluster",
    "control",
  ]);
}
async function stopNames(names) {
  const processes = await readProcesses();
  for (const name of names) {
    const entry = processes[name];
    if (await owned(entry)) {
      if (name === "cpu_cluster" || name === "route_cluster") {
        const expected = managedShutdownPath(name);
        if (entry.options?.shutdownFile !== expected)
          throw new Error("Missing managed cluster shutdown identity");
        await writeFile(expected, "stop\n", { mode: 0o600 });
        for (let i = 0; i < 20 && (await owned(entry)); i++) await delay(500);
        if (await owned(entry))
          throw new Error(
            "Cluster shutdown did not finish; its tracked processes were preserved for inspection",
          );
      } else process.kill(entry.pid);
      console.log(`${name}: encerrado`);
    }
    delete processes[name];
  }
  await privateJson(processesPath, processes);
  // Database and volume are retained. This command affects no other Docker project.
}
export async function startCpuCluster(cpu) {
  const directory = join(runtime, "cpu-cluster", "engine");
  await launch(
    "cpu_cluster",
    process.execPath,
    [
      join(root, "scripts/cluster.mjs"),
      "--engine-dir",
      cpu.engine_dir,
      "--model-dir",
      cpu.model_dir,
      "--manifest",
      cpu.manifest,
      "--directory",
      directory,
      "--workers",
      "2",
      "--port",
      "43220",
      "--rpc-port",
      "43820",
      "--threads",
      "8",
    ],
    43220,
    "http://127.0.0.1:43220/health",
    {
      healthSeconds: 600,
      healthKeyFile: join(directory, "engine-api-key.txt"),
      shutdownFile: join(directory, "stop.request"),
    },
  );
}
export async function startCpuRoute(profile) {
  const directory = join(runtime, "cpu-route");
  for (let i = 1; i <= 2; i++)
    await launch(
      `route_stage_${i}`,
      process.execPath,
      [
        join(root, "scripts/stage-agent.mjs"),
        "--config",
        join(directory, `operator-${i}`, "config.json"),
        "--rpc-listen-port",
        String(43841 + i),
        "--rpc-target-port",
        String(43839 + i),
        "--startup-compute-commands",
        "4",
      ],
      43124 + i,
      `http://127.0.0.1:${43124 + i}/health`,
    );
  const engine = join(directory, "engine");
  await launch(
    "route_cluster",
    process.execPath,
    [
      join(root, "scripts/cluster.mjs"),
      "--engine-dir",
      profile.engine_dir,
      "--model-dir",
      profile.model_dir,
      "--manifest",
      profile.manifest,
      "--directory",
      engine,
      "--workers",
      "2",
      "--port",
      "43224",
      "--rpc-port",
      "43840",
      "--rpc-forward-port",
      "43842",
      "--threads",
      "8",
    ],
    43224,
    "http://127.0.0.1:43224/health",
    {
      healthSeconds: 600,
      healthKeyFile: join(engine, "engine-api-key.txt"),
      shutdownFile: join(engine, "stop.request"),
    },
  );
  const suffix = process.platform === "win32" ? ".exe" : "";
  await launch(
    "route_root",
    join(root, `target/debug/network-ai-node${suffix}`),
    [],
    43124,
    "http://127.0.0.1:43124/health",
    { configPath: join(directory, "operator-0", "config.json") },
  );
}
export async function restart(name, downtimeMs = 0) {
  if (!["web", "gateway", "node", "control"].includes(name))
    throw new Error("Choose web, gateway, node or control");
  if (!Number.isInteger(downtimeMs) || downtimeMs < 0 || downtimeMs > 10000)
    throw new Error("Invalid bounded restart delay");
  const processes = await readProcesses();
  const entry = processes[name];
  if (!entry)
    throw new Error("Start the private lab before restarting a component");
  if (await owned(entry)) process.kill(entry.pid);
  else if (await listening(entry.port))
    throw new Error("Untracked process owns this component port");
  for (let i = 0; i < 50 && (await listening(entry.port)); i++)
    await delay(100);
  if (downtimeMs) await delay(downtimeMs);
  const c = await config();
  const health =
    name === "web"
      ? c.web_origin
      : `http://127.0.0.1:${entry.port}/${name === "control" ? "api/v1/health" : "health"}`;
  await launch(name, entry.program, entry.args, entry.port, health);
}
export async function status() {
  const processes = await readProcesses();
  const result = {};
  for (const [name, entry] of Object.entries(processes))
    result[name] = {
      running: await owned(entry),
      listening: await listening(entry.port),
      port: entry.port,
    };
  console.log(JSON.stringify(result, null, 2));
}
export async function backup(options = {}) {
  const sourceDatabase = options.sourceDatabase ?? "network_ai";
  if (
    sourceDatabase !== "network_ai" &&
    !/^network_ai_test_[a-f0-9]{32}$/.test(sourceDatabase)
  )
    throw new Error(
      "Backup source must be the lab or an isolated contract test database",
    );
  if (
    options.snapshot !== undefined &&
    (typeof options.snapshot !== "string" ||
      !/^[A-Fa-f0-9-]{1,100}$/.test(options.snapshot))
  )
    throw new Error("Invalid PostgreSQL export snapshot identifier");
  await mkdir(join(runtime, "backups"), { recursive: true });
  const path = join(
    runtime,
    "backups",
    `${new Date().toISOString().replace(/[:.]/g, "-")}.dump`,
  );
  const output = createWriteStream(path, { mode: 0o600, flags: "wx" });
  const saved = finished(output);
  await Promise.all([
    saved,
    new Promise((resolve, reject) => {
      const child = spawn(
        "docker",
        [
          "exec",
          "network-ai-private-lab-postgres",
          "pg_dump",
          "-U",
          "network_ai_owner",
          "-d",
          sourceDatabase,
          "-Fc",
          "--no-owner",
          ...(options.snapshot ? ["--snapshot", options.snapshot] : []),
        ],
        { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
      );
      child.stdout.pipe(output);
      child.stderr.resume();
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error("Backup failed")),
      );
    }),
  ]);
  console.log(`Backup privado: ${path}`);
  return path;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const action = {
    init,
    start,
    stop,
    status,
    backup,
    restart: () => restart(process.argv[3]),
  }[process.argv[2] ?? "status"];
  if (!action) throw new Error("Use init, start, stop, status or backup");
  await action();
}
