// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
} from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, isDeepStrictEqual } from "node:util";
import { isIP } from "node:net";
import { protectDirectory } from "./lab.mjs";
import { validateRpcBinding } from "./rpc-binding.mjs";

async function matchingJson(path, value) {
  try {
    assert.ok(
      isDeepStrictEqual(JSON.parse(await readFile(path, "utf8")), value),
      "Existing RPC identity/configuration differs; use a new private directory",
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeFile(path, JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
      flush: true,
    });
  }
}
function identity(value) {
  assert.equal(value.schema_version, 1);
  assert.match(value.id, /^[a-f0-9]{64}$/);
  assert.ok(
    typeof value.secret_key === "string" &&
      /^[a-f0-9]{64}$/.test(value.secret_key),
    "Invalid private RPC identity",
  );
  const privateKey = createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      Buffer.from(value.secret_key, "hex"),
    ]),
    format: "der",
    type: "pkcs8",
  });
  assert.equal(
    Buffer.from(
      createPublicKey(privateKey).export({ format: "jwk" }).x,
      "base64url",
    ).toString("hex"),
    value.id,
  );
  return value;
}
export async function ensureRpcIdentity(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await protectDirectory(directory);
  const path = join(directory, "identity.private.json");
  let local;
  try {
    local = identity(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    local = {
      schema_version: 1,
      id: Buffer.from(
        publicKey.export({ format: "jwk" }).x,
        "base64url",
      ).toString("hex"),
      secret_key: Buffer.from(
        privateKey.export({ format: "jwk" }).d,
        "base64url",
      ).toString("hex"),
    };
    await matchingJson(path, local);
  }
  const publicIdentity = { schema_version: 1, id: local.id };
  await matchingJson(join(directory, "identity.json"), publicIdentity);
  return publicIdentity;
}
function socket(value, peer = false) {
  const m = /^(\[[^\]]+\]|[^:]+):(\d+)$/.exec(value ?? "");
  assert.ok(m, "Use explicit IP:UDP_PORT or [IPv6]:UDP_PORT");
  const ip = m[1].replace(/^\[|\]$/g, "");
  assert.ok(isIP(ip) && +m[2] >= 1024 && +m[2] <= 65535);
  if (peer)
    assert.ok(
      !["0.0.0.0", "::"].includes(ip),
      "A peer address must be reachable",
    );
  return value;
}
export async function configureRpc({
  directory,
  role,
  binding,
  peer,
  peerAddress,
  bind,
  localPort,
}) {
  validateRpcBinding(binding);
  assert.ok(["root", "stage"].includes(role));
  assert.ok(
    Number.isInteger(localPort) && localPort >= 1024 && localPort <= 65535,
  );
  assert.equal(peer.schema_version, 1);
  assert.match(peer.id, /^[a-f0-9]{64}$/);
  const local = identity(
    JSON.parse(
      await readFile(join(directory, "identity.private.json"), "utf8"),
    ),
  );
  assert.notEqual(local.id, peer.id);
  const config = {
    schema_version: 1,
    role,
    binding,
    secret_key: local.secret_key,
    peer_id: peer.id,
    peer_addresses: [socket(peerAddress, true)],
    bind_addr: socket(bind),
    local_port: localPort,
  };
  await matchingJson(join(directory, "binding.json"), binding);
  await matchingJson(join(directory, "rpc.json"), config);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const { values: a, positionals } = parseArgs({
    allowPositionals: true,
    options: Object.fromEntries(
      [
        "directory",
        "role",
        "binding-file",
        "peer-file",
        "peer-address",
        "bind",
        "local-port",
      ].map((k) => [k, { type: "string" }]),
    ),
  });
  assert.ok(
    a.directory && ["identity", "configure"].includes(positionals[0]),
    "Use identity --directory PATH, or configure --directory PATH --role root|stage --binding-file FILE --peer-file PUBLIC_IDENTITY --peer-address IP:UDP --bind IP:UDP --local-port PORT",
  );
  const directory = resolve(a.directory);
  if (positionals[0] === "identity") await ensureRpcIdentity(directory);
  else
    await configureRpc({
      directory,
      role: a.role,
      binding: JSON.parse(await readFile(resolve(a["binding-file"]), "utf8")),
      peer: JSON.parse(await readFile(resolve(a["peer-file"]), "utf8")),
      peerAddress: a["peer-address"],
      bind: a.bind,
      localPort: Number(a["local-port"]),
    });
  console.log(
    `RPC ${positionals[0]} ready in ${directory}. Exchange only identity.json and binding.json; private files stay on their host.`,
  );
}
