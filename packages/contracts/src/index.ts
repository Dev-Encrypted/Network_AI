// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

export const PROTOCOL = "network-ai.private.v1";
export const LAB_NETWORK = "network-ai-private-lab";
export const LAB_UNIT = "LAB_TU";
export const MICROTU = 1_000_000n;
export const MAX_AMOUNT = 9_223_372_036_854_775_807n;
export const uuid = z.uuid();
export const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
export const amount = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,18})$/)
  .refine((value) => BigInt(value) <= MAX_AMOUNT);
export const label = z.string().trim().min(1).max(100);
export const terminalStates = [
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "INTERRUPTED",
] as const;
export const sessionState = z.enum([
  "QUEUED",
  "PREPARING",
  "AUTHORIZED",
  "RUNNING",
  "CANCELLING",
  ...terminalStates,
]);

export const executionProfileSchema = z
  .object({
    schema_version: z.literal(1),
    adapter: z.literal("llama-b10964-rpc"),
    engine_commit: z.literal("b29c606e28a01b1bc8c1351026a0fa6e616bf6c4"),
    transport: z.literal("iroh-direct-quic-guarded-rpc"),
    split_mode: z.literal("layer"),
    context_tokens: z.number().int().min(512).max(131072),
    batch_tokens: z.number().int().min(1).max(2048),
    slots: z.literal(1),
    stages: z
      .array(
        z
          .object({
            device: z.enum(["CPU", "CUDA"]),
            tensor_weight: z.number().int().min(1).max(10000),
            buffer_budget_mib: z.number().int().min(256).max(1048576),
            reserve_mib: z.number().int().min(256).max(1048576),
            threads: z.number().int().min(1).max(32),
          })
          .strict(),
      )
      .min(1)
      .max(15),
  })
  .strict();

export const generationProfileSchema = z
  .object({
    schema_version: z.literal(1),
    adapter: z.literal("llama_cpp_b10964_jinja"),
    chat_template_sha256: sha256,
    thinking: z.enum(["template_default", "disabled"]),
  })
  .strict();
export type GenerationProfile = z.infer<typeof generationProfileSchema>;

export const modelManifestSchema = z
  .object({
    schema_version: z.literal(1),
    model_id: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,79}$/),
    display_name: label,
    backend_model: z.string().min(1).max(200),
    revision: z.string().min(1).max(128),
    artifact_sha256: sha256,
    license_id: z.string().min(1).max(100),
    source_url: z
      .url()
      .max(500)
      .refine((value) => new URL(value).protocol === "https:"),
    modality: z.literal("text"),
    max_context_tokens: z.number().int().min(256).max(131072),
    max_output_tokens: z.number().int().min(1).max(8192),
    max_input_bytes: z.number().int().min(128).max(65536),
    input_rate_microtu: amount,
    output_rate_microtu: amount,
    rate_denominator: z.number().int().min(1).max(1_000_000),
    description: z.string().max(1000),
    trust_policy: z.literal("private_lab"),
    execution_profile: executionProfileSchema.optional(),
    generation_profile: generationProfileSchema.optional(),
  })
  .strict()
  .refine(
    (value) => value.max_output_tokens < value.max_context_tokens,
    "Output must leave input capacity",
  )
  .refine(
    (value) =>
      !value.execution_profile ||
      value.execution_profile.context_tokens === value.max_context_tokens,
    "Execution profile context must match the quoted context",
  );
export type ModelManifest = z.infer<typeof modelManifestSchema>;

export const chatSchema = z
  .object({
    model: z.string().min(1).max(80),
    messages: z
      .array(
        z
          .object({
            role: z.enum(["system", "user", "assistant"]),
            content: z.string().max(65536),
          })
          .strict(),
      )
      .min(1)
      .max(64),
    stream: z.boolean().default(false),
    max_tokens: z.number().int().positive().max(8192).default(256),
    temperature: z.number().min(0).max(2).default(0.7),
    top_p: z.number().min(0.01).max(1).optional(),
    stop: z
      .union([z.string().max(100), z.array(z.string().max(100)).max(4)])
      .optional(),
    n: z.literal(1).optional(),
    stream_options: z
      .object({ include_usage: z.boolean() })
      .strict()
      .optional(),
  })
  .strict();
export type ChatRequest = z.infer<typeof chatSchema>;

export const quoteSchema = z
  .object({
    cooperative_pool_id: uuid.optional(),
    model: z.string().min(1).max(80),
    max_output_tokens: z.number().int().min(1).max(8192),
  })
  .strict();
