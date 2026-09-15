// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Upgrade/downgrade only the already installed CPU route. No new model or node identities.
import assert from "node:assert/strict";
import { readFile, writeFile, rename, access } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import { config, root, runtime, stopCpu, startCpuRoute } from "./lab.mjs";
import { ensureRpcIdentity, configureRpc } from "./rpc-config.mjs";

const { positionals } = parseArgs({ allowPositionals: true });
assert.ok(
  positionals.length === 1 && ["enable", "disable"].includes(positionals[0]),
  "Use route-rpc-transport.mjs enable|disable",
);
const enable = positionals[0] === "enable";
const path = join(runtime, "cpu-route.json");
const profile = JSON.parse(await readFile(path, "utf8"));
assert.ok(
  profile.route_id && profile.node_ids?.length === 3,
  "Install and qualify the managed CPU route first",
);
if (enable)
  await access(
    join(
      root,
      `target/debug/network-ai-rpc-link${process.platform === "win32" ? ".exe" : ""}`,
    ),
  );
const c = await config();
const { Pool } = createRequire(
  new URL("../apps/control-api/package.json", import.meta.url),
)("pg");
const db = new Pool({
  connectionString: c.database_url,
  options: "-c search_path=nai,public",
});
let cookie = "";
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
    `Private route API rejected ${path}: ${v.error?.code ?? r.status}`,
  );
  if (path === "/auth/login")
    cookie = r.headers.get("set-cookie").split(";")[0];
  return v;
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
    pending.sessions === 0,
    "Finish active sessions before changing transport",
  );
  assert.ok(
    pending.windows === 0,
    "Finish accepted readiness windows before changing transport",
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
  if (enable) {
    for (let i = 1; i <= 2; i++) {
      const folders = Object.fromEntries(
        ["root", "stage"].map((role) => [
          role,
          join(runtime, "cpu-route", "rpc-link", `${role}-${i}`),
        ]),
      );
      const identities = {
        root: await ensureRpcIdentity(folders.root),
        stage: await ensureRpcIdentity(folders.stage),
      };
      const binding = {
        stage_node_id: profile.node_ids[i],
        route_id: route.id,
        route_sha256: route.route_sha256,
        manifest_sha256: route.manifest_sha256,
      };
      for (const role of ["stage", "root"]) {
        const ownUdp = role === "stage" ? 43929 + i : 43931 + i;
        const otherUdp = role === "stage" ? 43931 + i : 43929 + i;
        await configureRpc({
          directory: folders[role],
          role,
          binding,
          peer: identities[role === "root" ? "stage" : "root"],
          peerAddress: `127.0.0.1:${otherUdp}`,
          bind: `127.0.0.1:${ownUdp}`,
          localPort: role === "root" ? 43843 + i : 43841 + i,
        });
      }
    }
  }
  const next = { ...profile };
  if (enable) next.rpc_transport = "iroh-direct-quic-guarded-rpc";
  else delete next.rpc_transport;
  // Persist the explicit choice before starting; a failed start never silently downgrades it.
  await stopCpu();
  const temporary = path + ".transport.tmp";
  await writeFile(temporary, JSON.stringify(next, null, 2) + "\n", {
    mode: 0o600,
    flush: true,
  });
  await rename(temporary, path);
  await startCpuRoute(next);
  let ready = false;
  for (let i = 0; i < 45; i++) {
    ready = (await api("/routes")).data.some(
      (r) => r.id === profile.route_id && r.available,
    );
    if (ready) break;
    await delay(1000);
  }
  assert.ok(
    ready,
    "Route not ready; selected transport retained for diagnosis and explicit recovery",
  );
  console.log(
    `Installed 32B route ready with ${enable ? "pinned QUIC guarded RPC" : "loopback guarded RPC"}. One physical host; WAN qualification remains pending.`,
  );
} finally {
  if (cookie) await api("/auth/logout", "POST", {}).catch(() => {});
  await db.end();
}
