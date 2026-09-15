// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import {
  launchService,
  ensureServiceGuardian,
} from "../../../scripts/service-manager.mjs";
import { withProcessLock } from "../../../scripts/service-process.mjs";
const [root, runtime, mode] = process.argv.slice(2);
if (mode === "mutex") {
  const guardian = await ensureServiceGuardian(root, runtime);
  await withProcessLock(
    join(runtime, "processes.lock"),
    async () => {
      await writeFile(
        join(runtime, "mutex-acquired.json"),
        JSON.stringify({ pid: process.pid }),
      );
      process.exit(0);
    },
    guardian,
  );
} else {
  await launchService(
    root,
    runtime,
    "interrupted",
    process.execPath,
    [
      join(root, "tests/guardian/fixtures/service-tree.mjs"),
      join(runtime, "interrupted.tree.json"),
      "tree",
    ],
    0,
    {},
    {},
    { spawned: () => process.exit(0) },
  );
}
