// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { z } from "zod";

const schema = z.object({
  mode: z.literal("private_lab"),
  database_url: z.string().url(),
  database_owner_url: z.string().url(),
  control_port: z.number().int().min(1024).max(65535),
  gateway_port: z.number().int().min(1024).max(65535),
  web_origin: z.string().url(),
  gateway_secret: z.string().min(40),
  capability_private_key_pem: z.string().min(40),
  capability_public_key: z.string().min(40),
  cookie_name: z.literal("nai_session"),
  postgres_password: z.string().min(20),
  runtime_password: z.string().min(20),
  admin_login: z.string().min(3),
  admin_password: z.string().min(20),
});
export type Config = z.infer<typeof schema>;
export function readConfig(path = process.env.NETWORK_AI_CONFIG): Config {
  if (!path)
    throw new Error(
      "NETWORK_AI_CONFIG must reference the private configuration file",
    );
  const config = schema.parse(JSON.parse(readFileSync(path, "utf8")));
  if (!["127.0.0.1", "localhost"].includes(new URL(config.web_origin).hostname))
    throw new Error("This profile only accepts loopback UI origins");
  if (
    !["127.0.0.1", "localhost"].includes(new URL(config.database_url).hostname)
  )
    throw new Error("This profile expects its dedicated local database");
  return config;
}
