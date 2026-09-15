// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Private administrative evidence only: different declared parties are not a public anti-Sybil proof.
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { label, sha256, uuid } from "@network-ai/contracts";
import type { User } from "./auth.js";
import { Database } from "./db.js";
import { need } from "./errors.js";
import { canonical, hash } from "./security.js";

type Row = Record<string, any>;
const common = {
  evidence_sha256: sha256,
  source_reference: z.string().trim().min(20).max(300),
  idempotency_key: uuid,
};
const expiry = z.iso.datetime();
function admin(user: User) {
  need(
    user.role === "admin",
    403,
    "admin_required",
    "A classificação econômica requer revisão administrativa.",
  );
}
function checkExpiry(value: string) {
  need(
    new Date(value).getTime() > Date.now() + 60000 &&
      new Date(value).getTime() <= Date.now() + 30 * 86400000,
    400,
    "evidence_expiry",
    "A declaração deve valer por mais de um minuto e no máximo 30 dias.",
  );
}
export class Economics {
  constructor(readonly db: Database) {}
  async list(user: User) {
    admin(user);
    return this.db.transaction(async (tx) => ({
      parties: (
        await tx.query(
          "SELECT * FROM economic_parties ORDER BY created_at DESC LIMIT 200",
        )
      ).rows,
      affiliations: (
        await tx.query(`SELECT a.*,u.name AS user_name,p.name AS party_name FROM economic_affiliations a
        JOIN users u ON u.id=a.user_id JOIN economic_parties p ON p.id=a.party_id ORDER BY a.created_at DESC LIMIT 200`)
      ).rows,
      qualification_scope: "PRIVATE_ADMINISTRATIVE_DECLARATIONS",
    }));
  }
  async party(user: User, body: unknown) {
    admin(user);
    const d = z
        .object({ ...common, name: label })
        .strict()
        .parse(body),
      digest = hash(canonical(d));
    return this.db.transaction(async (tx) => {
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user.id]);
      const old = (
        await tx.query(
          "SELECT * FROM economic_parties WHERE created_by=$1 AND idempotency_key=$2",
          [user.id, d.idempotency_key],
        )
      ).rows[0];
      if (old) {
        need(
          old.request_sha256 === digest,
          409,
          "idempotency_conflict",
          "Identificador usado com outra declaração.",
        );
        return old;
      }
      return (
        await tx.query(
          `INSERT INTO economic_parties(id,name,evidence_sha256,source_reference,created_by,idempotency_key,request_sha256)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [
            randomUUID(),
            d.name,
            d.evidence_sha256,
            d.source_reference,
            user.id,
            d.idempotency_key,
            digest,
          ],
        )
      ).rows[0];
    });
  }
  async affiliate(user: User, body: unknown) {
    admin(user);
    const d = z
        .object({
          ...common,
          user_id: uuid,
          party_id: uuid,
          expires_at: expiry,
        })
        .strict()
        .parse(body),
      digest = hash(canonical(d));
    return this.db.transaction(async (tx) => {
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        d.user_id,
      ]);
      const old = (
        await tx.query(
          "SELECT * FROM economic_affiliations WHERE created_by=$1 AND idempotency_key=$2",
          [user.id, d.idempotency_key],
        )
      ).rows[0];
      if (old) {
        need(
          old.request_sha256 === digest,
          409,
          "idempotency_conflict",
          "Identificador usado com outra classificação.",
        );
        return old;
      }
      checkExpiry(d.expires_at);
      await tx.query(
        "UPDATE economic_affiliations SET revoked_at=clock_timestamp() WHERE user_id=$1 AND revoked_at IS NULL AND expires_at<=now()",
        [d.user_id],
      );
      need(
        !(
          await tx.query(
            "SELECT 1 FROM economic_affiliations WHERE user_id=$1 AND revoked_at IS NULL",
            [d.user_id],
          )
        ).rowCount,
        409,
        "active_affiliation",
        "Revogue a classificação anterior antes de substituí-la.",
      );
      return (
        await tx.query(
          `INSERT INTO economic_affiliations(id,user_id,party_id,evidence_sha256,source_reference,created_by,expires_at,idempotency_key,request_sha256)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [
            randomUUID(),
            d.user_id,
            d.party_id,
            d.evidence_sha256,
            d.source_reference,
            user.id,
            d.expires_at,
            d.idempotency_key,
            digest,
          ],
        )
      ).rows[0];
    });
  }
  async support(user: User, pool: string, body: unknown) {
    admin(user);
    uuid.parse(pool);
    const d = z
      .object({
        ...common,
        policy_sha256: sha256,
        scope: z.string().trim().min(40).max(1000),
        expires_at: expiry,
        consent: z.literal("PRIVATE_IN_KIND_SUPPORT_NO_VERIFIED_CASH_CLAIM"),
      })
      .strict()
      .parse(body);
    const digest = hash(canonical({ pool_id: pool, ...d }));
    return this.db.transaction(async (tx) => {
      const p = (
        await tx.query(
          "SELECT * FROM cooperative_pools WHERE id=$1 FOR UPDATE",
          [pool],
        )
      ).rows[0];
      need(p, 404, "pool_missing", "Fundo não encontrado.");
      const old = (
        await tx.query(
          "SELECT * FROM cooperative_operating_support WHERE created_by=$1 AND idempotency_key=$2",
          [user.id, d.idempotency_key],
        )
      ).rows[0];
      if (old) {
        need(
          old.request_sha256 === digest,
          409,
          "idempotency_conflict",
          "Identificador usado com outro apoio.",
        );
        return old;
      }
      need(
        p.policy_sha256 === d.policy_sha256,
        409,
        "pool_terms",
        "A declaração deve citar a política exata do fundo.",
      );
      checkExpiry(d.expires_at);
      const id = randomUUID(),
        terms = {
          policy: "private-in-kind-support-v1",
          id,
          pool_id: pool,
          actor_id: user.id,
          ...d,
        };
      return (
        await tx.query(
          `INSERT INTO cooperative_operating_support(id,pool_id,policy_sha256,created_by,scope,evidence_sha256,source_reference,
        expires_at,idempotency_key,request_sha256,terms,terms_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [
            id,
            pool,
            d.policy_sha256,
            user.id,
            d.scope,
            d.evidence_sha256,
            d.source_reference,
            d.expires_at,
            d.idempotency_key,
            digest,
            terms,
            hash(canonical(terms)),
          ],
        )
      ).rows[0];
    });
  }
  async revoke(user: User, id: string, support: boolean) {
    admin(user);
    uuid.parse(id);
    const table = support
      ? "cooperative_operating_support"
      : "economic_affiliations";
    return this.db.transaction(async (tx) => {
      const row = (
        await tx.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [id])
      ).rows[0];
      need(row, 404, "evidence_missing", "Declaração não encontrada.");
      if (row.revoked_at) return row;
      return (
        await tx.query(
          `UPDATE ${table} SET revoked_at=clock_timestamp() WHERE id=$1 RETURNING *`,
          [id],
        )
      ).rows[0];
    });
  }
}

// Historical affiliation is evaluated at settlement time. Later classifications cannot turn prior self/unknown use into qualified flow.
// Every relevant provider AND the pool creator must have been classified at that time, otherwise independence is unknown.
const independentAt = (
  time: string,
  consumer: string,
  pool: string,
  group: string,
) => `EXISTS(
  SELECT 1 FROM economic_affiliations ca WHERE ca.user_id=${consumer} AND ca.created_at<=${time} AND ca.expires_at>${time}
  AND (ca.revoked_at IS NULL OR ca.revoked_at>${time}) AND NOT EXISTS(
    SELECT 1 FROM (SELECT rm.provider_id AS id FROM cooperative_routes cr JOIN route_members rm ON rm.route_id=cr.route_id
      WHERE cr.pool_id=${pool} AND cr.group_key=${group} UNION SELECT creator_id FROM cooperative_pools WHERE id=${pool}) actors
    LEFT JOIN economic_affiliations pa ON pa.user_id=actors.id AND pa.created_at<=${time} AND pa.expires_at>${time}
      AND (pa.revoked_at IS NULL OR pa.revoked_at>${time})
    WHERE pa.id IS NULL OR pa.party_id=ca.party_id))`;

export async function expansionFacts(
  tx: PoolClient,
  p: Row,
  g: Row,
  s: Row,
  supportId?: string,
) {
  const cost = BigInt(g.rate_microtu_per_second) * BigInt(g.duration_seconds);
  const support = supportId
    ? (
        await tx.query(
          `SELECT os.* FROM cooperative_operating_support os JOIN users u ON u.id=os.created_by
    WHERE os.id=$1 AND os.pool_id=$2 AND os.policy_sha256=$3 AND os.revoked_at IS NULL AND NOT u.disabled
    AND os.expires_at>clock_timestamp()+($4::int+10)*interval '1 second'`,
          [supportId, p.id, p.policy_sha256, g.duration_seconds],
        )
      ).rows[0]
    : undefined;
  const flow = (
    await tx.query(
      `WITH settlements AS (
    SELECT cs.*,${independentAt("cs.created_at", "ss.user_id", "cs.pool_id", "cw.group_key")} AS separate_parties
    FROM cooperative_settlements cs JOIN sessions ss ON ss.id=cs.session_id JOIN cooperative_windows cw ON cw.lease_id=cs.coverage_lease_id
    WHERE cs.pool_id=$1), credited AS (
      SELECT coalesce(sum(working_microtu+reserve_microtu),0) AS n FROM settlements
      WHERE created_at>now()-interval '24 hours' AND separate_parties), reversed AS (
      SELECT coalesce(sum(cs.working_microtu+cs.reserve_microtu),0) AS n FROM settlements cs JOIN cooperative_refunds rf ON rf.session_id=cs.session_id
      WHERE rf.created_at>now()-interval '24 hours' AND cs.separate_parties), costs AS (
      SELECT coalesce(sum(-jl.amount),0) AS n FROM journal j JOIN journal_lines jl ON jl.journal_id=j.id
      JOIN route_availability_leases l ON l.escrow_account=jl.account_id JOIN cooperative_windows cw ON cw.lease_id=l.id
      WHERE cw.pool_id=$1 AND cw.funding_source='WORKING' AND j.kind='ROUTE_AVAILABILITY_PAYMENT' AND j.created_at>now()-interval '24 hours')
    SELECT (credited.n-reversed.n)::text AS net_recycled_microtu,costs.n::text AS normal_cost_microtu FROM credited,reversed,costs`,
      [p.id],
    )
  ).rows[0];
  const covered = (
    await tx.query(
      `SELECT l.id,l.route_id,cw.coverage_kind,o.domain_ids FROM cooperative_windows cw JOIN route_availability_leases l ON l.id=cw.lease_id
    JOIN ready_execution_offers o ON o.route_id=l.route_id WHERE cw.pool_id=$1 AND cw.group_key=$2 AND l.state='ACTIVE'
    AND l.ends_ms>extract(epoch FROM clock_timestamp())*1000+10000
    AND NOT EXISTS(SELECT 1 FROM route_availability_members am WHERE am.lease_id=l.id AND am.withdrawn_at IS NOT NULL) ORDER BY l.id`,
      [p.id, g.group_key],
    )
  ).rows;
  const domains = [...new Set(covered.flatMap((r) => r.domain_ids))];
  const resources = (
    await tx.query(
      `SELECT d.id,greatest(0,d.slots-(SELECT count(*) FROM active_session_domains sd WHERE sd.resource_domain_id=d.id))::int AS available
    FROM resource_domains d WHERE d.id=ANY($1::uuid[])`,
      [domains],
    )
  ).rows;
  const available = new Map<string, number>(
    resources.map((r) => [r.id, r.available]),
  );
  let spare = 0;
  for (const r of covered) {
    const n = Math.min(
      ...r.domain_ids.map((id: string) => available.get(id) ?? 0),
    );
    if (n > 0) {
      spare += n;
      for (const id of r.domain_ids) available.set(id, available.get(id)! - n);
    }
  }
  const candidates = (
    await tx.query(
      `SELECT cr.route_id FROM cooperative_routes cr JOIN ready_execution_offers o ON o.route_id=cr.route_id
    WHERE cr.pool_id=$1 AND cr.group_key=$2 AND NOT EXISTS(SELECT 1 FROM availability_domain_claims ac WHERE ac.resource_domain_id=ANY(o.domain_ids))
    AND NOT EXISTS(SELECT 1 FROM active_session_domains ad WHERE ad.resource_domain_id=ANY(o.domain_ids)) ORDER BY cr.route_id`,
      [p.id, g.group_key],
    )
  ).rows.map((r) => r.route_id);
  // Keep the sponsor's shared four-contract ceiling available to essential groups,
  // including supported pools that have not opened their essential window yet.
  const sponsorCapacity = (
    await tx.query(
      `SELECT (
      (SELECT count(*) FROM availability_leases WHERE sponsor_id=$1 AND state IN ('OFFERED','ACTIVE'))+
      (SELECT count(*) FROM route_availability_leases WHERE sponsor_id=$1 AND state IN ('OFFERED','ACTIVE','DRAINING'))+
      (SELECT count(*) FROM cooperative_groups eg JOIN cooperative_pools ep ON ep.id=eg.pool_id
        WHERE ep.creator_id=$1 AND NOT ep.paused AND ep.support_until>now() AND NOT EXISTS(
          SELECT 1 FROM cooperative_windows ew JOIN route_availability_leases el ON el.id=ew.lease_id
          WHERE ew.pool_id=eg.pool_id AND ew.group_key=eg.group_key AND ew.coverage_kind='ESSENTIAL'
          AND el.state IN ('OFFERED','ACTIVE','DRAINING'))))::int AS reserved`,
      [p.creator_id],
    )
  ).rows[0].reserved;
  const essentialGroups = (
    await tx.query(
      `SELECT count(DISTINCT cw.group_key)::int AS n FROM cooperative_windows cw
      JOIN route_availability_leases l ON l.id=cw.lease_id JOIN ready_execution_offers o ON o.route_id=l.route_id
      WHERE cw.pool_id=$1 AND cw.coverage_kind='ESSENTIAL' AND l.state='ACTIVE'
      AND l.ends_ms>extract(epoch FROM clock_timestamp())*1000+10000
      AND NOT EXISTS(SELECT 1 FROM route_availability_members am WHERE am.lease_id=l.id AND am.withdrawn_at IS NOT NULL)`,
      [p.id],
    )
  ).rows[0].n;
  const demand = (
    await tx.query(
      `SELECT DISTINCT ON(a.party_id) ss.id,ss.user_id,a.party_id,a.id AS affiliation_id,ss.created_at,ss.queue_deadline,ss.hold_microtu
    FROM sessions ss JOIN economic_affiliations a ON a.user_id=ss.user_id JOIN users u ON u.id=ss.user_id
    JOIN models m ON m.id=ss.model_id WHERE ss.cooperative_pool_id=$1 AND ss.model_id=$2 AND ss.cooperative_policy_sha256=$3
    AND ss.state='QUEUED' AND ss.billing_state='HELD' AND ss.hold_microtu>0 AND NOT u.disabled
    AND ss.manifest_sha256=m.manifest_sha256 AND m.state='LOCAL_PREVIEW'
    AND ss.created_at<=now()-interval '10 seconds' AND ss.queue_deadline>clock_timestamp()+interval '10 seconds'
    AND a.revoked_at IS NULL AND a.expires_at>now() AND ${independentAt("clock_timestamp()", "ss.user_id", "ss.cooperative_pool_id", "$4")}
    AND EXISTS(SELECT 1 FROM journal j JOIN journal_lines jl ON jl.journal_id=j.id WHERE j.business_key='hold:'||ss.id::text
      AND jl.account_id='user:'||ss.user_id::text||':held' AND jl.amount=ss.hold_microtu)
    AND NOT EXISTS(SELECT 1 FROM cooperative_expansion_demand ed WHERE ed.session_id=ss.id)
    ORDER BY a.party_id,ss.created_at,ss.id LIMIT 100`,
      [p.id, g.model_id, p.policy_sha256, g.group_key],
    )
  ).rows;
  const gates = {
    policy_permission:
      p.policy.expansion === "PRIVATE_DEMAND_BACKED_SEPARATE_AUTHORIZATION",
    normal_recovery: s.state === "NORMAL",
    working_floor: s.working >= s.floor + cost,
    protected_reserve: s.reserve >= s.reserveTarget,
    operating_support: Boolean(support),
    essential_coverage: essentialGroups === s.groups.length,
    essential_contract_slots: sponsorCapacity < 4,
    recurring_flow:
      BigInt(flow.normal_cost_microtu) > 0n &&
      BigInt(flow.net_recycled_microtu) >= BigInt(flow.normal_cost_microtu),
    funded_pressure: demand.length > spare,
    additional_complete_route: candidates.length > 0,
  };
  const checks = Object.entries(gates)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);
  return {
    policy: "private-demand-backed-expansion-v1",
    qualification_scope: "PRIVATE_DECLARED_PARTIES",
    evaluated_at: new Date().toISOString(),
    approved: checks.length === 0,
    blocked_by: checks,
    gates,
    window_budget_microtu: cost.toString(),
    free_working_microtu: s.working.toString(),
    essential_floor_microtu: s.floor.toString(),
    free_reserve_microtu: s.reserve.toString(),
    reserve_target_microtu: s.reserveTarget.toString(),
    ...flow,
    eligible_funded_parties: demand.length,
    spare_covered_slots: spare,
    additional_complete_routes: candidates.length,
    essential_groups_covered: essentialGroups,
    essential_groups_required: s.groups.length,
    reserved_sponsor_contract_slots: sponsorCapacity,
    support: support
      ? {
          id: support.id,
          terms_sha256: support.terms_sha256,
          expires_at: support.expires_at,
        }
      : null,
    demand,
    candidates,
  };
}

export function publicExpansion(f: Awaited<ReturnType<typeof expansionFacts>>) {
  const { demand, candidates, ...view } = f;
  return view;
}
