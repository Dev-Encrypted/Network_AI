// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import {
  amount,
  MAX_AMOUNT,
  sha256,
  splitByBps,
  uuid,
} from "@network-ai/contracts";
import type { User } from "./auth.js";
import { Database } from "./db.js";
import { need } from "./errors.js";
import { canonical, hash } from "./security.js";
import { Cooperative, cooperativeSnapshot } from "./cooperative.js";
import { RouteAvailability } from "./route-availability.js";
import { expansionFacts, publicExpansion } from "./economics.js";

type Row = Record<string, any>;
const reason = z.string().trim().min(20).max(500);
const maximumWindows = z.number().int().min(1).max(10000);
const common = {
  policy_sha256: sha256,
  maximum_windows: maximumWindows,
  expires_at: z.iso.datetime(),
  idempotency_key: uuid,
  reason,
  coverage_kind: z.enum(["ESSENTIAL", "EXPANSION"]).optional(),
};
const policy = "bounded-essential-renewal-v1";
async function poolLock(tx: PoolClient, id: string): Promise<Row> {
  const info = (
    await tx.query("SELECT creator_id FROM cooperative_pools WHERE id=$1", [id])
  ).rows[0];
  need(info, 404, "pool_missing", "Fundo cooperativo não encontrado.");
  // Use the same sponsor -> pool -> authority -> lease/domain lock order as manual funding.
  await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
    info.creator_id,
  ]);
  return (
    await tx.query("SELECT * FROM cooperative_pools WHERE id=$1 FOR UPDATE", [
      id,
    ])
  ).rows[0];
}
function checkExpiry(value: string, seconds: number) {
  need(
    new Date(value).getTime() > Date.now() + (seconds + 10) * 1000 &&
      new Date(value).getTime() <= Date.now() + 30 * 86400000,
    400,
    "mandate_expiry",
    "A autorização deve cobrir uma janela completa, com margem de 10 segundos, e durar no máximo 30 dias.",
  );
}
export class Renewals {
  constructor(readonly db: Database) {}
  async event(
    tx: PoolClient,
    pool: string,
    kind: string,
    actor: string | null,
    authorization: string | null,
    mandate: string | null,
    metadata: Record<string, unknown>,
  ) {
    await tx.query(
      `INSERT INTO cooperative_renewal_events(pool_id,kind,actor_id,authorization_id,provider_mandate_id,metadata) VALUES($1,$2,$3,$4,$5,$6)`,
      [pool, kind, actor, authorization, mandate, metadata],
    );
  }
  async view(user: User, id: string) {
    uuid.parse(id);
    return this.db.transaction(async (tx) => {
      const pool = (
        await tx.query("SELECT * FROM cooperative_pools WHERE id=$1", [id])
      ).rows[0];
      need(pool, 404, "pool_missing", "Fundo não encontrado.");
      const authorizations = (
        await tx.query(
          "SELECT * FROM cooperative_renewal_authorizations WHERE pool_id=$1 ORDER BY created_at DESC LIMIT 100",
          [id],
        )
      ).rows;
      const mandates = (
        await tx.query(
          `SELECT m.*,u.name AS provider_name,r.name AS route_name FROM cooperative_provider_mandates m
        JOIN users u ON u.id=m.provider_id JOIN execution_routes r ON r.id=m.route_id WHERE m.pool_id=$1 ORDER BY m.created_at DESC LIMIT 100`,
          [id],
        )
      ).rows;
      const routes = (
        await tx.query(
          `SELECT cr.route_id,cr.group_key,r.route_sha256,r.name,g.duration_seconds,g.rate_microtu_per_second,
        EXISTS(SELECT 1 FROM ready_execution_offers o WHERE o.route_id=r.id) AS ready,
        (SELECT jsonb_agg(jsonb_build_object('node_id',rm.node_id,'role',rm.role,'share_bps',rm.share_bps,'ordinal',rm.ordinal)
          ORDER BY rm.ordinal) FROM route_members rm WHERE rm.route_id=r.id AND rm.provider_id=$2) AS own_components
        FROM cooperative_routes cr JOIN cooperative_groups g ON g.pool_id=cr.pool_id AND g.group_key=cr.group_key
        JOIN execution_routes r ON r.id=cr.route_id WHERE cr.pool_id=$1 AND r.state='LOCAL_PREVIEW'
        AND EXISTS(SELECT 1 FROM route_members rm WHERE rm.route_id=r.id AND rm.provider_id=$2) ORDER BY cr.group_key,r.id`,
          [id, user.id],
        )
      ).rows;
      const runs = (
        await tx.query(
          `SELECT rr.*,cw.coverage_kind,l.state,l.started_ms,l.ends_ms,l.paid_microtu,l.terms_sha256 FROM cooperative_renewal_runs rr
        JOIN cooperative_windows cw ON cw.lease_id=rr.lease_id JOIN route_availability_leases l ON l.id=rr.lease_id
        WHERE cw.pool_id=$1 ORDER BY rr.created_at DESC LIMIT 100`,
          [id],
        )
      ).rows;
      const events = (
        await tx.query(
          "SELECT * FROM cooperative_renewal_events WHERE pool_id=$1 ORDER BY sequence DESC LIMIT 50",
          [id],
        )
      ).rows;
      const snapshot = await cooperativeSnapshot(tx, pool);
      const expansion = [];
      for (const group of snapshot.groups) {
        const authority = authorizations.find(
          (a) =>
            a.group_key === group.group_key &&
            a.coverage_kind === "EXPANSION" &&
            a.state === "ACTIVE",
        );
        expansion.push({
          group_key: group.group_key,
          ...publicExpansion(
            await expansionFacts(
              tx,
              pool,
              group,
              snapshot,
              authority?.operating_support_id,
            ),
          ),
        });
      }
      const operating_support = (
        await tx.query(
          "SELECT * FROM cooperative_operating_support WHERE pool_id=$1 ORDER BY created_at DESC LIMIT 100",
          [id],
        )
      ).rows;
      return {
        authorizations,
        mandates,
        routes,
        runs,
        events,
        renewal_policy: policy,
        expansion,
        operating_support,
      };
    });
  }
  async authorize(user: User, id: string, body: unknown) {
    uuid.parse(id);
    const d = z
      .object({
        ...common,
        group_key: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
        maximum_working_microtu: amount,
        maximum_reserve_microtu: amount,
        operating_support_id: uuid.optional(),
        consent: z.literal(
          "BOUNDED_GROSS_COMMITMENTS_NO_AUTOMATIC_LIMIT_INCREASE",
        ),
      })
      .strict()
      .parse(body);
    const kind = d.coverage_kind ?? "ESSENTIAL";
    need(
      kind === "EXPANSION"
        ? Boolean(d.operating_support_id) && d.maximum_reserve_microtu === "0"
        : !d.operating_support_id,
      400,
      "expansion_authority",
      "Expansão exige apoio operacional específico e limite zero para a reserva.",
    );
    const { coverage_kind, operating_support_id, ...legacy } = d;
    const digest = hash(
      canonical({
        pool_id: id,
        ...legacy,
        ...(kind === "EXPANSION"
          ? { coverage_kind: kind, operating_support_id }
          : {}),
      }),
    );
    return this.db.transaction(async (tx) => {
      const p = await poolLock(tx, id);
      need(
        user.id === p.creator_id || user.role === "admin",
        403,
        "pool_manager",
        "Somente o responsável pode autorizar gastos do fundo.",
      );
      const old = (
        await tx.query(
          "SELECT * FROM cooperative_renewal_authorizations WHERE authorized_by=$1 AND idempotency_key=$2",
          [user.id, d.idempotency_key],
        )
      ).rows[0];
      if (old) {
        need(
          old.request_sha256 === digest,
          409,
          "idempotency_conflict",
          "Identificador usado com outros limites.",
        );
        return old;
      }
      need(
        p.policy_sha256 === d.policy_sha256,
        409,
        "pool_terms",
        "Confira a política exata do fundo.",
      );
      need(
        kind !== "EXPANSION" ||
          p.policy.expansion === "PRIVATE_DEMAND_BACKED_SEPARATE_AUTHORIZATION",
        409,
        "expansion_policy",
        "A política original deste fundo não permite expansão. Crie um novo plano com os novos termos.",
      );
      const g = (
        await tx.query(
          "SELECT * FROM cooperative_groups WHERE pool_id=$1 AND group_key=$2",
          [id, d.group_key],
        )
      ).rows[0];
      need(g, 404, "group_missing", "Grupo essencial não encontrado.");
      checkExpiry(d.expires_at, g.duration_seconds);
      if (kind === "EXPANSION")
        need(
          (
            await tx.query(
              `SELECT 1 FROM cooperative_operating_support os JOIN users u ON u.id=os.created_by
        WHERE os.id=$1 AND os.pool_id=$2 AND os.policy_sha256=$3 AND os.revoked_at IS NULL AND NOT u.disabled
        AND os.expires_at>clock_timestamp()+($4::int+10)*interval '1 second' FOR UPDATE OF os`,
              [operating_support_id, id, p.policy_sha256, g.duration_seconds],
            )
          ).rowCount,
          409,
          "operating_support",
          "Confira uma declaração de apoio válida para este fundo e janela.",
        );
      const cost =
          BigInt(g.rate_microtu_per_second) * BigInt(g.duration_seconds),
        working = BigInt(d.maximum_working_microtu),
        reserve = BigInt(d.maximum_reserve_microtu);
      need(
        working + reserve <= MAX_AMOUNT && (working >= cost || reserve >= cost),
        400,
        "authorization_budget",
        "Um dos limites deve cobrir a rota inteira, sem exceder o limite contábil.",
      );
      await tx.query(
        "UPDATE cooperative_renewal_authorizations SET state='EXPIRED' WHERE pool_id=$1 AND state='ACTIVE' AND expires_at<=now()",
        [id],
      );
      need(
        !(
          await tx.query(
            "SELECT 1 FROM cooperative_renewal_authorizations WHERE pool_id=$1 AND group_key=$2 AND coverage_kind=$3 AND state='ACTIVE'",
            [id, d.group_key, kind],
          )
        ).rowCount,
        409,
        "active_authorization",
        "Revogue a autorização anterior antes de substituir seus limites.",
      );
      const auth = randomUUID(),
        terms = {
          policy: kind === "EXPANSION" ? "bounded-demand-expansion-v1" : policy,
          ...(kind === "EXPANSION"
            ? { coverage_kind: kind, operating_support_id }
            : {}),
          authorization_id: auth,
          pool_id: id,
          policy_sha256: p.policy_sha256,
          group_key: g.group_key,
          duration_seconds: g.duration_seconds,
          window_budget_microtu: cost.toString(),
          maximum_windows: d.maximum_windows,
          maximum_working_microtu: d.maximum_working_microtu,
          maximum_reserve_microtu: d.maximum_reserve_microtu,
          expires_at: d.expires_at,
          budget_basis: "GROSS_COMMITMENTS_REFUNDS_DO_NOT_RESTORE_LIMITS",
          compensation: "READINESS_ONLY",
          reason: d.reason,
        };
      const row = (
        await tx.query(
          `INSERT INTO cooperative_renewal_authorizations(id,pool_id,group_key,authorized_by,policy_sha256,maximum_windows,
        maximum_working_microtu,maximum_reserve_microtu,terms,terms_sha256,expires_at,idempotency_key,request_sha256,coverage_kind,operating_support_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
          [
            auth,
            id,
            g.group_key,
            user.id,
            p.policy_sha256,
            d.maximum_windows,
            d.maximum_working_microtu,
            d.maximum_reserve_microtu,
            terms,
            hash(canonical(terms)),
            d.expires_at,
            d.idempotency_key,
            digest,
            kind,
            operating_support_id ?? null,
          ],
        )
      ).rows[0];
      await this.event(tx, id, "fund_authorized", user.id, auth, null, {
        terms_sha256: row.terms_sha256,
      });
      return row;
    });
  }
  async mandate(user: User, id: string, body: unknown) {
    uuid.parse(id);
    const d = z
      .object({
        ...common,
        route_id: uuid,
        consent: z.enum([
          "READINESS_ONLY_BOUNDED_RENEWALS",
          "READINESS_ONLY_BOUNDED_EXPANSION",
        ]),
      })
      .strict()
      .parse(body);
    const kind = d.coverage_kind ?? "ESSENTIAL";
    need(
      d.consent ===
        (kind === "EXPANSION"
          ? "READINESS_ONLY_BOUNDED_EXPANSION"
          : "READINESS_ONLY_BOUNDED_RENEWALS"),
      400,
      "mandate_kind",
      "Confira o consentimento específico para capacidade essencial ou expansão.",
    );
    const { coverage_kind, ...legacy } = d;
    const digest = hash(
      canonical({
        pool_id: id,
        ...legacy,
        ...(kind === "EXPANSION" ? { coverage_kind: kind } : {}),
      }),
    );
    return this.db.transaction(async (tx) => {
      const p = await poolLock(tx, id);
      const old = (
        await tx.query(
          "SELECT * FROM cooperative_provider_mandates WHERE provider_id=$1 AND idempotency_key=$2",
          [user.id, d.idempotency_key],
        )
      ).rows[0];
      if (old) {
        need(
          old.request_sha256 === digest,
          409,
          "idempotency_conflict",
          "Identificador usado com outros termos.",
        );
        return old;
      }
      need(
        p.policy_sha256 === d.policy_sha256,
        409,
        "pool_terms",
        "Confira a política exata do fundo.",
      );
      need(
        kind !== "EXPANSION" ||
          p.policy.expansion === "PRIVATE_DEMAND_BACKED_SEPARATE_AUTHORIZATION",
        409,
        "expansion_policy",
        "A política original deste fundo não permite expansão. Crie um novo plano com os novos termos.",
      );
      const r = (
        await tx.query(
          `SELECT cr.*,g.duration_seconds,g.rate_microtu_per_second FROM cooperative_routes cr
        JOIN cooperative_groups g ON g.pool_id=cr.pool_id AND g.group_key=cr.group_key JOIN execution_routes r ON r.id=cr.route_id
        WHERE cr.pool_id=$1 AND cr.route_id=$2 AND r.state='LOCAL_PREVIEW'
        AND EXISTS(SELECT 1 FROM route_members rm WHERE rm.route_id=r.id AND rm.provider_id=$3)`,
          [id, d.route_id, user.id],
        )
      ).rows[0];
      need(
        r,
        404,
        "provider_route",
        "Você precisa oferecer uma das partes desta rota qualificada.",
      );
      checkExpiry(d.expires_at, r.duration_seconds);
      await tx.query(
        "UPDATE cooperative_provider_mandates SET state='EXPIRED' WHERE pool_id=$1 AND provider_id=$2 AND state='ACTIVE' AND expires_at<=now()",
        [id, user.id],
      );
      need(
        !(
          await tx.query(
            "SELECT 1 FROM cooperative_provider_mandates WHERE pool_id=$1 AND route_id=$2 AND provider_id=$3 AND coverage_kind=$4 AND state='ACTIVE'",
            [id, r.route_id, user.id, kind],
          )
        ).rowCount,
        409,
        "active_mandate",
        "Revogue sua autorização anterior antes de substituir seus limites.",
      );
      const members = (
        await tx.query(
          "SELECT node_id,provider_id,resource_domain_id,ordinal,role,share_bps FROM route_members WHERE route_id=$1 ORDER BY ordinal",
          [r.route_id],
        )
      ).rows;
      const budget =
          BigInt(r.rate_microtu_per_second) * BigInt(r.duration_seconds),
        shares = splitByBps(
          budget,
          members.map((m) => m.share_bps),
        );
      const own = members
        .filter((m) => m.provider_id === user.id)
        .map((m) => ({ ...m, maximum_microtu: shares[m.ordinal]!.toString() }));
      need(
        shares.every((v) => v > 0n),
        400,
        "window_budget",
        "O orçamento precisa remunerar todas as partes da rota.",
      );
      const mid = randomUUID(),
        terms = {
          policy: kind === "EXPANSION" ? "bounded-demand-expansion-v1" : policy,
          ...(kind === "EXPANSION" ? { coverage_kind: kind } : {}),
          mandate_id: mid,
          pool_id: id,
          policy_sha256: p.policy_sha256,
          provider_id: user.id,
          route_id: r.route_id,
          route_sha256: r.route_sha256,
          duration_seconds: r.duration_seconds,
          window_budget_microtu: budget.toString(),
          maximum_windows: d.maximum_windows,
          maximum_window_seconds: d.maximum_windows * r.duration_seconds,
          expires_at: d.expires_at,
          compensation: "READINESS_ONLY",
          components: own,
          revocation: "FUTURE_WINDOWS_ONLY_ACCEPTED_OBLIGATIONS_PRESERVED",
          reason: d.reason,
        };
      const row = (
        await tx.query(
          `INSERT INTO cooperative_provider_mandates(id,pool_id,provider_id,route_id,route_sha256,policy_sha256,maximum_windows,terms,terms_sha256,expires_at,idempotency_key,request_sha256,coverage_kind)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
          [
            mid,
            id,
            user.id,
            r.route_id,
            r.route_sha256,
            p.policy_sha256,
            d.maximum_windows,
            terms,
            hash(canonical(terms)),
            d.expires_at,
            d.idempotency_key,
            digest,
            kind,
          ],
        )
      ).rows[0];
      await this.event(tx, id, "provider_authorized", user.id, null, mid, {
        terms_sha256: row.terms_sha256,
      });
      return row;
    });
  }
  async revoke(user: User, id: string, provider: boolean) {
    uuid.parse(id);
    // Identifiers below are selected by trusted code, never interpolated from input.
    const table = provider
      ? "cooperative_provider_mandates"
      : "cooperative_renewal_authorizations";
    return this.db.transaction(async (tx) => {
      const info = (
        await tx.query(`SELECT pool_id FROM ${table} WHERE id=$1`, [id])
      ).rows[0];
      need(info, 404, "authority_missing", "Autorização não encontrada.");
      const p = await poolLock(tx, info.pool_id),
        row = (
          await tx.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [id])
        ).rows[0];
      need(
        user.role === "admin" ||
          (provider ? row.provider_id === user.id : p.creator_id === user.id),
        403,
        "authority_owner",
        "Somente o responsável pode revogar esta autorização.",
      );
      if (row.state !== "ACTIVE") return row;
      const updated = (
        await tx.query(
          `UPDATE ${table} SET state='REVOKED',revoked_at=clock_timestamp() WHERE id=$1 RETURNING *`,
          [id],
        )
      ).rows[0];
      await this.event(
        tx,
        p.id,
        provider ? "provider_revoked" : "fund_revoked",
        user.id,
        provider ? null : id,
        provider ? id : null,
        { accepted_windows_preserved: true },
      );
      return updated;
    });
  }
  async note(
    tx: PoolClient,
    a: Row,
    status: string,
    metadata: Record<string, unknown> = {},
  ) {
    await tx.query(
      "UPDATE cooperative_renewal_authorizations SET last_status=$2,last_attempt_at=clock_timestamp() WHERE id=$1",
      [a.id, status],
    );
    if (a.last_status !== status || status === "RENEWED")
      await this.event(
        tx,
        a.pool_id,
        status === "RENEWED" ? "window_renewed" : "waiting_changed",
        null,
        a.id,
        null,
        { status, ...metadata },
      );
    return { authorization_id: a.id, status, ...metadata };
  }
  async attempt(id: string) {
    return this.db.transaction(async (tx) => {
      const info = (
        await tx.query(
          "SELECT pool_id FROM cooperative_renewal_authorizations WHERE id=$1",
          [id],
        )
      ).rows[0];
      if (!info) return { status: "MISSING" };
      const p = await poolLock(tx, info.pool_id),
        a = (
          await tx.query(
            "SELECT * FROM cooperative_renewal_authorizations WHERE id=$1 FOR UPDATE",
            [id],
          )
        ).rows[0];
      if (a.state !== "ACTIVE") return { status: a.state };
      if (new Date(a.expires_at).getTime() <= Date.now()) {
        await tx.query(
          "UPDATE cooperative_renewal_authorizations SET state='EXPIRED' WHERE id=$1",
          [id],
        );
        return this.note(tx, a, "EXPIRED");
      }
      if (p.paused) return this.note(tx, a, "PAUSED");
      if (
        (
          await tx.query(
            "SELECT 1 FROM users WHERE id=ANY($1::uuid[]) AND disabled",
            [[p.creator_id, a.authorized_by]],
          )
        ).rowCount
      )
        return this.note(tx, a, "AUTHORIZER_DISABLED");
      need(
        a.policy_sha256 === p.policy_sha256,
        409,
        "pool_terms",
        "A autorização não corresponde à política vigente.",
      );
      const g = (
        await tx.query(
          "SELECT * FROM cooperative_groups WHERE pool_id=$1 AND group_key=$2",
          [p.id, a.group_key],
        )
      ).rows[0];
      const earliestEnd = Date.now() + (g.duration_seconds + 10) * 1000;
      if (
        earliestEnd >=
        Math.min(
          new Date(a.expires_at).getTime(),
          new Date(p.support_until).getTime(),
        )
      )
        return this.note(tx, a, "WAITING_FOR_SUPPORT");
      if (
        (
          await tx.query(
            `SELECT 1 FROM cooperative_windows cw JOIN route_availability_leases l ON l.id=cw.lease_id
        WHERE cw.pool_id=$1 AND cw.group_key=$2 AND cw.coverage_kind=$3 AND l.state IN ('OFFERED','ACTIVE','DRAINING')`,
            [p.id, g.group_key, a.coverage_kind],
          )
        ).rowCount
      )
        return this.note(tx, a, "WAITING_FOR_WINDOW");
      const cost =
        BigInt(g.rate_microtu_per_second) * BigInt(g.duration_seconds);
      const workingLimit =
          BigInt(a.maximum_working_microtu) -
          BigInt(a.working_committed_microtu),
        reserveLimit =
          BigInt(a.maximum_reserve_microtu) -
          BigInt(a.reserve_committed_microtu);
      if (
        a.windows_used >= a.maximum_windows ||
        (workingLimit < cost && reserveLimit < cost)
      ) {
        await tx.query(
          "UPDATE cooperative_renewal_authorizations SET state='EXHAUSTED' WHERE id=$1",
          [id],
        );
        return this.note(tx, a, "EXHAUSTED");
      }
      const snap = await cooperativeSnapshot(tx, p);
      const expansion =
        a.coverage_kind === "EXPANSION"
          ? await expansionFacts(tx, p, g, snap, a.operating_support_id)
          : null;
      if (expansion && !expansion.approved)
        return this.note(
          tx,
          a,
          `EXPANSION_${expansion.blocked_by[0]!.toUpperCase()}`,
          { blocked_by: expansion.blocked_by },
        );
      const source =
        snap.working >= cost && workingLimit >= cost
          ? "WORKING"
          : snap.working < cost && snap.reserve >= cost && reserveLimit >= cost
            ? "RESERVE"
            : null;
      if (!source)
        return this.note(
          tx,
          a,
          snap.working >= cost || snap.reserve >= cost
            ? "WAITING_FOR_AUTHORIZED_SOURCE"
            : "WAITING_FOR_FUNDS",
        );
      const candidates = (
        await tx.query(
          `SELECT cr.* FROM cooperative_routes cr JOIN ready_execution_offers o ON o.route_id=cr.route_id
        WHERE cr.pool_id=$1 AND cr.group_key=$2 AND ($3::uuid[] IS NULL OR cr.route_id=ANY($3::uuid[])) AND NOT EXISTS(SELECT 1 FROM availability_domain_claims ac WHERE ac.resource_domain_id=ANY(o.domain_ids))
        ORDER BY (SELECT max(l.created_at) FROM cooperative_windows cw JOIN route_availability_leases l ON l.id=cw.lease_id
          WHERE cw.pool_id=$1 AND l.route_id=cr.route_id) ASC NULLS FIRST,cr.route_id`,
          [p.id, g.group_key, expansion?.candidates ?? null],
        )
      ).rows;
      if (!candidates.length) return this.note(tx, a, "WAITING_FOR_CAPACITY");
      let chosen: Row | undefined,
        mandates: Row[] = [];
      for (const r of candidates) {
        const providers = (
          await tx.query(
            "SELECT DISTINCT provider_id FROM route_members WHERE route_id=$1 ORDER BY provider_id",
            [r.route_id],
          )
        ).rows.map((v) => v.provider_id);
        const ms = (
          await tx.query(
            `SELECT m.* FROM cooperative_provider_mandates m WHERE m.pool_id=$1 AND m.route_id=$2
          AND m.provider_id=ANY($3::uuid[]) AND m.route_sha256=$4 AND m.policy_sha256=$5 AND m.state='ACTIVE'
          AND m.windows_used<m.maximum_windows AND m.expires_at>to_timestamp($6::double precision/1000) AND m.coverage_kind=$7 ORDER BY m.id FOR UPDATE`,
            [
              p.id,
              r.route_id,
              providers,
              r.route_sha256,
              p.policy_sha256,
              earliestEnd,
              a.coverage_kind,
            ],
          )
        ).rows;
        if (ms.length === providers.length) {
          chosen = r;
          mandates = ms;
          break;
        }
      }
      if (!chosen) return this.note(tx, a, "WAITING_FOR_OPERATORS");
      const selectedDemand = expansion?.demand[0];
      let expansionEvidence: Record<string, any> | undefined;
      if (expansion && selectedDemand) {
        // Freeze the selected request and supporting declarations before committing capacity.
        await tx.query(
          "SELECT id FROM cooperative_operating_support WHERE id=$1 FOR UPDATE",
          [a.operating_support_id],
        );
        await tx.query(
          `SELECT id FROM economic_affiliations WHERE revoked_at IS NULL AND (user_id=$1 OR user_id=$2 OR user_id IN(
            SELECT rm.provider_id FROM cooperative_routes cr JOIN route_members rm ON rm.route_id=cr.route_id WHERE cr.pool_id=$3 AND cr.group_key=$4)) ORDER BY id FOR SHARE`,
          [selectedDemand.user_id, p.creator_id, p.id, g.group_key],
        );
        const held = (
          await tx.query(
            "SELECT * FROM sessions WHERE id=$1 AND state='QUEUED' AND billing_state='HELD' AND queue_deadline>clock_timestamp()+interval '10 seconds' FOR UPDATE",
            [selectedDemand.id],
          )
        ).rows[0];
        need(
          held,
          409,
          "demand_changed",
          "A demanda mudou antes da reserva de expansão.",
        );
        expansionEvidence = {
          ...publicExpansion(expansion),
          selected_demand: {
            session_id: held.id,
            party_id: selectedDemand.party_id,
            affiliation_id: selectedDemand.affiliation_id,
            hold_microtu: held.hold_microtu,
          },
        };
      }
      const creator = (
        await tx.query("SELECT id,login,name,role FROM users WHERE id=$1", [
          p.creator_id,
        ])
      ).rows[0] as User;
      const lease = await new Cooperative(this.db).offerTransaction(
        tx,
        creator,
        p.id,
        {
          group_key: g.group_key,
          source,
          reason: `Bounded ${a.coverage_kind.toLowerCase()} renewal ${a.id}; fixed policy and gross commitment limits.`,
          idempotency_key: randomUUID(),
        },
        {
          eligibleRoutes: [chosen.route_id],
          ...(expansionEvidence ? { expansion: expansionEvidence } : {}),
          renewal: {
            authorization_id: a.id,
            authorization_terms_sha256: a.terms_sha256,
            sequence: a.windows_used + 1,
            provider_mandates: mandates.map((m) => ({
              id: m.id,
              provider_id: m.provider_id,
              terms_sha256: m.terms_sha256,
            })),
          },
        },
      );
      const availability = new RouteAvailability(this.db);
      for (const m of mandates) {
        const provider = (
          await tx.query("SELECT id,login,name,role FROM users WHERE id=$1", [
            m.provider_id,
          ])
        ).rows[0] as User;
        await availability.acceptTransaction(
          tx,
          provider,
          lease.id,
          { terms_sha256: lease.terms_sha256 },
          { id: m.id, terms_sha256: m.terms_sha256 },
        );
      }
      await tx.query(
        "INSERT INTO cooperative_renewal_runs(lease_id,authorization_id,sequence,source,committed_microtu) VALUES($1,$2,$3,$4,$5)",
        [lease.id, a.id, a.windows_used + 1, source, cost.toString()],
      );
      for (const m of mandates)
        await tx.query(
          "INSERT INTO cooperative_mandate_usages(lease_id,provider_id,mandate_id,terms_sha256) VALUES($1,$2,$3,$4)",
          [lease.id, m.provider_id, m.id, m.terms_sha256],
        );
      if (selectedDemand && expansionEvidence)
        await tx.query(
          `INSERT INTO cooperative_expansion_demand(lease_id,session_id,consumer_party_id,affiliation_id,evidence,evidence_sha256)
        VALUES($1,$2,$3,$4,$5,$6)`,
          [
            lease.id,
            selectedDemand.id,
            selectedDemand.party_id,
            selectedDemand.affiliation_id,
            expansionEvidence,
            hash(canonical(expansionEvidence)),
          ],
        );
      return this.note(tx, a, "RENEWED", {
        lease_id: lease.id,
        source,
        committed_microtu: cost.toString(),
        sequence: a.windows_used + 1,
        coverage_kind: a.coverage_kind,
      });
    });
  }
  async reconcile() {
    await this.db.pool.query(
      "UPDATE cooperative_provider_mandates SET state='EXPIRED' WHERE state='ACTIVE' AND expires_at<=now()",
    );
    const active = (
      await this.db.pool.query(
        "SELECT id FROM cooperative_renewal_authorizations WHERE state='ACTIVE' ORDER BY last_attempt_at NULLS FIRST,id LIMIT 100",
      )
    ).rows;
    // Keep the age-based batch fair; prioritize essential work within that batch.
    const ordered = active.length
      ? (
          await this.db.pool.query(
            "SELECT id FROM cooperative_renewal_authorizations WHERE id=ANY($1::uuid[]) ORDER BY (coverage_kind='EXPANSION'),last_attempt_at NULLS FIRST,id",
            [active.map((a) => a.id)],
          )
        ).rows
      : [];
    const results = [];
    for (const { id } of ordered) {
      try {
        results.push(await this.attempt(id));
      } catch (e) {
        // No financial part of a failed attempt survives its transaction. The next
        // observed eligible window can retry, subject to unchanged durable limits.
        const errorCode = String(
          (e as { code?: string }).code ?? "retry_pending",
        );
        results.push(
          await this.db.transaction(async (tx) => {
            const info = (
              await tx.query(
                "SELECT pool_id FROM cooperative_renewal_authorizations WHERE id=$1",
                [id],
              )
            ).rows[0];
            await poolLock(tx, info.pool_id);
            const a = (
              await tx.query(
                "SELECT * FROM cooperative_renewal_authorizations WHERE id=$1 FOR UPDATE",
                [id],
              )
            ).rows[0];
            if (a.state !== "ACTIVE") return { status: a.state };
            return this.note(tx, a, "RETRY_PENDING", { error_code: errorCode });
          }),
        );
      }
    }
    return results;
  }
}
