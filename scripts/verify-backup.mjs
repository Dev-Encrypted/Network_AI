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
const name = `network_ai_restore_${randomUUID().replaceAll("-", "")}`;
assert.match(name, /^network_ai_restore_[a-f0-9]{32}$/);
const source = new Pool({ connectionString: c.database_owner_url });
const snapshotClient = await source.connect();
let restored;
try {
  // Compare the restored dump to the same exported snapshot, even while the
  // live coordinator settles sessions or readiness intervals during pg_dump.
  await snapshotClient.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const snapshot = (
    await snapshotClient.query("SELECT pg_export_snapshot() AS id")
  ).rows[0].id;
  const path = await backup({ snapshot });
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
  const before = await snapshotClient.query(
    "SELECT count(*)::int AS n FROM nai.journal",
  );
  const after = await restored.query("SELECT count(*)::int AS n FROM journal");
  assert.equal(after.rows[0].n, before.rows[0].n);
  const leases = await restored.query(
    "SELECT count(*)::int AS n FROM availability_leases",
  );
  const sourceLeases = await snapshotClient.query(
    "SELECT count(*)::int AS n FROM nai.availability_leases",
  );
  assert.equal(leases.rows[0].n, sourceLeases.rows[0].n);
  const escrowMismatch =
    await restored.query(`SELECT l.id FROM availability_leases l JOIN ledger_accounts a ON a.id=l.escrow_account
    WHERE a.balance<>CASE WHEN l.state IN ('ACTIVE','OFFERED') THEN l.budget_microtu-l.paid_microtu ELSE 0 END`);
  assert.equal(escrowMismatch.rowCount, 0);
  const routeTables = [
    "execution_routes",
    "route_members",
    "route_acceptances",
    "session_domains",
    "session_participants",
    "stage_receipts",
    "route_availability_leases",
    "route_availability_members",
    "route_availability_acceptances",
    "route_availability_events",
    "availability_domain_claims",
  ];
  const routeCounts = {};
  for (const table of routeTables) {
    // Table identifiers come exclusively from this fixed allowlist.
    const beforeRoute = await snapshotClient.query(
      `SELECT count(*)::int AS n FROM nai.${table}`,
    );
    const afterRoute = await restored.query(
      `SELECT count(*)::int AS n FROM ${table}`,
    );
    assert.equal(afterRoute.rows[0].n, beforeRoute.rows[0].n);
    routeCounts[table] = afterRoute.rows[0].n;
  }
  const routeProjection =
    await restored.query(`SELECT s.id FROM sessions s JOIN session_participants p ON p.session_id=s.id
    WHERE s.route_id IS NOT NULL GROUP BY s.id HAVING sum(p.paid_microtu) <>
    CASE WHEN s.billing_state='SETTLED' THEN s.charged_microtu-floor(s.charged_microtu::numeric*2000/10000) ELSE 0 END`);
  assert.equal(routeProjection.rowCount, 0);
  const coverageEscrow =
    await restored.query(`SELECT l.id FROM route_availability_leases l JOIN ledger_accounts a ON a.id=l.escrow_account
    WHERE a.balance<>CASE WHEN l.state IN ('OFFERED','ACTIVE','DRAINING') THEN l.budget_microtu-l.paid_microtu ELSE 0 END`);
  assert.equal(coverageEscrow.rowCount, 0);
  const coverageProjection =
    await restored.query(`SELECT l.id FROM route_availability_leases l JOIN route_availability_members p ON p.lease_id=l.id
    GROUP BY l.id HAVING sum(p.maximum_microtu)<>l.budget_microtu OR sum(p.paid_microtu)<>l.paid_microtu`);
  assert.equal(coverageProjection.rowCount, 0);
  const coverageClaims =
    await restored.query(`SELECT c.resource_domain_id FROM availability_domain_claims c
    LEFT JOIN route_availability_leases r ON r.id=c.route_lease_id LEFT JOIN availability_leases n ON n.id=c.node_lease_id
    WHERE (c.route_lease_id IS NOT NULL AND r.state NOT IN ('ACTIVE','DRAINING')) OR (c.node_lease_id IS NOT NULL AND n.state<>'ACTIVE')`);
  assert.equal(coverageClaims.rowCount, 0);
  const missingClaims = await restored.query(`WITH expected AS (
      SELECT resource_domain_id,id AS node_lease_id,NULL::uuid AS route_lease_id FROM availability_leases WHERE state='ACTIVE'
      UNION SELECT DISTINCT p.resource_domain_id,NULL::uuid,l.id FROM route_availability_leases l
        JOIN route_availability_members p ON p.lease_id=l.id WHERE l.state IN ('ACTIVE','DRAINING'))
    SELECT * FROM ((SELECT * FROM expected EXCEPT SELECT * FROM availability_domain_claims)
      UNION ALL (SELECT * FROM availability_domain_claims EXCEPT SELECT * FROM expected)) mismatches`);
  assert.equal(missingClaims.rowCount, 0);
  await assert.rejects(
    () => restored.query("UPDATE route_availability_leases SET terms=terms"),
    { code: "42501" },
  );
  await assert.rejects(
    () =>
      restored.query(
        "UPDATE route_availability_members SET maximum_microtu=maximum_microtu",
      ),
    { code: "42501" },
  );
  await assert.rejects(
    () => restored.query("DELETE FROM route_availability_acceptances"),
    { code: "42501" },
  );
  await assert.rejects(
    () => restored.query("DELETE FROM availability_domain_claims"),
    { code: "42501" },
  );
  await assert.rejects(
    () => restored.query("UPDATE execution_routes SET terms=terms"),
    { code: "42501" },
  );
  await assert.rejects(
    () => restored.query("UPDATE session_participants SET share_bps=share_bps"),
    { code: "42501" },
  );
  await assert.rejects(() => restored.query("DELETE FROM stage_receipts"), {
    code: "42501",
  });
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
    source_comparison: "same exported PostgreSQL snapshot as pg_dump",
    observed_at: new Date().toISOString(),
    journal_entries: after.rows[0].n,
    balance_sum: "0",
    projection_mismatches: 0,
    runtime_balance_write_denied: true,
    availability_contracts: leases.rows[0].n,
    availability_escrow_mismatches: 0,
    runtime_contract_term_write_denied: true,
    route_tables: routeCounts,
    route_payout_mismatches: 0,
    runtime_route_term_and_receipt_writes_denied: true,
    complete_route_readiness_escrow_mismatches: 0,
    complete_route_readiness_payout_mismatches: 0,
    inactive_readiness_domain_claims: 0,
    missing_or_extra_readiness_domain_claims: 0,
    runtime_readiness_term_consent_and_claim_writes_denied: true,
    backup_sha256: createHash("sha256")
      .update(await readFile(path))
      .digest("hex"),
    live_journals_created_since_snapshot:
      (await source.query("SELECT count(*)::int AS n FROM nai.journal")).rows[0]
        .n - before.rows[0].n,
    active_complete_route_windows: (
      await restored.query(
        "SELECT count(*)::int AS n FROM route_availability_leases WHERE state IN ('ACTIVE','DRAINING')",
      )
    ).rows[0].n,
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
  await snapshotClient.query("ROLLBACK").catch(() => {});
  snapshotClient.release();
  await source.query(`DROP DATABASE IF EXISTS "${name}"`);
  await source.end();
}
