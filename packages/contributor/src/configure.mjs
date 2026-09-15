// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { generateKeyPairSync } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  profileSchema,
  publicId,
  requireValue,
  validateProfile,
} from "./profile.mjs";
import { protectDirectory } from "./permissions.mjs";

async function matchingJson(path, value) {
  try {
    requireValue(
      isDeepStrictEqual(JSON.parse(await readFile(path, "utf8")), value),
      "worker_existing_profile_differs",
    );
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    await writeFile(path, JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
      flush: true,
    });
  }
}
export async function ensureIdentity(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await protectDirectory(directory);
  const file = join(directory, "identity.private.json");
  let local;
  try {
    local = JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    const seed = () =>
      Buffer.from(
        generateKeyPairSync("ed25519").privateKey.export({ format: "jwk" }).d,
        "base64url",
      ).toString("hex");
    local = {
      schema_version: 1,
      control_secret_key: seed(),
      rpc_secret_key: seed(),
    };
    await matchingJson(file, local);
  }
  local = z
    .object({
      schema_version: z.literal(1),
      control_secret_key: z.string().regex(/^[a-f0-9]{64}$/),
      rpc_secret_key: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict()
    .parse(local);
  const publicIdentity = {
    schema_version: 1,
    control: { id: publicId(local.control_secret_key) },
    rpc: { id: publicId(local.rpc_secret_key) },
  };
  requireValue(
    publicIdentity.control.id !== publicIdentity.rpc.id,
    "worker_identity_collision",
  );
  await matchingJson(join(directory, "identity.json"), publicIdentity);
  return publicIdentity;
}
export const settingsSchema = profileSchema
  .omit({ node: true, control: true, rpc: true })
  .extend({
    binaries: profileSchema.shape.binaries.required({ guardian: true }),
    node: profileSchema.shape.node.omit({
      id: true,
      invite: true,
      capability_public_key: true,
    }),
    control: profileSchema.shape.control.omit({ secret_key: true }),
    rpc: profileSchema.shape.rpc.omit({ secret_key: true }),
  })
  .strict();
export async function configureWorker(directory, rawInvite, rawSettings) {
  const invitation = z
    .object({
      id: z.uuid(),
      invite: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      operator: z.object({
        node_kind: z.literal("RPC_STAGE"),
        capability_public_key: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      }),
    })
    .parse(rawInvite);
  const settings = settingsSchema.parse(rawSettings);
  await ensureIdentity(directory);
  const local = JSON.parse(
    await readFile(join(directory, "identity.private.json"), "utf8"),
  );
  const c = validateProfile({
    ...settings,
    node: {
      ...settings.node,
      id: invitation.id,
      invite: invitation.invite,
      capability_public_key: invitation.operator.capability_public_key,
    },
    control: { ...settings.control, secret_key: local.control_secret_key },
    rpc: { ...settings.rpc, secret_key: local.rpc_secret_key },
  });
  await matchingJson(join(directory, "worker.json"), c);
  return {
    path: join(directory, "worker.json"),
    node_id: c.node.id,
    route_id: c.binding.route_id,
  };
}
