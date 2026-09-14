// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import {
  createHash,
  createPublicKey,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  verify,
  sign,
} from "node:crypto";
import { promisify } from "node:util";
import { need } from "./errors.js";
const scrypt = promisify(scryptCallback);
export const hash = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");
export const secret = (): string => randomBytes(32).toString("base64url");
export function same(a: string, b: string): boolean {
  const left = Buffer.from(hash(a), "hex");
  return timingSafeEqual(left, Buffer.from(hash(b), "hex"));
}
export async function passwordHash(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString("base64url")}`;
}
export async function passwordMatches(
  password: string,
  stored: string,
): Promise<boolean> {
  const [kind, salt, expected] = stored.split(":");
  if (kind !== "scrypt" || !salt || !expected) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const comparison = Buffer.from(expected, "base64url");
  return (
    comparison.length === derived.length && timingSafeEqual(derived, comparison)
  );
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}
export function verifyNodeSignature(
  publicKey: string,
  message: string,
  signature: string,
): boolean {
  try {
    const raw = Buffer.from(publicKey, "base64url");
    if (raw.length !== 32) return false;
    const key = createPublicKey({
      key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw]),
      format: "der",
      type: "spki",
    });
    return verify(
      null,
      Buffer.from(message),
      key,
      Buffer.from(signature, "base64url"),
    );
  } catch {
    return false;
  }
}
export function capability(
  privateKey: string,
  payload: Record<string, unknown>,
): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "EdDSA", typ: "NAI-CAP", v: 1 }),
  ).toString("base64url");
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const message = `${header}.${encoded}`;
  return `${message}.${sign(null, Buffer.from(message), privateKey).toString("base64url")}`;
}
export function loopbackNodeUrl(value: string): string {
  const url = new URL(value);
  need(
    url.protocol === "http:" &&
      url.hostname === "127.0.0.1" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/" &&
      Number(url.port) >= 43103 &&
      Number(url.port) <= 43299,
    400,
    "invalid_node_endpoint",
    "O nó deve usar a faixa de portas local autorizada.",
  );
  return url.origin;
}
