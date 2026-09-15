// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { amount, label, MAX_AMOUNT, sha256, uuid } from "@network-ai/contracts";
import type { User } from "./auth.js";
import { Database } from "./db.js";
import { need } from "./errors.js";
import { availableAccount, post } from "./ledger.js";
import { canonical, hash } from "./security.js";
import { RouteAvailability } from "./route-availability.js";

type Row = Record<string, any>;
export const cooperativePolicy = "private-cooperative-floor-first-v2";
const positive = amount.refine((n) => BigInt(n) > 0n);
const key = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/);
const min = (a: bigint, b: bigint) => (a < b ? a : b);
const gap = (target: bigint, balance: bigint) =>
  target > balance ? target - balance : 0n;
const strings = (v: Record<string, bigint>) =>
  Object.fromEntries(Object.entries(v).map(([k, n]) => [k, n.toString()]));

// Pure integer accounting; credited time and prices are never represented as floats.
export function recycle(
  q: bigint,
  w: bigint,
  r: bigint,
  f: bigint,
  wt: bigint,
  rt: bigint,
) {
  const floor = min(q, gap(f, w));
  const reserve = min(q - floor, gap(rt, r));
  const working = min(q - floor - reserve, gap(wt, w + floor));
  return { floor, reserve, working, burned: q - floor - reserve - working };
}
async function locked(tx: PoolClient, id: string): Promise<Row> {
  const p = (
    await tx.query("SELECT * FROM cooperative_pools WHERE id=$1 FOR UPDATE", [
      id,
    ])
  ).rows[0];
  need(p, 404, "pool_missing", "Fundo cooperativo não encontrado.");
  return p;
}
export async function cooperativeSnapshot(tx: PoolClient, p: Row) {
  const groups = (
    await tx.query(
      `SELECT g.*,
    EXISTS(SELECT 1 FROM cooperative_routes cr JOIN ready_execution_offers o ON o.route_id=cr.route_id
      WHERE cr.pool_id=g.pool_id AND cr.group_key=g.group_key) AS ready,
    coalesce((SELECT sum(l.budget_microtu-l.paid_microtu) FROM cooperative_windows cw JOIN route_availability_leases l ON l.id=cw.lease_id
      WHERE cw.pool_id=g.pool_id AND cw.group_key=g.group_key AND cw.coverage_kind='ESSENTIAL' AND l.state IN ('OFFERED','ACTIVE','DRAINING')
      AND (l.ends_ms>extract(epoch FROM now())*1000 OR (l.state='OFFERED' AND l.offer_expires_at>now()))),0)::text AS held,
    coalesce((SELECT sum(l.budget_microtu-l.paid_microtu) FROM cooperative_windows cw JOIN route_availability_leases l ON l.id=cw.lease_id
      WHERE cw.pool_id=g.pool_id AND cw.group_key=g.group_key AND cw.coverage_kind='EXPANSION' AND l.state IN ('OFFERED','ACTIVE','DRAINING')),0)::text AS expansion_held
    FROM cooperative_groups g WHERE g.pool_id=$1 ORDER BY g.group_key`,
      [p.id],
    )
  ).rows;
  const rate = groups.reduce(
    (s, g) => s + BigInt(g.rate_microtu_per_second),
    0n,
  );
  const held = groups.reduce((s, g) => s + BigInt(g.held), 0n);
  const expansionHeld = groups.reduce(
    (s, g) => s + BigInt(g.expansion_held),
    0n,
  );
  const accounts = (
    await tx.query(
      "SELECT id,balance FROM ledger_accounts WHERE id=ANY($1::text[])",
      [[p.working_account, p.reserve_account, p.burn_account]],
    )
  ).rows;
  const balance = (id: string): bigint =>
    BigInt(accounts.find((a) => a.id === id).balance);
  // All windows are at most one hour; both pending and active commitments fit inside H=6h.
  const floor = gap(rate * 21600n, held),
    workingTarget = gap(rate * 86400n, held),
    reserveTarget = rate * 259200n;
  const working = balance(p.working_account),
    reserve = balance(p.reserve_account);
  const minimum = groups.reduce(
    (s, g) =>
      s +
      (BigInt(g.held) > 0n
        ? 0n
        : BigInt(g.rate_microtu_per_second) * BigInt(g.duration_seconds)),
    0n,
  );
  const supported =
    !p.paused && new Date(p.support_until).getTime() > Date.now();
  const allReady = groups.every((g) => g.ready);
  const continuous =
    supported && allReady && working >= floor && reserve >= reserveTarget;
  const oldSample = p.sample_at ? new Date(p.sample_at).getTime() : 0;
  const healthySince = continuous
    ? p.healthy_since && Date.now() - oldSample <= 6000
      ? p.healthy_since
      : new Date()
    : null;
  let state = "HIBERNATING";
  const anyAffordable = groups.some(
    (g) =>
      g.ready &&
      (BigInt(g.held) > 0n ||
        working >=
          BigInt(g.rate_microtu_per_second) * BigInt(g.duration_seconds) ||
        reserve >=
          BigInt(g.rate_microtu_per_second) * BigInt(g.duration_seconds)),
  );
  if (supported && anyAffordable)
    state =
      !allReady || working < minimum
        ? "DEFENSE"
        : healthySince &&
            Date.now() - new Date(healthySince).getTime() >= 86400000
          ? "NORMAL"
          : "RECOVERY";
  return {
    groups,
    working,
    reserve,
    burned: balance(p.burn_account),
    floor,
    workingTarget,
    reserveTarget,
    held: held + expansionHeld,
    essentialHeld: held,
    expansionHeld,
    minimum,
    state,
    healthySince,
  };
}

