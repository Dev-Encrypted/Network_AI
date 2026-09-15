// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";
import { z } from "zod";
import { hashFile, requireValue, workerEnvironment } from "./profile.mjs";

const acknowledgement = z
  .object({
    schema_version: z.literal(1),
    kind: z.literal("windows_job"),
    parent_pid: z.number().int().positive(),
    guardian_pid: z.number().int().positive(),
    boot_id: z.uuid(),
    parent_created_100ns: z.string().regex(/^[1-9][0-9]{1,24}$/),
    kill_on_close: z.literal(true),
    breakaway_allowed: z.literal(false),
  })
  .strict();

// Call before launching any compute/transport child. The guardian is deliberately
// outside the new job, and must never be killed as part of graceful child cleanup.
export async function startGuardian(binary, boot) {
  requireValue(process.platform === "win32", "guardian_platform_not_supported");
  requireValue(
    (await hashFile(binary.path)) === binary.sha256,
    "worker_guardian_pin",
  );
  const child = spawn(
    binary.path,
    ["--parent-pid", String(process.pid), "--boot-id", boot],
    {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: workerEnvironment(),
    },
  );
  return new Promise((resolve, reject) => {
    let output = "",
      errorOutput = "",
      settled = false;
    const timer = setTimeout(() => fail("guardian_ack_timeout"), 5000);
    function detach() {
      clearTimeout(timer);
      child.stdout.destroy();
      child.stderr.destroy();
      child.unref();
    }
    function fail(code) {
      if (settled) return;
      settled = true;
      detach();
      // If assignment already succeeded, losing the guardian also terminates
      // this parent. No compute child is allowed to exist before acknowledgement.
      if (child.exitCode === null && child.signalCode === null) child.kill();
      reject(Object.assign(new Error(code), { code }));
    }
    child.once("error", () => fail("guardian_start_failed"));
    child.once("exit", () => {
      let code = "guardian_exited_before_ack";
      try {
        const v = JSON.parse(errorOutput);
        if (/^guardian_[a-z_]{1,55}$/.test(v.error)) code = v.error;
      } catch {}
      fail(code);
    });
    child.stderr.on("data", (chunk) => {
      errorOutput += chunk;
      if (Buffer.byteLength(errorOutput) > 4096) fail("guardian_output_limit");
    });
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (Buffer.byteLength(output) > 4096)
        return fail("guardian_output_limit");
      if (!output.includes("\n")) return;
      try {
        const value = acknowledgement.parse(JSON.parse(output));
        requireValue(
          value.parent_pid === process.pid &&
            value.guardian_pid === child.pid &&
            value.boot_id === boot,
          "guardian_ack_binding",
        );
        settled = true;
        detach();
        resolve(Object.freeze(value));
      } catch {
        fail("guardian_ack_binding");
      }
    });
  });
}
