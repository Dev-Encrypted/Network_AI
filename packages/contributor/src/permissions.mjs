// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { chmod } from "node:fs/promises";
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
