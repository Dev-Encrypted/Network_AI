// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { MAX_AMOUNT } from "@network-ai/contracts";
import { need } from "./errors.js";

export const availableAccount = (user: string): string =>
  `user:${user}:available`;
export const heldAccount = (user: string): string => `user:${user}:held`;
export async function createAccounts(
  tx: PoolClient,
  user: string,
): Promise<void> {
  await tx.query(
    "INSERT INTO ledger_accounts(id,owner_id,kind) VALUES ($1,$3,'AVAILABLE'),($2,$3,'HELD') ON CONFLICT DO NOTHING",
    [availableAccount(user), heldAccount(user), user],
  );
}
export async function post(
  tx: PoolClient,
  key: string,
  kind: string,
  entries: Array<[string, bigint]>,
  metadata: Record<string, unknown> = {},
): Promise<string> {
  const existing = await tx.query<{ id: string }>(
    "SELECT id FROM journal WHERE business_key=$1",
    [key],
  );
  if (existing.rowCount) return existing.rows[0]!.id;
  const combined = new Map<string, bigint>();
  for (const [account, value] of entries)
    combined.set(account, (combined.get(account) ?? 0n) + value);
  const lines = [...combined.entries()]
    .filter(([, value]) => value !== 0n)
    .sort(([a], [b]) => a.localeCompare(b));
  need(
    lines.length >= 2 &&
      lines.reduce((sum, [, value]) => sum + value, 0n) === 0n,
    500,
    "ledger_invalid",
    "Lançamento inválido.",
  );
  need(
    lines.every(([, value]) => value <= MAX_AMOUNT && value >= -MAX_AMOUNT),
    400,
    "amount_overflow",
    "Valor fora do limite.",
  );
  await tx.query("SELECT nai.lock_ledger_accounts($1::text[])", [
    lines.map(([account]) => account),
  ]);
  for (const [account, value] of lines) {
    const result = await tx.query<{ balance: string; kind: string }>(
      "SELECT balance,kind FROM ledger_accounts WHERE id=$1",
      [account],
    );
    need(
      result.rowCount === 1,
      500,
      "ledger_account_missing",
      "Conta contábil não encontrada.",
    );
    need(
      result.rows[0]!.kind === "LAB_ISSUER" ||
        BigInt(result.rows[0]!.balance) + value >= 0n,
      402,
      "insufficient_credits",
      "Saldo de laboratório insuficiente para reservar esta sessão.",
    );
  }
  const id = randomUUID();
  await tx.query(
    "INSERT INTO journal(id,business_key,kind,metadata) VALUES ($1,$2,$3,$4)",
    [id, key, kind, metadata],
  );
  for (const [account, value] of lines)
    await tx.query(
      "INSERT INTO journal_lines(journal_id,account_id,amount) VALUES ($1,$2,$3)",
      [id, account, value.toString()],
    );
  return id;
}
