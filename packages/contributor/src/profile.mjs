// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { createHash, createPrivateKey, createPublicKey } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { isIP } from "node:net";
import { deviceSchema, validateDeviceBinding } from "./devices.mjs";

export function requireValue(value, code) {
  if (!value) throw Object.assign(new Error(code), { code });
}
const hex = z.string().regex(/^[a-f0-9]{64}$/),
  port = z.number().int().min(1024).max(65535);
const address = z.string().refine((value) => {
  const m = /^(\[[^\]]+\]|[^:]+):(\d+)$/.exec(value);
  return (
    m && isIP(m[1].replace(/^\[|\]$/g, "")) && +m[2] >= 1024 && +m[2] <= 65535
  );
});
const peer = z
  .object({
    secret_key: hex,
    peer_id: hex,
    peer_addresses: z.array(address).min(1).max(8),
    bind_addr: address,
  })
  .strict();
const binary = z.object({ path: z.string().min(1), sha256: hex }).strict();
export const profileSchema = z
  .object({
    schema_version: z.literal(1),
    mode: z.enum(["private_contributor_cpu", "private_contributor_device"]),
    device: deviceSchema.optional(),
    node: z
      .object({
        id: z.uuid(),
        name: z.string().min(1).max(100),
        invite: z.string().min(32).max(256),
        capability_public_key: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
        backend_model: z.string().min(1).max(200),
        http_port: port.min(43103).max(43299),
      })
      .strict(),
    binding: z
      .object({
        stage_node_id: z.uuid(),
        route_id: z.uuid(),
        route_sha256: hex,
        manifest_sha256: hex,
      })
      .strict(),
    ports: z
      .object({ worker_rpc: port, guard_rpc: port, control_forward: port })
      .strict(),
    control: peer,
    rpc: peer,
    engine: z
      .object({
        id: z.enum(["llama-b10964-win-x64-cpu", "llama-b10964-win-x64-cuda12"]),
        directory: z.string().min(1),
      })
      .strict(),
    // Legacy profiles remain readable for status and graceful shutdown. Starting
    // a new contributor requires an explicitly pinned guardian; no unsafe fallback.
    binaries: z
      .object({ http: binary, rpc: binary, guardian: binary.optional() })
      .strict(),
    threads: z.number().int().min(1).max(32),
    startup_compute_commands: z.number().int().min(0).max(4),
  })
  .strict();

