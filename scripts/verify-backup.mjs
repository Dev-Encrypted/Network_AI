// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Restore into a fresh database inside this project's PostgreSQL; never overwrite the working database.
import { createReadStream } from "node:fs";
import { writeFile, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { config, backup, runtime } from "./lab.mjs";
import { join } from "node:path";
const require = createRequire(
  new URL("../apps/control-api/package.json", import.meta.url),
);
const { Pool } = require("pg");
const c = await config();
const path = await backup();
const name = `network_ai_restore_${randomUUID().replaceAll("-", "")}`;
assert.match(name, /^network_ai_restore_[a-f0-9]{32}$/);
const source = new Pool({ connectionString: c.database_owner_url });
let restored;
try {
  await source.query(`CREATE DATABASE "${name}"`);
  await new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        "exec",
        "-i",
        "network-ai-private-lab-postgres",
        "pg_restore",
        "--exit-on-error",
        "--no-owner",
        "-U",
        "network_ai_owner",
        "-d",
        name,
      ],
      { windowsHide: true, stdio: ["pipe", "ignore", "pipe"] },
    );
    const input = createReadStream(path);
    input.on("error", reject);
    input.pipe(child.stdin);
    child.stderr.resume();
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("Restore failed")),
    );
  });
  const url = new URL(c.database_url);
  url.pathname = `/${name}`;
  restored = new Pool({
    connectionString: url.toString(),
    options: "-c search_path=nai,public",
  });
  const total = await restored.query(
    "SELECT sum(balance)::text AS total FROM ledger_accounts",
  );
  assert.equal(total.rows[0].total, "0");
  const mismatch = await restored.query(
    `SELECT a.id FROM ledger_accounts a LEFT JOIN journal_lines l ON l.account_id=a.id GROUP BY a.id HAVING a.balance<>coalesce(sum(l.amount),0)`,
  );
  assert.equal(mismatch.rowCount, 0);
  const before = await source.query(
    "SELECT count(*)::int AS n FROM nai.journal",
  );
  const after = await restored.query("SELECT count(*)::int AS n FROM journal");
  assert.equal(after.rows[0].n, before.rows[0].n);
  const leases = await restored.query(
    "SELECT count(*)::int AS n FROM availability_leases",
  );
  const sourceLeases = await source.query(
    "SELECT count(*)::int AS n FROM nai.availability_leases",
  );
  assert.equal(leases.rows[0].n, sourceLeases.rows[0].n);
  const escrowMismatch =
    await restored.query(`SELECT l.id FROM availability_leases l JOIN ledger_accounts a ON a.id=l.escrow_account
    WHERE a.balance<>CASE WHEN l.state IN ('ACTIVE','OFFERED') THEN l.budget_microtu-l.paid_microtu ELSE 0 END`);
  assert.equal(escrowMismatch.rowCount, 0);
  await assert.rejects(
    () =>
      restored.query(
        "UPDATE availability_leases SET rate_microtu_per_second=rate_microtu_per_second",
      ),
    { code: "42501" },
  );
  await assert.rejects(
    () =>
      restored.query(
        "UPDATE ledger_accounts SET balance=1 WHERE id='lab:working'",
      ),
    { code: "42501" },
  );
  const report = {
    evidence_type: "ISOLATED_POSTGRES_RESTORE",
    observed_at: new Date().toISOString(),
    journal_entries: after.rows[0].n,
    balance_sum: "0",
    projection_mismatches: 0,
    runtime_balance_write_denied: true,
    availability_contracts: leases.rows[0].n,
    availability_escrow_mismatches: 0,
    runtime_contract_term_write_denied: true,
    backup_sha256: createHash("sha256")
      .update(await readFile(path))
      .digest("hex"),
  };
  await writeFile(
    join(runtime, "backup-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    `Restore verified: ${after.rows[0].n} journals, balanced projection, runtime permissions preserved.`,
  );
} finally {
  if (restored) await restored.end();
  await source.query(`DROP DATABASE IF EXISTS "${name}"`);
  await source.end();
}
