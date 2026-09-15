// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Generate an operator profile without copying database passwords, admin credentials or signing authority.
import { config, runtime, protectDirectory } from "./lab.mjs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { generationProfileSchema } from "../packages/contracts/dist/index.js";
const { z } = createRequire(
  new URL("../apps/control-api/package.json", import.meta.url),
)("zod");
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, value, index, all) =>
        index % 2 === 0 ? [...pairs, [value, all[index + 1]]] : pairs,
      [],
    ),
);
if (!args["--invite-file"] || !args["--backend-model"] || !args["--port"])
  throw new Error(
    "Use --invite-file PATH --backend-model MODEL --port 43104 [--backend-url http://127.0.0.1:1235] [--backend-kind lmstudio|openai] [--generation-profile-file PATH]",
  );
const invitation = z
  .object({
    id: z.uuid(),
    invite: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    operator: z
      .object({
        schema_version: z.literal(1),
        node_kind: z
          .enum(["INFERENCE", "ROUTE_ROOT", "RPC_STAGE"])
          .default("INFERENCE"),
        capability_public_key: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
        control_port: z.number().int().min(1024).max(65535),
        gateway_port: z.number().int().min(1024).max(65535),
        web_origin: z.url(),
      })
      .strict()
      .optional(),
  })
  .parse(JSON.parse(await readFile(resolve(args["--invite-file"]), "utf8")));
const port = z.coerce
  .number()
  .int()
  .min(43103)
  .max(43299)
  .parse(args["--port"]);
const backend = z.url().parse(args["--backend-url"] ?? "http://127.0.0.1:1235");
const url = new URL(backend);
if (
  url.origin !== backend ||
  url.hostname !== "127.0.0.1" ||
  url.protocol !== "http:"
)
  throw new Error("Use a plain loopback backend origin");
const kind = z
  .enum(["lmstudio", "openai"])
  .parse(args["--backend-kind"] ?? "lmstudio");
const generation = args["--generation-profile-file"]
  ? generationProfileSchema.parse(
      JSON.parse(
        await readFile(resolve(args["--generation-profile-file"]), "utf8"),
      ),
    )
  : undefined;
if (generation && kind !== "openai")
  throw new Error(
    "An explicit generation profile requires --backend-kind openai",
  );
// New invitations are portable. Legacy invitations still work in the coordinator checkout.
const c = invitation.operator ?? (await config());
const directory = args["--directory"]
  ? resolve(args["--directory"])
  : join(runtime, "operators", invitation.id);
await mkdir(directory, { recursive: true, mode: 0o700 });
await protectDirectory(directory);
const value = {
  mode: "private_lab",
  control_port: args["--control-port"]
    ? z.coerce.number().int().min(1024).max(65535).parse(args["--control-port"])
    : c.control_port,
  gateway_port: c.gateway_port,
  capability_public_key: c.capability_public_key,
  node_id: invitation.id,
  node_kind: c.node_kind ?? "INFERENCE",
  node_invite: invitation.invite,
  node_name: "Operador convidado",
  node_port: port,
  backend_url: backend,
  backend_api_key: args["--backend-key-file"]
    ? (await readFile(resolve(args["--backend-key-file"]), "utf8")).trim()
    : "",
  backend_model: args["--backend-model"],
  backend_kind: kind,
  ...(generation ? { generation_profile: generation } : {}),
  state_dir: directory,
  web_origin: c.web_origin,
};
const path = join(directory, "config.json");
await writeFile(path, JSON.stringify(value, null, 2) + "\n", {
  flag: "wx",
  mode: 0o600,
});
console.log(
  `Perfil privado do operador: ${path}\nDefina NETWORK_AI_CONFIG para este arquivo e execute network-ai-node. O endereço e o modelo devem coincidir com o convite.`,
);
