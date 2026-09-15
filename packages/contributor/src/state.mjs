// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { writeFile, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const sharing = (error) => ["EPERM", "EBUSY", "EACCES"].includes(error.code);
export async function atomicJson(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  let operation = "encode";
  try {
    const body = JSON.stringify(value, null, 2) + "\n";
    operation = "write";
    await writeFile(temporary, body, {
      flag: "wx",
      mode: 0o600,
      flush: true,
    });
    operation = "replace";
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(temporary, file);
        return;
      } catch (error) {
        if (!sharing(error) || attempt >= 9) throw error;
        await delay(25);
      }
    }
  } catch (error) {
    throw Object.assign(error, { atomic_operation: operation });
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT")
        throw Object.assign(error, { atomic_operation: "cleanup" });
    });
  }
}

// A status-viewer sharing lock is distinct from worker or receipt-storage failure.
// Retries and buffers are bounded; stale telemetry cannot authorize work. A
// viewer holding the old status must not terminate otherwise healthy paid work.
export class StatusPublisher {
  constructor(
    file,
    {
      write = atomicJson,
      diagnostic = (value) => console.error(JSON.stringify(value)),
    } = {},
  ) {
    this.file = file;
    this.write = write;
    this.diagnostic = diagnostic;
    this.degraded = false;
  }
  async publish(value) {
    try {
      await this.write(this.file, value);
      if (this.degraded) this.diagnostic({ event: "worker_status_recovered" });
      this.degraded = false;
      return true;
    } catch (error) {
      const code = /^[A-Z_]{1,40}$/.test(error.code ?? "")
        ? error.code
        : "IO_ERROR";
      const operation = ["encode", "write", "replace", "cleanup"].includes(
        error.atomic_operation,
      )
        ? error.atomic_operation
        : "unknown";
      if (!this.degraded) {
        this.degraded = true;
        this.diagnostic({ event: "worker_status_degraded", code, operation });
      }
      if (sharing(error) && operation === "replace") return false;
      throw Object.assign(new Error("worker_status_unavailable"), {
        code: "worker_status_unavailable",
        io_code: code,
        atomic_operation: operation,
      });
    }
  }
}
