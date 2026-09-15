// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { createServer } from "node:net";
import { spawn } from "node:child_process";
const [fixture, mode] = process.argv.slice(2);
const server = createServer((socket) => socket.end("fixture\n"));
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let grandchild = null;
if (mode === "with-grandchild") {
  const child = spawn(process.execPath, [process.argv[1], fixture, "leaf"], {
    windowsHide: true,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  grandchild = await new Promise((resolve, reject) => {
    child.once("message", resolve);
    child.once("error", reject);
  });
}
process.send({ pid: process.pid, port: server.address().port, grandchild });
// Deliberately no parent-death cleanup: the OS job must enforce containment.
process.on("disconnect", () => {});
