// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Each participant creates its own private key; only identity.json is exchanged.
import { generateKeyPairSync } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { resolve, join } from "node:path";
import { isIP } from "node:net";
import { protectDirectory } from "./lab.mjs";

const { values: a, positionals } = parseArgs({
  allowPositionals: true,
  options: Object.fromEntries(
    [
      "directory",
      "role",
      "node-id",
      "peer-file",
      "peer-address",
      "bind",
      "forward-port",
      "target-port",
    ].map((k) => [k, { type: "string" }]),
  ),
});
if (!a.directory || !["identity", "configure"].includes(positionals[0]))
  throw new Error(
    "Use identity --directory PATH, then configure --directory PATH --role control|node --node-id UUID --peer-file PATH --peer-address IP:UDP_PORT --bind IP:UDP_PORT --forward-port PORT --target-port PORT",
  );
const directory = resolve(a.directory);
await mkdir(directory, { recursive: true, mode: 0o700 });
await protectDirectory(directory);
if (positionals[0] === "identity") {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const identity = {
    schema_version: 1,
    id: Buffer.from(
      publicKey.export({ format: "jwk" }).x,
      "base64url",
    ).toString("hex"),
  };
  await writeFile(
    join(directory, "identity.private.json"),
    JSON.stringify({
      ...identity,
      secret_key: Buffer.from(
        privateKey.export({ format: "jwk" }).d,
        "base64url",
      ).toString("hex"),
    }) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  await writeFile(
    join(directory, "identity.json"),
    JSON.stringify(identity, null, 2) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    `Public identity: ${join(directory, "identity.json")}\nExchange only this public file; keep identity.private.json on this host.`,
  );
} else {
  const local = JSON.parse(
    await readFile(join(directory, "identity.private.json"), "utf8"),
  );
  const peer = JSON.parse(await readFile(resolve(a["peer-file"]), "utf8"));
  if (
    !["control", "node"].includes(a.role) ||
    !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(a["node-id"] ?? "")
  )
    throw new Error("Invalid role or node UUID");
  if (
    local.schema_version !== 1 ||
    peer.schema_version !== 1 ||
    !/^[a-f0-9]{64}$/.test(local.secret_key) ||
    !/^[a-f0-9]{64}$/.test(peer.id) ||
    local.id === peer.id
  )
    throw new Error("Invalid identities");
  for (const key of ["peer-address", "bind"]) {
    const match = /^(\[[^\]]+\]|[^:]+):(\d+)$/.exec(a[key] ?? "");
    if (
      !match ||
      !isIP(match[1].replace(/^\[|\]$/g, "")) ||
      +match[2] < 1024 ||
      +match[2] > 65535
    )
      throw new Error("Use an explicit IP and UDP port (1024..65535)");
  }
  const ports = [a["forward-port"], a["target-port"]].map(Number);
  if (
    ports.some((p) => !Number.isInteger(p) || p < 1024 || p > 65535) ||
    ports[0] === ports[1]
  )
    throw new Error("Invalid local ports");
  const value = {
    schema_version: 1,
    role: a.role,
    node_id: a["node-id"],
    secret_key: local.secret_key,
    peer_id: peer.id,
    peer_addresses: [a["peer-address"]],
    bind_addr: a.bind,
    forward_port: ports[0],
    target_port: ports[1],
  };
  const path = join(directory, "link.json");
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  console.log(
    `Private link profile: ${path}\nSet NETWORK_AI_LINK_CONFIG to this file and run network-ai-link.`,
  );
}
