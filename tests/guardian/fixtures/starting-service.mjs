// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Hold the metadata stage deterministically, inside the real Windows job.
// This is an injected startup barrier, not a measurement of CIM startup time.
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { runService } from "../../../scripts/service-host.mjs";
const [profile, boot, marker] = process.argv.slice(2);
const code = await runService(profile, boot, {
  prepareQueries: async () => {
    const helper = spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      { windowsHide: true, stdio: "ignore" },
    );
    await new Promise((resolve, reject) => {
      helper.once("spawn", resolve);
      helper.once("error", reject);
    });
    await writeFile(marker, JSON.stringify({ helper_pid: helper.pid }));
    await new Promise(() => {});
  },
});
process.exit(code);
