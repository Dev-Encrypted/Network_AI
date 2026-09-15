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
const args = process.argv.slice(2);
const fixtureDatabase =
  args.length === 2 && args[0] === "--source-test-database" ? args[1] : null;
assert.ok(
  !args.length ||
    (fixtureDatabase && /^network_ai_test_[a-f0-9]{32}$/.test(fixtureDatabase)),
  "Only a named isolated contract database may override the lab source",
);
if (fixtureDatabase)
  for (const key of ["database_owner_url", "database_url"]) {
    const url = new URL(c[key]);
    url.pathname = `/${fixtureDatabase}`;
    c[key] = url.toString();
  }
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
  const path = await backup({
    snapshot,
    sourceDatabase: fixtureDatabase ?? "network_ai",
  });
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
    "cooperative_pools",
    "cooperative_groups",
    "cooperative_routes",
    "cooperative_funding",
    "cooperative_incidents",
    "cooperative_windows",
    "cooperative_settlements",
    "cooperative_refunds",
    "cooperative_events",
    "cooperative_renewal_authorizations",
    "cooperative_provider_mandates",
    "cooperative_renewal_runs",
    "cooperative_mandate_usages",
    "cooperative_renewal_events",
    "economic_parties",
    "economic_affiliations",
    "cooperative_operating_support",
    "cooperative_expansion_demand",
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
    CASE WHEN s.billing_state='SETTLED' AND s.cooperative_pool_id IS NULL THEN s.charged_microtu-floor(s.charged_microtu::numeric*2000/10000) ELSE 0 END`);
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
  const cooperativeMismatches =
    await restored.query(`SELECT cs.session_id FROM cooperative_settlements cs JOIN sessions s ON s.id=cs.session_id
    JOIN cooperative_pools cp ON cp.id=cs.pool_id JOIN cooperative_windows cw ON cw.lease_id=cs.coverage_lease_id
    WHERE cs.charge_microtu<>s.charged_microtu OR cs.pool_id<>s.cooperative_pool_id OR cs.pool_id<>cw.pool_id OR cs.policy_sha256<>cp.policy_sha256
    OR cs.charge_microtu<>cs.working_microtu+cs.reserve_microtu+cs.burned_microtu
    OR NOT EXISTS(SELECT 1 FROM journal j WHERE j.business_key='settle:'||cs.session_id)`);
  assert.equal(cooperativeMismatches.rowCount, 0);
  await assert.rejects(
    () => restored.query("UPDATE cooperative_pools SET policy=policy"),
    { code: "42501" },
  );
  await assert.rejects(
    () => restored.query("DELETE FROM cooperative_settlements"),
    { code: "42501" },
  );
  const renewalProjection =
    await restored.query(`SELECT a.id FROM cooperative_renewal_authorizations a
    LEFT JOIN cooperative_renewal_runs rr ON rr.authorization_id=a.id GROUP BY a.id
    HAVING count(rr.lease_id)<>a.windows_used OR coalesce(sum(rr.committed_microtu) FILTER(WHERE rr.source='WORKING'),0)<>a.working_committed_microtu
    OR coalesce(sum(rr.committed_microtu) FILTER(WHERE rr.source='RESERVE'),0)<>a.reserve_committed_microtu`);
  const mandateProjection =
    await restored.query(`SELECT m.id FROM cooperative_provider_mandates m
    LEFT JOIN cooperative_mandate_usages u ON u.mandate_id=m.id GROUP BY m.id HAVING count(u.lease_id)<>m.windows_used`);
  const renewalBindings =
    await restored.query(`SELECT rr.lease_id FROM cooperative_renewal_runs rr
    JOIN cooperative_renewal_authorizations a ON a.id=rr.authorization_id JOIN cooperative_windows cw ON cw.lease_id=rr.lease_id
    JOIN route_availability_leases l ON l.id=rr.lease_id WHERE a.pool_id<>cw.pool_id OR a.group_key<>cw.group_key
    OR a.coverage_kind<>cw.coverage_kind OR rr.source<>cw.funding_source OR rr.committed_microtu<>l.budget_microtu OR l.ends_ms>floor(extract(epoch FROM a.expires_at)*1000)
    OR l.terms->'cooperative'->'renewal'->>'authorization_id' IS DISTINCT FROM a.id::text
    OR l.terms->'cooperative'->'renewal'->>'authorization_terms_sha256' IS DISTINCT FROM a.terms_sha256
    OR EXISTS(SELECT DISTINCT am.provider_id FROM route_availability_members am WHERE am.lease_id=l.id
      EXCEPT SELECT provider_id FROM cooperative_mandate_usages WHERE lease_id=l.id)`);
  const mandateBindings =
    await restored.query(`SELECT u.lease_id FROM cooperative_mandate_usages u JOIN cooperative_provider_mandates m ON m.id=u.mandate_id
    JOIN route_availability_leases l ON l.id=u.lease_id LEFT JOIN route_availability_acceptances ac ON ac.lease_id=l.id AND ac.provider_id=u.provider_id
    WHERE u.provider_id<>m.provider_id OR u.terms_sha256<>m.terms_sha256 OR m.route_id<>l.route_id OR m.route_sha256<>l.route_sha256
    OR ac.provider_mandate_id IS DISTINCT FROM m.id OR ac.terms_sha256 IS DISTINCT FROM l.terms_sha256
    OR l.ends_ms>floor(extract(epoch FROM m.expires_at)*1000)
    OR m.coverage_kind IS DISTINCT FROM (SELECT coverage_kind FROM cooperative_windows WHERE lease_id=l.id)
    OR NOT EXISTS(SELECT 1 FROM route_availability_members am WHERE am.lease_id=l.id AND am.provider_id=u.provider_id)`);
  for (const result of [
    renewalProjection,
    mandateProjection,
    renewalBindings,
    mandateBindings,
  ])
    assert.equal(result.rowCount, 0);
  const expansionBindings =
    await restored.query(`SELECT w.lease_id FROM cooperative_windows w
    JOIN route_availability_leases l ON l.id=w.lease_id LEFT JOIN cooperative_expansion_demand ed ON ed.lease_id=w.lease_id
    LEFT JOIN cooperative_renewal_runs rr ON rr.lease_id=w.lease_id
    LEFT JOIN cooperative_renewal_authorizations a ON a.id=rr.authorization_id
    LEFT JOIN cooperative_operating_support os ON os.id=a.operating_support_id
    LEFT JOIN economic_affiliations ea ON ea.id=ed.affiliation_id LEFT JOIN sessions s ON s.id=ed.session_id
    WHERE w.coverage_kind IS DISTINCT FROM coalesce(l.terms->'cooperative'->>'coverage_kind','ESSENTIAL')
    OR (w.coverage_kind='ESSENTIAL' AND ed.lease_id IS NOT NULL)
    OR (w.coverage_kind='EXPANSION' AND (ed.lease_id IS NULL OR os.id IS NULL OR w.funding_source<>'WORKING'
      OR ed.evidence IS DISTINCT FROM l.terms->'cooperative'->'expansion'
      OR ed.evidence_sha256 IS DISTINCT FROM l.terms->'cooperative'->>'expansion_sha256'
      OR ea.party_id IS DISTINCT FROM ed.consumer_party_id OR ea.user_id IS DISTINCT FROM s.user_id
      OR ed.evidence->'selected_demand'->>'session_id' IS DISTINCT FROM ed.session_id::text
      OR ed.evidence->'selected_demand'->>'affiliation_id' IS DISTINCT FROM ea.id::text
      OR os.pool_id IS DISTINCT FROM w.pool_id OR os.policy_sha256 IS DISTINCT FROM a.policy_sha256
      OR ed.evidence->'support'->>'terms_sha256' IS DISTINCT FROM os.terms_sha256))`);
  assert.equal(expansionBindings.rowCount, 0);
  for (const statement of [
    "UPDATE cooperative_renewal_authorizations SET windows_used=0",
    "UPDATE cooperative_renewal_authorizations SET maximum_working_microtu=maximum_working_microtu",
    "UPDATE cooperative_provider_mandates SET terms=terms",
    "UPDATE cooperative_provider_mandates SET windows_used=0",
    "DELETE FROM cooperative_renewal_runs",
    "DELETE FROM cooperative_mandate_usages",
    "UPDATE cooperative_renewal_authorizations SET coverage_kind='ESSENTIAL'",
    "UPDATE cooperative_provider_mandates SET coverage_kind='ESSENTIAL'",
    "UPDATE cooperative_operating_support SET expires_at=now()+interval '1 year'",
    "UPDATE economic_affiliations SET party_id=party_id",
    "UPDATE economic_affiliations SET created_at=now()",
    "DELETE FROM economic_parties",
    "DELETE FROM cooperative_expansion_demand",
  ])
    await assert.rejects(() => restored.query(statement), { code: "42501" });
  const report = {
    evidence_type: "ISOLATED_POSTGRES_RESTORE",
    source_scope: fixtureDatabase
      ? "FABRICATED_CONTRACT_FIXTURES"
      : "PRIVATE_WORKING_DATABASE",
    source_comparison: "same exported PostgreSQL snapshot as pg_dump",
    observed_at: new Date().toISOString(),
    journal_entries: after.rows[0].n,
    balance_sum: "0",
    projection_mismatches: 0,
    cooperative_settlement_mismatches: 0,
    renewal_authority_projection_mismatches: 0,
    provider_mandate_projection_mismatches: 0,
    renewal_contract_binding_mismatches: 0,
    provider_mandate_binding_mismatches: 0,
    expansion_demand_support_and_coverage_binding_mismatches: 0,
    runtime_expansion_terms_and_classification_history_writes_denied: true,
    runtime_renewal_limits_terms_and_usage_writes_denied: true,
    runtime_cooperative_policy_and_history_writes_denied: true,
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
    join(
      runtime,
      fixtureDatabase ? "expansion-fixture-restore.json" : "backup-report.json",
    ),
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