export function publicId(secret) {
  const key = createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      Buffer.from(secret, "hex"),
    ]),
    format: "der",
    type: "pkcs8",
  });
  return createPublicKey(key)
    .export({ format: "der", type: "spki" })
    .subarray(-32)
    .toString("hex");
}
export function validateProfile(raw) {
  const c = profileSchema.parse(raw);
  validateDeviceBinding(c);
  requireValue(c.node.id === c.binding.stage_node_id, "worker_node_binding");
  requireValue(
    new Set([c.node.http_port, ...Object.values(c.ports)]).size === 4,
    "worker_port_collision",
  );
  requireValue(c.control.bind_addr !== c.rpc.bind_addr, "worker_udp_collision");
  const identities = [
    publicId(c.control.secret_key),
    publicId(c.rpc.secret_key),
    c.control.peer_id,
    c.rpc.peer_id,
  ];
  requireValue(new Set(identities).size === 4, "worker_identity_collision");
  for (const link of [c.control, c.rpc])
    for (const address of link.peer_addresses)
      requireValue(
        !/^(0\.0\.0\.0|\[::\]):/.test(address),
        "worker_peer_address",
      );
  return c;
}
export async function hashFile(file) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
}
export async function verifyPinnedFiles(directory, files) {
  const location = resolve(directory);
  requireValue(
    (await lstat(location)).isDirectory() &&
      !(await lstat(location)).isSymbolicLink(),
    "worker_engine_directory",
  );
  const actual = (await readdir(location)).sort(),
    expected = files.map((f) => f.name).sort();
  requireValue(
    JSON.stringify(actual) === JSON.stringify(expected),
    "worker_engine_file_set",
  );
  for (const f of files) {
    requireValue(
      /^[A-Za-z0-9][A-Za-z0-9_.-]+$/.test(f.name),
      "worker_engine_file_name",
    );
    const path = join(location, f.name),
      info = await lstat(path);
    requireValue(
      info.isFile() &&
        !info.isSymbolicLink() &&
        info.size === f.bytes &&
        (await hashFile(path)) === f.sha256,
      "worker_engine_pin",
    );
  }
}
export async function loadProfile(file, verify = true) {
  const path = resolve(file),
    c = validateProfile(JSON.parse(await readFile(path, "utf8")));
  const directory = dirname(path);
  c.engine.directory = resolve(directory, c.engine.directory);
  for (const b of Object.values(c.binaries))
    b.path = resolve(directory, b.path);
  const pin = await enginePin(c.engine.id);
  if (verify) await verifyProfileRuntime(c, pin);
  return { profile: c, path, directory, state: join(directory, "state"), pin };
}
export async function enginePin(id) {
  const files = {
    "llama-b10964-win-x64-cpu": "./engine-pin.json",
    "llama-b10964-win-x64-cuda12": "./engine-pin.cuda12.json",
  };
  requireValue(Object.hasOwn(files, id), "worker_engine_unknown");
  return JSON.parse(
    await readFile(new URL(files[id], import.meta.url), "utf8"),
  );
}
export async function verifyProfileRuntime(c, pin) {
  requireValue(c.engine.id === pin.id, "worker_engine_pin_identity");
  requireValue(
    process.platform === pin.platform && process.arch === pin.arch,
    "worker_platform_not_qualified",
  );
  requireValue(c.binaries.guardian, "worker_guardian_required");
  await verifyPinnedFiles(c.engine.directory, pin.files);
  for (const b of Object.values(c.binaries)) {
    const info = await lstat(b.path);
    requireValue(
      info.isFile() &&
        !info.isSymbolicLink() &&
        (await hashFile(b.path)) === b.sha256,
      "worker_link_pin",
    );
  }
  requireValue(
    (await realpath(c.binaries.http.path)) !==
      (await realpath(c.binaries.rpc.path)),
    "worker_link_binary_collision",
  );
  const binaryPaths = await Promise.all(
    Object.values(c.binaries).map((b) => realpath(b.path)),
  );
  requireValue(
    new Set(binaryPaths).size === 3,
    "worker_guardian_binary_collision",
  );
}
export function workerEnvironment(source = process.env) {
  const allowed = new Set([
    "path",
    "systemroot",
    "windir",
    "temp",
    "tmp",
    "localappdata",
    "number_of_processors",
    "processor_architecture",
    // NVML needs a Windows installation directory to locate its driver library.
    "programfiles",
    "programw6432",
  ]);
  return {
    ...Object.fromEntries(
      Object.entries(source).filter(([key]) => allowed.has(key.toLowerCase())),
    ),
    GGML_RPC_NO_RDMA: "1",
  };
}
export function componentConfigs(c, state) {
  const stage = {
    mode: "private_lab",
    node_kind: "RPC_STAGE",
    node_id: c.node.id,
    node_name: c.node.name,
    node_invite: c.node.invite,
    node_port: c.node.http_port,
    control_port: c.ports.control_forward,
    capability_public_key: c.node.capability_public_key,
    backend_model: c.node.backend_model,
    readiness_mode: "coordinator_route_lease",
    state_dir: state,
  };
  const control = {
    schema_version: 1,
    role: "node",
    node_id: c.node.id,
    ...c.control,
    forward_port: c.ports.control_forward,
    target_port: c.node.http_port,
  };
  const rpc = {
    schema_version: 1,
    role: "stage",
    binding: c.binding,
    ...c.rpc,
    local_port: c.ports.guard_rpc,
  };
  return { stage, control, rpc };
}