export const loginSchema = z
  .object({
    login: z.string().min(1).max(100),
    password: z.string().min(1).max(256),
  })
  .strict();
export const createUserSchema = z
  .object({
    login: z.string().regex(/^[a-zA-Z0-9_.@-]{3,100}$/),
    name: label,
    password: z.string().min(12).max(256),
    role: z.enum(["admin", "member"]).default("member"),
  })
  .strict();
export const registerNodeSchema = z
  .object({
    invite: z.string().min(32).max(256),
    name: label,
    public_key: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    nonce: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/),
    timestamp: z.number().int(),
    signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
    boot_id: uuid,
  })
  .strict();
export const heartbeatSchema = z
  .object({
    boot_id: uuid,
    epoch: z.number().int().positive(),
    state: z.enum(["VALIDATING", "READY", "PAUSED", "DRAINING", "FAULTED"]),
    loaded_backend_models: z.array(z.string().max(200)).max(32),
    running_sessions: z.array(uuid).max(32),
    inventory: z
      .object({
        os: z.string().max(100),
        gpu_name: z.string().max(200).nullable(),
        memory_total_mib: z.number().int().nonnegative().nullable(),
        memory_free_mib: z.number().int().nonnegative().nullable(),
        physical_domain_hint: z.string().max(100),
        generation_profile: generationProfileSchema.optional(),
      })
      .strict(),
  })
  .strict();
export const receiptSchema = z
  .object({
    session_id: uuid,
    attempt_id: uuid,
    epoch: z.number().int().positive(),
    state: z.enum(terminalStates),
    prompt_tokens: z.number().int().nonnegative().max(1_000_000),
    completion_tokens: z.number().int().nonnegative().max(100_000),
    output_sha256: sha256,
    stream_done: z.boolean(),
    finish_reason: z.string().max(40).nullable(),
    error_code: z
      .string()
      .regex(/^[a-z0-9_]{1,60}$/)
      .nullable(),
    elapsed_ms: z.number().int().nonnegative().max(3_600_000),
    metering_source: z.literal("engine_reported"),
  })
  .strict();

// An RPC stage observes compute traffic; it does not claim to count text tokens
// or independently prove that the engine computed the declared model correctly.
export const stageReceiptSchema = z
  .object({
    session_id: uuid,
    attempt_id: uuid,
    epoch: z.number().int().positive(),
    route_sha256: sha256,
    state: z.enum(terminalStates),
    completed_commands: z.number().int().min(0).max(1_000_000),
    request_bytes: amount,
    response_bytes: amount,
    transcript_sha256: sha256,
    elapsed_ms: z.number().int().min(0).max(3_600_000),
    metering_source: z.literal("rpc_observed"),
    error_code: z
      .string()
      .regex(/^[a-z0-9_]{1,60}$/)
      .nullable(),
  })
  .strict();

/** Partition an existing pool exactly, with immutable ordinal prefix rounding. */
export function splitByBps(total: bigint, shares: number[]): bigint[] {
  if (
    total < 0n ||
    total > MAX_AMOUNT ||
    shares.length < 1 ||
    shares.length > 16 ||
    shares.some((n) => !Number.isInteger(n) || n < 1 || n > 10000) ||
    shares.reduce((a, b) => a + b, 0) !== 10000
  )
    throw new RangeError("Invalid payout shares");
  let cumulative = 0n,
    previous = 0n;
  return shares.map((share) => {
    cumulative += BigInt(share);
    const boundary = (total * cumulative) / 10000n;
    const value = boundary - previous;
    previous = boundary;
    return value;
  });
}

export function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n)
    throw new RangeError("Invalid unsigned division");
  return (numerator + denominator - 1n) / denominator;
}
export function chargeFor(
  model: ModelManifest,
  input: number,
  output: number,
): bigint {
  const value = ceilDiv(
    BigInt(input) * BigInt(model.input_rate_microtu) +
      BigInt(output) * BigInt(model.output_rate_microtu),
    BigInt(model.rate_denominator),
  );
  if (value > MAX_AMOUNT) throw new RangeError("Amount overflow");
  return value;
}
export function quoteMaximum(model: ModelManifest, output: number): bigint {
  return chargeFor(model, model.max_context_tokens - output, output);
}
export function formatTU(value: string | bigint): string {
  const number = BigInt(value);
  const absolute = number < 0n ? -number : number;
  const fraction = (absolute % MICROTU)
    .toString()
    .padStart(6, "0")
    .replace(/0{1,3}$/, "");
  return `${number < 0n ? "-" : ""}${absolute / MICROTU},${fraction}`;
}
