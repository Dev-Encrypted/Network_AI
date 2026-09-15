// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
const [file, mode] = process.argv.slice(2);
const server = createServer((socket) => {
  socket.on("error", () => {});
  socket.end("owned service fixture\n");
});
await new Promise((res) => server.listen(0, "127.0.0.1", res));
let descendant = null;
if (mode === "tree") {
  const child = spawn(
    process.execPath,
    [process.argv[1], file + ".leaf", "leaf"],
    { windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"] },
  );
  descendant = await new Promise((res, rej) => {
    child.once("message", res);
    child.once("error", rej);
  });
}
const info = { pid: process.pid, port: server.address().port, descendant };
await writeFile(file, JSON.stringify(info));
process.send?.(info);
setInterval(() => {
  void readFile(file + ".exit")
    .then(() => process.exit(0))
    .catch(() => {});
}, 100);
process.on("disconnect", () => {});
