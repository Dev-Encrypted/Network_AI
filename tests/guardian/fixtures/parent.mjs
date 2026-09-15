// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startGuardian } from "../../../packages/contributor/src/guardian.mjs";
const [binary, sha256, fixture] = process.argv.slice(2);
try {
  const guard = await startGuardian({ path: binary, sha256 }, fixture);
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL("./leaf.mjs", import.meta.url)),
      fixture,
      "with-grandchild",
    ],
    { windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"] },
  );
  const leaf = await new Promise((resolve, reject) => {
    child.once("message", resolve);
    child.once("error", reject);
  });
  process.send({ guard, leaf });
  process.on("message", (value) => {
    if (value === "exit") {
      child.disconnect();
      child.unref();
      process.disconnect();
    }
  });
} catch (error) {
  process.send({ error: error.code ?? "fixture_failed" });
  process.exit(1);
}
