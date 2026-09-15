// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Coordinator-side installer for the existing one-host route. The contributor package has no coordinator dependency.
import assert from "node:assert/strict";
import {
  readFile,
  writeFile,
  readdir,
  mkdir,
  copyFile,
  rename,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import {
  config,
  root,
  runtime,
  stopCpu,
  startCpuRoute,
  protectDirectory,
} from "./lab.mjs";
import { ensureRpcIdentity, configureRpc } from "./rpc-config.mjs";
import {
  ensureIdentity,
  configureWorker,
} from "../packages/contributor/src/configure.mjs";
import { hashFile, loadProfile } from "../packages/contributor/src/profile.mjs";
import { upgradeGuardianProfile } from "../packages/contributor/src/upgrade.mjs";
import { atomicJson } from "../packages/contributor/src/state.mjs";

const { positionals } = parseArgs({ allowPositionals: true });
assert.ok(
  positionals.length === 1 &&
    ["enable", "disable", "upgrade"].includes(positionals[0]),
  "Use route-contributors.mjs enable|disable|upgrade",
);
const upgrade = positionals[0] === "upgrade",
  enable = positionals[0] !== "disable",
  profilePath = join(runtime, "cpu-route.json");
const profile = JSON.parse(await readFile(profilePath, "utf8")),
  directory = join(runtime, "cpu-route"),
  portable = join(directory, "portable");
assert.ok(
  profile.route_id &&
    profile.node_ids?.length === 3 &&
    profile.rpc_transport === "iroh-direct-quic-guarded-rpc",
  "First install and qualify the guarded QUIC CPU route",
);
const c = await config(),
  { Pool } = createRequire(
    new URL("../apps/control-api/package.json", import.meta.url),
  )("pg");
const db = new Pool({
  connectionString: c.database_url,
  options: "-c search_path=nai,public",
});
let cookie;
async function api(path, method = "GET", body) {
  const r = await fetch(`http://127.0.0.1:${c.control_port}/api/v1${path}`, {
    method,
    headers: {
      Cookie: cookie ?? "",
      Origin: c.web_origin,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const v = await r.json();
  assert.ok(r.ok, `Private API rejected ${path}: ${v.error?.code ?? r.status}`);
  if (path === "/auth/login")
    cookie = r.headers.get("set-cookie").split(";")[0];
  return v;
}
async function matchingJson(path, value) {
  try {
    assert.ok(
      isDeepStrictEqual(JSON.parse(await readFile(path, "utf8")), value),
      "Existing portable configuration differs; preserve it and use an explicit new profile",
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
try {
  await api("/auth/login", "POST", {
    login: c.admin_login,
    password: c.admin_password,
  });
  const pending = (
    await db.query(`SELECT
    (SELECT count(*) FROM sessions WHERE state IN ('QUEUED','PREPARING','AUTHORIZED','RUNNING','CANCELLING'))::int AS sessions,
    ((SELECT count(*) FROM route_availability_leases WHERE state IN ('OFFERED','ACTIVE','DRAINING'))+
     (SELECT count(*) FROM availability_leases WHERE state IN ('OFFERED','ACTIVE')))::int AS windows`)
  ).rows[0];
  assert.ok(
    pending.sessions === 0 && pending.windows === 0,
    "Finish sessions and accepted windows before changing contributor supervision",
  );
  const route = (await api("/routes")).data.find(
    (r) => r.id === profile.route_id,
  );
  assert.ok(
    route &&
      route.state === "LOCAL_PREVIEW" &&
      route.model_id === profile.model_id,
  );
  assert.deepEqual(
    route.participants.map((p) => p.node_id),
    profile.node_ids,
  );
  if (upgrade)
    assert.equal(
      profile.worker_supervision,
      "portable_contributors",
      "Upgrade requires the existing portable route",
    );
  if (enable) {
    assert.equal(
      process.platform,
      "win32",
      "The installed contributor engine profile is Windows CPU only",
    );
    const bins = join(portable, "bin");
    await mkdir(bins, { recursive: true, mode: 0o700 });
    await protectDirectory(portable);
    const binaries = {};
    // A guardian upgrade retains the installed transport binaries and their
    // original pins. Rebuilding another target is not authority to replace them.
    const installBinaries = upgrade
      ? [["guardian", "network-ai-contributor-guardian.exe"]]
      : [
          ["http", "network-ai-link.exe"],
          ["rpc", "network-ai-rpc-link.exe"],
          ["guardian", "network-ai-contributor-guardian.exe"],
        ];
    for (const [key, name] of installBinaries) {
      const source = join(root, "target/debug", name),
        path = join(bins, name),
        hash = await hashFile(source);
      try {
        assert.equal(
          await hashFile(path),
          hash,
          "Installed contributor binary differs; do not silently repin it",
        );
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
        await copyFile(source, path);
      }
      binaries[key] = { path, sha256: hash };
    }
    if (upgrade) {
      // Both original profiles are checked before stopping. A partial upgrade
      // stays stopped and is resumable; startup never drops guardian protection.
      for (let i = 1; i <= 2; i++) {
        const loaded = await loadProfile(
          join(portable, `operator-${i}`, "worker.json"),
          false,
        );
        assert.equal(loaded.profile.node.id, profile.node_ids[i]);
        assert.equal(loaded.profile.binding.route_id, profile.route_id);
        assert.equal(
          (await readdir(join(loaded.state, "stage", "outbox"))).filter((f) =>
            f.endsWith(".json"),
          ).length,
          0,
          "Deliver pending receipts before upgrade",
        );
      }
      await stopCpu();
      for (let i = 1; i <= 2; i++) {
        const op = join(portable, `operator-${i}`);
        await upgradeGuardianProfile(
          join(op, "worker.json"),
          binaries.guardian,
        );
        const publicSettings = JSON.parse(
          await readFile(join(op, "settings.json"), "utf8"),
        );
        await atomicJson(join(op, "settings.json"), {
          ...publicSettings,
          binaries: { ...publicSettings.binaries, guardian: binaries.guardian },
        });
      }
    }
    if (!upgrade) {
      for (let i = 1; i <= 2; i++) {
        const op = join(portable, `operator-${i}`),
          identities = await ensureIdentity(op);
        const rootControl = join(portable, `root-control-${i}`),
          rootRpc = join(portable, `root-rpc-${i}`);
        const controlIdentity = await ensureRpcIdentity(rootControl),
          rpcIdentity = await ensureRpcIdentity(rootRpc);
        const binding = {
          stage_node_id: profile.node_ids[i],
          route_id: route.id,
          route_sha256: route.route_sha256,
          manifest_sha256: route.manifest_sha256,
        };
        const original = JSON.parse(
          await readFile(
            join(directory, `operator-${i}`, "config.json"),
            "utf8",
          ),
        );
        const invite = {
          id: original.node_id,
          invite: original.node_invite,
          operator: {
            node_kind: "RPC_STAGE",
            capability_public_key: original.capability_public_key,
          },
        };
        const settings = {
          schema_version: 1,
          mode: "private_contributor_cpu",
          node: {
            name: `Portable CPU contributor ${i}`,
            http_port: 43224 + i,
            backend_model: original.backend_model,
          },
          binding,
          ports: {
            worker_rpc: 43839 + i,
            guard_rpc: 43841 + i,
            control_forward: 43140 + i,
          },
          control: {
            peer_id: controlIdentity.id,
            peer_addresses: [`127.0.0.1:${43949 + 2 * i}`],
            bind_addr: `127.0.0.1:${43950 + 2 * i}`,
          },
          rpc: {
            peer_id: rpcIdentity.id,
            peer_addresses: [`127.0.0.1:${43931 + i}`],
            bind_addr: `127.0.0.1:${43929 + i}`,
          },
          engine: {
            id: "llama-b10964-win-x64-cpu",
            directory: resolve(profile.engine_dir),
          },
          binaries,
          threads: 8,
          startup_compute_commands: 4,
        };
        await matchingJson(join(op, "settings.json"), settings); // Public parameters only; never the coordinator's private config.
        await configureWorker(op, invite, settings);
        await loadProfile(join(op, "worker.json"));
        const controlLocal = JSON.parse(
          await readFile(join(rootControl, "identity.private.json"), "utf8"),
        );
        await matchingJson(join(rootControl, "link.json"), {
          schema_version: 1,
          role: "control",
          node_id: original.node_id,
          secret_key: controlLocal.secret_key,
          peer_id: identities.control.id,
          peer_addresses: [settings.control.bind_addr],
          bind_addr: settings.control.peer_addresses[0],
          forward_port: 43124 + i,
          target_port: c.control_port,
        });
        await configureRpc({
          directory: rootRpc,
          role: "root",
          binding,
          peer: { schema_version: 1, id: identities.rpc.id },
          peerAddress: settings.rpc.bind_addr,
          bind: settings.rpc.peer_addresses[0],
          localPort: 43843 + i,
        });
        const oldStage = join(original.state_dir, "stage"),
          newStage = join(op, "state", "stage");
        assert.ok(
          (await readdir(join(oldStage, "outbox"))).filter((n) =>
            n.endsWith(".json"),
          ).length === 0,
          "Deliver old stage receipts before migrating its identity",
        );
        await mkdir(newStage, { recursive: true, mode: 0o700 });
        const source = join(oldStage, "identity.pem"),
          target = join(newStage, "identity.pem");
        try {
          assert.equal(
            await hashFile(target),
            await hashFile(source),
            "Contributor signing identity differs from the existing node",
          );
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
          await copyFile(source, target);
        }
      }
    }
  }
  await stopCpu();
  // Persist the choice before startup. Failure never falls back to local credentials.
  const next = { ...profile };
  if (enable) next.worker_supervision = "portable_contributors";
  else delete next.worker_supervision;
  const temporary = profilePath + ".contributors.tmp";
  await writeFile(temporary, JSON.stringify(next, null, 2) + "\n", {
    mode: 0o600,
    flush: true,
  });
  await rename(temporary, profilePath);
  await startCpuRoute(next);
  let ready = false;
  for (let i = 0; i < 45; i++) {
    if (
      (await api("/routes")).data.some((r) => r.id === route.id && r.available)
    ) {
      ready = true;
      break;
    }
    await delay(1000);
  }
  assert.ok(
    ready,
    "Contributor route is not ready; explicit profile retained for diagnosis",
  );
  console.log(
    `Installed route ready with ${enable ? "portable contributor supervision" : "root-supervised workers"}. Original node identities, one physical host and one resource domain retained.`,
  );
} finally {
  if (cookie) await api("/auth/logout", "POST", {}).catch(() => {});
  await db.end();
}
