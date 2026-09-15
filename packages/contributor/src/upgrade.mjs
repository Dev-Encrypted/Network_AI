// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { readFile, writeFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { isDeepStrictEqual } from "node:util";
import {
  loadProfile,
  validateProfile,
  verifyProfileRuntime,
  requireValue,
} from "./profile.mjs";
import { atomicJson } from "./state.mjs";
import { protectDirectory } from "./permissions.mjs";

function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code !== "ESRCH";
  }
}
function free(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () =>
      server.close(() => resolve(true)),
    );
  });
}
export async function upgradeGuardianProfile(file, binary) {
  const loaded = await loadProfile(file, false);
  try {
    const lock = JSON.parse(
      await readFile(join(loaded.state, "worker.lock"), "utf8"),
    );
    requireValue(!alive(lock.pid), "worker_upgrade_requires_stopped");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  for (const port of [
    loaded.profile.node.http_port,
    ...Object.values(loaded.profile.ports),
  ]) {
    requireValue(await free(port), "worker_upgrade_port_occupied");
  }
  const pending = await readdir(join(loaded.state, "stage", "outbox")).catch(
    (e) => {
      if (e.code === "ENOENT") return [];
      throw e;
    },
  );
  requireValue(
    !pending.some((name) => name.endsWith(".json")),
    "worker_upgrade_pending_receipts",
  );
  const guardian = { path: resolve(binary.path), sha256: binary.sha256 };
  const original = await readFile(loaded.path, "utf8"),
    raw = JSON.parse(original);
  const next = validateProfile({
    ...raw,
    binaries: { ...raw.binaries, guardian: raw.binaries.guardian ?? guardian },
  });
  await verifyProfileRuntime(
    { ...loaded.profile, binaries: { ...loaded.profile.binaries, guardian } },
    loaded.pin,
  );
  requireValue(
    !raw.binaries.guardian ||
      isDeepStrictEqual(loaded.profile.binaries.guardian, guardian),
    "worker_guardian_repin_requires_new_profile",
  );
  if (isDeepStrictEqual(raw, next))
    return { changed: false, path: loaded.path };
  await protectDirectory(loaded.directory);
  // Preserve the complete original private profile, including relative paths and
  // signing/invitation bindings, before changing this one explicit binary entry.
  const backup = `${loaded.path}.before-guardian-${randomUUID()}.json`;
  await writeFile(backup, original, { flag: "wx", mode: 0o600, flush: true });
  requireValue(
    (await readFile(loaded.path, "utf8")) === original,
    "worker_upgrade_profile_changed",
  );
  await atomicJson(loaded.path, next);
  return { changed: true, path: loaded.path, backup };
}