export class Cooperative {
  constructor(readonly db: Database) {}
  async event(
    tx: PoolClient,
    p: string,
    user: string | null,
    kind: string,
    metadata: Record<string, unknown>,
  ) {
    await tx.query(
      "INSERT INTO cooperative_events(pool_id,actor_id,kind,metadata) VALUES($1,$2,$3,$4)",
      [p, user, kind, metadata],
    );
  }
  async list(_user: User) {
    return this.db.transaction(async (tx) => {
      const rows = (
        await tx.query(
          "SELECT * FROM cooperative_pools ORDER BY created_at DESC LIMIT 100",
        )
      ).rows;
      const result = [];
      for (const p of rows) {
        const s = await cooperativeSnapshot(tx, p);
        const recent = (
          await tx.query(
            `SELECT cs.*, (rf.session_id IS NOT NULL) AS refunded FROM cooperative_settlements cs
          LEFT JOIN cooperative_refunds rf ON rf.session_id=cs.session_id WHERE cs.pool_id=$1 ORDER BY cs.created_at DESC LIMIT 20`,
            [p.id],
          )
        ).rows;
        const metrics = (
          await tx.query(
            `SELECT
          coalesce((SELECT sum(s.working_microtu+s.reserve_microtu) FROM cooperative_settlements s
            LEFT JOIN cooperative_refunds rf ON rf.session_id=s.session_id WHERE s.pool_id=$1 AND rf.session_id IS NULL),0)::text AS recycled_microtu,
          coalesce((SELECT sum(l.paid_microtu) FROM cooperative_windows cw JOIN route_availability_leases l ON l.id=cw.lease_id
            WHERE cw.pool_id=$1 AND cw.funding_source='WORKING'),0)::text AS normal_readiness_cost_microtu`,
            [p.id],
          )
        ).rows[0];
        result.push({
          ...p,
          state: s.state,
          groups: s.groups,
          balances: strings({
            working: s.working,
            reserve: s.reserve,
            burned: s.burned,
            held: s.held,
          }),
          targets: strings({
            floor: s.floor,
            working: s.workingTarget,
            reserve: s.reserveTarget,
          }),
          recent_settlements: recent,
          metrics,
          unit: "LAB_TU",
          independent_economic_validation: false,
        });
      }
      return result;
    });
  }
  async create(user: User, body: unknown) {
    const data = z
      .object({
        name: label,
        support_until: z.iso.datetime(),
        idempotency_key: uuid,
        groups: z
          .array(
            z
              .object({
                key,
                route_ids: z.array(uuid).min(1).max(8),
                rate_microtu_per_second: positive,
                duration_seconds: z.number().int().min(30).max(3600),
              })
              .strict(),
          )
          .min(1)
          .max(4),
      })
      .strict()
      .parse(body);
    const digest = hash(canonical(data));
    return this.db.transaction(async (tx) => {
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user.id]);
      const old = (
        await tx.query(
          "SELECT * FROM cooperative_pools WHERE creator_id=$1 AND idempotency_key=$2",
          [user.id, data.idempotency_key],
        )
      ).rows[0];
      if (old) {
        need(
          old.request_sha256 === digest,
          409,
          "idempotency_conflict",
          "Identificador usado com outro plano.",
        );
        return old;
      }
      need(
        new Date(data.support_until).getTime() > Date.now() + 60000 &&
          new Date(data.support_until).getTime() <= Date.now() + 30 * 86400000,
        400,
        "support_window",
        "Confirme apoio operacional entre um minuto e 30 dias.",
      );
      const count = (
        await tx.query(
          "SELECT count(*)::int AS n FROM cooperative_pools WHERE creator_id=$1 AND NOT paused AND support_until>now()",
          [user.id],
        )
      ).rows[0].n;
      need(
        count < 4,
        429,
        "pool_limit",
        "Pause um plano antes de abrir outro.",
      );
      need(
        new Set(data.groups.map((g) => g.key)).size === data.groups.length,
        400,
        "duplicate_group",
        "Cada grupo precisa de um nome único.",
      );
      const domainGroup = new Map<string, string>(),
        routeIds = new Set<string>();
      const frozen = [];
      for (const g of data.groups) {
        const options = [];
        let model: string | undefined;
        for (const id of g.route_ids) {
          need(
            !routeIds.has(id),
            400,
            "duplicate_route",
            "Uma rota não pode duplicar o orçamento do plano.",
          );
          routeIds.add(id);
          const r = (
            await tx.query(
              `SELECT r.*,o.domain_ids FROM execution_routes r JOIN ready_execution_offers o ON o.route_id=r.id WHERE r.id=$1`,
              [id],
            )
          ).rows[0];
          need(
            r,
            409,
            "route_not_ready",
            "O plano exige rotas completas, aceitas e qualificadas.",
          );
          need(
            !model || model === r.model_id,
            400,
            "group_model",
            "Alternativas do mesmo grupo precisam servir o mesmo modelo.",
          );
          model = r.model_id;
          for (const d of r.domain_ids) {
            need(
              !domainGroup.has(d) || domainGroup.get(d) === g.key,
              409,
              "overlapping_coverage",
              "Grupos simultâneos não podem contar a mesma capacidade física.",
            );
            domainGroup.set(d, g.key);
          }
          options.push({ route_id: id, route_sha256: r.route_sha256 });
        }
        frozen.push({
          key: g.key,
          model_id: model!,
          rate_microtu_per_second: g.rate_microtu_per_second,
          duration_seconds: g.duration_seconds,
          routes: options,
        });
      }
      const rate = frozen.reduce(
        (s, g) => s + BigInt(g.rate_microtu_per_second),
        0n,
      );
      need(
        rate * 367200n <= MAX_AMOUNT,
        400,
        "amount_overflow",
        "Os horizontes do plano excedem o limite contábil.",
      );
      const id = randomUUID(),
        working = `coop:${id}:working`,
        reserve = `coop:${id}:reserve`,
        burn = `coop:${id}:burn`;
      const policy = {
        version: cooperativePolicy,
        pool_id: id,
        groups: frozen,
        floor_seconds: 21600,
        working_seconds: 86400,
        reserve_seconds: 259200,
        recovery_seconds: 86400,
        compensation: "READINESS_ONLY",
        recycling: "FLOOR_RESERVE_WORKING_BURN",
        funding: "COMMITTED_LAB_CREDITS_NO_REDEMPTION",
        expansion: "PRIVATE_DEMAND_BACKED_SEPARATE_AUTHORIZATION",
        issuance: "NONE",
        governance: "SINGLE_PRIVATE_COORDINATOR",
      };
      await tx.query(
        "INSERT INTO ledger_accounts(id,kind) VALUES($1,'COOP_WORKING'),($2,'COOP_CORE_RESERVE'),($3,'COOP_BURN')",
        [working, reserve, burn],
      );
      const p = (
        await tx.query(
          `INSERT INTO cooperative_pools(id,creator_id,name,policy,policy_sha256,idempotency_key,request_sha256,
        working_account,reserve_account,burn_account,support_until) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [
            id,
            user.id,
            data.name,
            policy,
            hash(canonical(policy)),
            data.idempotency_key,
            digest,
            working,
            reserve,
            burn,
            data.support_until,
          ],
        )
      ).rows[0];
      for (const g of frozen) {
        await tx.query(
          "INSERT INTO cooperative_groups(pool_id,group_key,model_id,rate_microtu_per_second,duration_seconds) VALUES($1,$2,$3,$4,$5)",
          [
            id,
            g.key,
            g.model_id,
            g.rate_microtu_per_second,
            g.duration_seconds,
          ],
        );
        for (const r of g.routes)
          await tx.query(
            "INSERT INTO cooperative_routes(pool_id,group_key,route_id,route_sha256) VALUES($1,$2,$3,$4)",
            [id, g.key, r.route_id, r.route_sha256],
          );
      }
      await this.event(tx, id, user.id, "created", {
        policy_sha256: p.policy_sha256,
        support_until: data.support_until,
      });
      return p;
    });
  }
  async fund(user: User, id: string, body: unknown) {
    uuid.parse(id);
    const data = z
      .object({
        destination: z.enum(["WORKING", "RESERVE"]),
        amount_microtu: positive,
        policy_sha256: sha256,
        consent: z.literal("COMMITTED_LAB_CREDITS_NO_REDEMPTION"),
        idempotency_key: uuid,
      })
      .strict()
      .parse(body);
    const digest = hash(canonical({ pool_id: id, ...data }));
    return this.db.transaction(async (tx) => {
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user.id]);
      const prior = (
        await tx.query(
          "SELECT * FROM cooperative_funding WHERE user_id=$1 AND idempotency_key=$2",
          [user.id, data.idempotency_key],
        )
      ).rows[0];
      if (prior) {
        need(
          prior.request_sha256 === digest,
          409,
          "idempotency_conflict",
          "Identificador usado com outra contribuição.",
        );
        return prior;
      }
      const p = await locked(tx, id);
      need(
        p.policy_sha256 === data.policy_sha256,
        409,
        "pool_terms",
        "Confira o hash do plano antes de contribuir.",
      );
      need(
        !p.paused && new Date(p.support_until).getTime() > Date.now(),
        409,
        "pool_inactive",
        "O plano está pausado ou sem apoio operacional vigente.",
      );
      const funding = randomUUID(),
        value = BigInt(data.amount_microtu);
      const journal = await post(
        tx,
        `coop-funding:${funding}`,
        "COOPERATIVE_FUNDING",
        [
          [availableAccount(user.id), -value],
          [
            data.destination === "WORKING"
              ? p.working_account
              : p.reserve_account,
            value,
          ],
        ],
        {
          pool_id: id,
          policy_sha256: p.policy_sha256,
          source: "EXISTING_LAB_TU",
          destination: data.destination,
        },
      );
      return (
        await tx.query(
          `INSERT INTO cooperative_funding(id,pool_id,user_id,destination,amount_microtu,policy_sha256,idempotency_key,request_sha256,journal_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [
            funding,
            id,
            user.id,
            data.destination,
            data.amount_microtu,
            p.policy_sha256,
            data.idempotency_key,
            digest,
            journal,
          ],
        )
      ).rows[0];
    });
  }
  async manage(user: User, id: string, body: unknown) {
    uuid.parse(id);
    const data = z
      .object({
        paused: z.boolean(),
        support_until: z.iso.datetime().optional(),
        reason: z.string().trim().min(20).max(500),
      })
      .strict()
      .parse(body);
    return this.db.transaction(async (tx) => {
      const p = await locked(tx, id);
      need(
        p.creator_id === user.id || user.role === "admin",
        403,
        "pool_manager",
        "Somente o responsável pode alterar o apoio operacional.",
      );
      if (data.support_until)
        need(
          new Date(data.support_until).getTime() > Date.now() + 60000 &&
            new Date(data.support_until).getTime() <=
              Date.now() + 30 * 86400000,
          400,
          "support_window",
          "Apoio operacional limitado a 30 dias.",
        );
      const r = (
        await tx.query(
          "UPDATE cooperative_pools SET paused=$2,support_until=coalesce($3,support_until),healthy_since=NULL WHERE id=$1 RETURNING *",
          [id, data.paused, data.support_until ?? null],
        )
      ).rows[0];
      await this.event(tx, id, user.id, "operational_support", {
        ...data,
        accepted_windows_preserved: true,
      });
      return r;
    });
  }
  async offer(user: User, id: string, body: unknown) {
    uuid.parse(id);
    const data = z
      .object({
        group_key: key,
        source: z.enum(["WORKING", "RESERVE"]),
        reason: z.string().trim().min(20).max(500),
        idempotency_key: uuid,
      })
      .strict()
      .parse(body);
    return this.db.transaction((tx) =>
      this.offerTransaction(tx, user, id, data),
    );
  }
  async offerTransaction(
    tx: PoolClient,
    user: User,
    id: string,
    data: {
      group_key: string;
      source: "WORKING" | "RESERVE";
      reason: string;
      idempotency_key: string;
    },
    options?: {
      eligibleRoutes?: string[];
      renewal?: Record<string, unknown>;
      expansion?: Record<string, any>;
    },
  ) {
    const request = hash(
      canonical({
        pool_id: id,
        ...data,
        ...(options?.renewal ? { renewal: options.renewal } : {}),
        ...(options?.expansion ? { expansion: options.expansion } : {}),
      }),
    );
    // Match the standalone sponsor lock order before the pool and ledger locks.
    const info = (
      await tx.query("SELECT creator_id FROM cooperative_pools WHERE id=$1", [
        id,
      ])
    ).rows[0];
    need(info, 404, "pool_missing", "Fundo não encontrado.");
    need(
      info.creator_id === user.id || user.role === "admin",
      403,
      "pool_manager",
      "Somente o responsável pode contratar capacidade.",
    );
    await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
      info.creator_id,
    ]);
    const p = await locked(tx, id);
    const prior = (
      await tx.query(
        "SELECT * FROM route_availability_leases WHERE sponsor_id=$1 AND idempotency_key=$2",
        [p.creator_id, data.idempotency_key],
      )
    ).rows[0];
    if (prior) {
      need(
        prior.terms.cooperative?.request_sha256 === request,
        409,
        "idempotency_conflict",
        "Identificador usado com outros termos.",
      );
      const { writer_xid, ...visible } = prior;
      return visible;
    }
    const s = await cooperativeSnapshot(tx, p),
      g = s.groups.find((v) => v.group_key === data.group_key);
    const kind = options?.expansion ? "EXPANSION" : "ESSENTIAL";
    need(
      kind !== "EXPANSION" ||
        p.policy.expansion === "PRIVATE_DEMAND_BACKED_SEPARATE_AUTHORIZATION",
      409,
      "expansion_policy",
      "A política original deste fundo não permite expansão. Crie um novo plano com os novos termos.",
    );
    need(g, 404, "group_missing", "Grupo não encontrado.");
    need(
      !p.paused &&
        new Date(p.support_until).getTime() >
          Date.now() + (g.duration_seconds + 10) * 1000,
      409,
      "support_window",
      "O apoio operacional não cobre esta janela.",
    );
    const occupied = (
      await tx.query(
        `SELECT 1 FROM cooperative_windows cw JOIN route_availability_leases l ON l.id=cw.lease_id
        WHERE cw.pool_id=$1 AND cw.group_key=$2 AND cw.coverage_kind=$3 AND l.state IN ('OFFERED','ACTIVE','DRAINING')`,
        [id, g.group_key, kind],
      )
    ).rowCount;
    need(
      !occupied,
      409,
      "group_committed",
      "Este grupo já tem uma janela financiada; aguarde o encerramento.",
    );
    const r = (
      await tx.query(
        `SELECT cr.* FROM cooperative_routes cr JOIN ready_execution_offers o ON o.route_id=cr.route_id
        WHERE cr.pool_id=$1 AND cr.group_key=$2 AND ($3::uuid[] IS NULL OR cr.route_id=ANY($3::uuid[])) AND NOT EXISTS(SELECT 1 FROM availability_domain_claims ac WHERE ac.resource_domain_id=ANY(o.domain_ids))
        ORDER BY (SELECT max(l.created_at) FROM cooperative_windows cw JOIN route_availability_leases l ON l.id=cw.lease_id
          WHERE cw.pool_id=$1 AND l.route_id=cr.route_id) ASC NULLS FIRST,cr.route_id LIMIT 1`,
        [id, g.group_key, options?.eligibleRoutes ?? null],
      )
    ).rows[0];
    need(
      r,
      409,
      "route_not_ready",
      "Nenhuma alternativa completa está pronta e livre de outro contrato.",
    );
    const budget =
      BigInt(g.rate_microtu_per_second) * BigInt(g.duration_seconds);
    if (kind === "EXPANSION")
      need(
        data.source === "WORKING" &&
          s.working >= s.floor + budget &&
          s.reserve >= s.reserveTarget &&
          s.state === "NORMAL",
        409,
        "expansion_liquidity",
        "A expansão precisa preservar o piso essencial, a reserva e a recuperação estável.",
      );
    let incident: string | null = null;
    if (data.source === "RESERVE") {
      need(
        s.working < budget,
        409,
        "reserve_protected",
        "Use capital de giro: a reserva só atende uma renovação essencial que ele não consegue financiar.",
      );
      need(
        s.reserve >= budget,
        402,
        "insufficient_credits",
        "Reserva insuficiente para a rota inteira.",
      );
      incident = randomUUID();
      await tx.query(
        `INSERT INTO cooperative_incidents(id,pool_id,group_key,route_id,policy_sha256,budget_microtu,deadline,reason,evidence)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          incident,
          id,
          g.group_key,
          r.route_id,
          p.policy_sha256,
          budget.toString(),
          p.support_until,
          data.reason,
          {
            working_microtu: s.working.toString(),
            state: s.state,
            trigger: "ESSENTIAL_WORKING_SHORTFALL",
            request_sha256: request,
          },
        ],
      );
    }
    const context = {
      pool_id: id,
      group_key: g.group_key,
      policy_sha256: p.policy_sha256,
      funding_source: data.source,
      incident_id: incident,
      request_sha256: request,
      support_until: new Date(p.support_until).toISOString(),
      compensation: "READINESS_ONLY",
      ...(options?.renewal ? { renewal: options.renewal } : {}),
      ...(options?.expansion
        ? {
            coverage_kind: "EXPANSION",
            expansion: options.expansion,
            expansion_sha256: hash(canonical(options.expansion)),
          }
        : {}),
    };
    const lease = await new RouteAvailability(this.db).offerTransaction(
      tx,
      { ...user, id: p.creator_id },
      {
        route_id: r.route_id,
        duration_seconds: g.duration_seconds,
        rate_microtu_per_second: g.rate_microtu_per_second,
        purpose: "SCHEDULED",
        reason: data.reason,
        idempotency_key: data.idempotency_key,
      },
      {
        account:
          data.source === "WORKING" ? p.working_account : p.reserve_account,
        terms: context,
      },
    );
    await tx.query(
      "INSERT INTO cooperative_windows(lease_id,pool_id,group_key,funding_source,incident_id,coverage_kind) VALUES($1,$2,$3,$4,$5,$6)",
      [lease.id, id, g.group_key, data.source, incident, kind],
    );
    await this.event(tx, id, user.id, "window_funded", {
      lease_id: lease.id,
      ...context,
    });
    return lease;
  }
  async reconcile() {
    const ids = (
      await this.db.pool.query(
        "SELECT id FROM cooperative_pools WHERE NOT paused AND support_until>now() OR state<>'HIBERNATING' ORDER BY id",
      )
    ).rows;
    for (const { id } of ids)
      await this.db.transaction(async (tx) => {
        const p = await locked(tx, id),
          s = await cooperativeSnapshot(tx, p);
        await tx.query(
          "UPDATE cooperative_pools SET state=$2,healthy_since=$3,sample_at=clock_timestamp() WHERE id=$1",
          [id, s.state, s.healthySince],
        );
        if (s.state !== p.state)
          await this.event(tx, id, null, "state_changed", {
            from: p.state,
            to: s.state,
          });
      });
  }
  async refund(user: User, id: string, body: unknown) {
    uuid.parse(id);
    need(
      user.role === "admin",
      403,
      "admin_required",
      "Somente a administração pode aprovar uma devolução de consumo liquidado.",
    );
    const data = z
      .object({ reason: z.string().trim().min(20).max(500) })
      .strict()
      .parse(body);
    return this.db.transaction(async (tx) => {
      const session = (
        await tx.query("SELECT * FROM sessions WHERE id=$1 FOR UPDATE", [id])
      ).rows[0];
      const s = (
        await tx.query(
          "SELECT * FROM cooperative_settlements WHERE session_id=$1",
          [id],
        )
      ).rows[0];
      need(
        session && s,
        404,
        "settlement_missing",
        "Consumo cooperativo liquidado não encontrado.",
      );
      const old = (
        await tx.query(
          "SELECT * FROM cooperative_refunds WHERE session_id=$1",
          [id],
        )
      ).rows[0];
      if (old) return old;
      const p = await locked(tx, s.pool_id);
      const j = await post(
        tx,
        `coop-refund:${id}`,
        "COOPERATIVE_CONSUMPTION_REFUND",
        [
          [p.working_account, -BigInt(s.working_microtu)],
          [p.reserve_account, -BigInt(s.reserve_microtu)],
          [p.burn_account, -BigInt(s.burned_microtu)],
          [availableAccount(session.user_id), BigInt(s.charge_microtu)],
        ],
        {
          session_id: id,
          pool_id: p.id,
          reason: data.reason,
          source: "EXACT_ORIGINAL_DESTINATIONS",
          burn_reversal_microtu: s.burned_microtu,
          issuance_microtu: "0",
        },
      );
      const row = (
        await tx.query(
          "INSERT INTO cooperative_refunds(session_id,actor_id,reason,journal_id) VALUES($1,$2,$3,$4) RETURNING *",
          [id, user.id, data.reason, j],
        )
      ).rows[0];
      await tx.query(
        "UPDATE sessions SET billing_state='REFUNDED' WHERE id=$1",
        [id],
      );
      await this.event(tx, p.id, user.id, "consumption_refunded", {
        session_id: id,
        journal_id: j,
      });
      return row;
    });
  }
}

export async function recycleSettlement(
  tx: PoolClient,
  s: Row,
  charge: bigint,
) {
  const p = await locked(tx, s.cooperative_pool_id);
  need(
    p.policy_sha256 === s.cooperative_policy_sha256 && s.coverage_lease_id,
    500,
    "cooperative_context",
    "Contexto cooperativo inconsistente.",
  );
  const snap = await cooperativeSnapshot(tx, p),
    a = recycle(
      charge,
      snap.working,
      snap.reserve,
      snap.floor,
      snap.workingTarget,
      snap.reserveTarget,
    );
  const allocation = {
    policy: p.policy.version,
    before: strings({ working: snap.working, reserve: snap.reserve }),
    targets: strings({
      floor: snap.floor,
      working: snap.workingTarget,
      reserve: snap.reserveTarget,
    }),
    ...strings(a),
    compensation: "READINESS_ONLY",
    issuance_microtu: "0",
  };
  await tx.query(
    `INSERT INTO cooperative_settlements(session_id,pool_id,policy_sha256,coverage_lease_id,charge_microtu,working_microtu,reserve_microtu,burned_microtu,allocation)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      s.id,
      p.id,
      p.policy_sha256,
      s.coverage_lease_id,
      charge.toString(),
      (a.floor + a.working).toString(),
      a.reserve.toString(),
      a.burned.toString(),
      allocation,
    ],
  );
  return {
    lines: [
      [p.working_account, a.floor + a.working],
      [p.reserve_account, a.reserve],
      [p.burn_account, a.burned],
    ] as Array<[string, bigint]>,
    allocation,
  };
}

// Used both for fair-queue eligibility and final selection, so an uncovered
// cooperative request cannot block ordinary requests that do have capacity.
export const cooperativeEligibility = (
  session: string,
  offer: string,
) => `(${session}.cooperative_pool_id IS NULL OR EXISTS(
  SELECT 1 FROM cooperative_windows cw JOIN route_availability_leases l ON l.id=cw.lease_id
  JOIN cooperative_pools cp ON cp.id=cw.pool_id WHERE cw.pool_id=${session}.cooperative_pool_id AND l.route_id=${offer}.route_id
  AND cp.policy_sha256=${session}.cooperative_policy_sha256 AND NOT cp.paused AND cp.support_until>now()
  AND l.state IN ('ACTIVE','DRAINING') AND l.ends_ms>extract(epoch FROM now())*1000+10000
  AND NOT EXISTS(SELECT 1 FROM route_availability_members am WHERE am.lease_id=l.id AND am.withdrawn_at IS NOT NULL)))`;
