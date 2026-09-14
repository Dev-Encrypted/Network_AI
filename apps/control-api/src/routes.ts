// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { label, sha256, uuid } from "@network-ai/contracts";
import { Auth, type User } from "./auth.js";
import { Database } from "./db.js";
import { need } from "./errors.js";
import { canonical, hash } from "./security.js";

export class Routes {
  constructor(
    readonly db: Database,
    readonly auth: Auth,
  ) {}

  async list(user: User) {
    return (
      await this.db.pool.query(
        `SELECT r.*,EXISTS(SELECT 1 FROM ready_execution_offers o WHERE o.route_id=r.id) AS available,
      (SELECT jsonb_agg(jsonb_build_object('node_id',rm.node_id,'provider_id',rm.provider_id,'role',rm.role,
        'resource_domain_id',rm.resource_domain_id,'share_bps',rm.share_bps,'ordinal',rm.ordinal,
        'node_name',n.name,'provider_name',u.name,'domain_name',d.name,
        'withdrawn',a.withdrawn_at IS NOT NULL,
        'accepted',a.provider_id IS NOT NULL AND a.withdrawn_at IS NULL) ORDER BY rm.ordinal)
        FROM route_members rm JOIN nodes n ON n.id=rm.node_id JOIN users u ON u.id=rm.provider_id
        JOIN resource_domains d ON d.id=rm.resource_domain_id
        LEFT JOIN route_acceptances a ON a.route_id=rm.route_id AND a.provider_id=rm.provider_id
        WHERE rm.route_id=r.id) AS participants
      FROM execution_routes r WHERE $2 OR r.publisher_id=$1 OR r.state='LOCAL_PREVIEW'
        OR EXISTS(SELECT 1 FROM route_members rm WHERE rm.route_id=r.id AND rm.provider_id=$1)
      ORDER BY r.created_at DESC LIMIT 100`,
        [user.id, user.role === "admin"],
      )
    ).rows.map(({ writer_xid, ...row }) => row);
  }

  async publish(user: User, body: unknown) {
    const data = z
      .object({
        name: label,
        model_id: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,79}$/),
        idempotency_key: uuid,
        participants: z
          .array(
            z
              .object({
                node_id: uuid,
                share_bps: z.number().int().min(1).max(10000),
              })
              .strict(),
          )
          .min(2)
          .max(16),
      })
      .strict()
      .parse(body);
    need(
      new Set(data.participants.map((p) => p.node_id)).size ===
        data.participants.length &&
        data.participants.reduce((n, p) => n + p.share_bps, 0) === 10000,
      400,
      "route_shares",
      "A rota precisa de nós distintos e participação total de 10.000 pontos-base.",
    );
    const digest = hash(canonical(data));
    return this.db.transaction(async (tx) => {
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user.id]);
      const existing = (
        await tx.query(
          "SELECT id,route_sha256,request_sha256,state FROM execution_routes WHERE publisher_id=$1 AND idempotency_key=$2",
          [user.id, data.idempotency_key],
        )
      ).rows[0];
      if (existing) {
        need(
          existing.request_sha256 === digest,
          409,
          "idempotency_conflict",
          "Identificador usado com outros termos.",
        );
        return existing;
      }
      const count = (
        await tx.query(
          "SELECT count(*)::int AS n FROM execution_routes WHERE publisher_id=$1 AND state<>'REVOKED'",
          [user.id],
        )
      ).rows[0].n;
      need(
        count < 32,
        429,
        "route_limit",
        "Encerre uma rota antes de publicar outra.",
      );
      const model = (
        await tx.query(
          "SELECT manifest_sha256 FROM models WHERE id=$1 AND state='LOCAL_PREVIEW'",
          [data.model_id],
        )
      ).rows[0];
      need(
        model,
        409,
        "model_unavailable",
        "Qualifique o modelo antes de propor uma rota.",
      );
      const rows = (
        await tx.query(
          `SELECT n.*,u.disabled FROM nodes n JOIN users u ON u.id=n.owner_id
        WHERE n.id=ANY($1::uuid[]) ORDER BY n.id FOR SHARE OF n`,
          [data.participants.map((p) => p.node_id)],
        )
      ).rows;
      const members = data.participants.map((p, ordinal) => {
        const node = rows.find((n) => n.id === p.node_id);
        need(
          node &&
            !node.disabled &&
            node.model_id === data.model_id &&
            node.desired_state !== "REVOKED" &&
            node.node_kind === (ordinal === 0 ? "ROUTE_ROOT" : "RPC_STAGE"),
          409,
          "route_node",
          "Nó incompatível com o modelo ou a função na rota.",
        );
        if (ordinal === 0)
          need(
            node.owner_id === user.id,
            403,
            "route_owner",
            "Somente o dono do nó principal pode propor a rota.",
          );
        return {
          node_id: node.id,
          provider_id: node.owner_id,
          resource_domain_id: node.resource_domain_id,
          ordinal,
          role: ordinal === 0 ? "ROOT" : "STAGE",
          share_bps: p.share_bps,
        };
      });
      const id = randomUUID();
      const terms = {
        protocol: "private-rpc-route-v1",
        route_id: id,
        model_id: data.model_id,
        manifest_sha256: model.manifest_sha256,
        participants: members,
        provider_pool_bps: 8000,
      };
      const routeHash = hash(canonical(terms));
      await tx.query(
        `INSERT INTO execution_routes(id,publisher_id,name,model_id,manifest_sha256,root_node_id,
        route_sha256,terms,idempotency_key,request_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          id,
          user.id,
          data.name,
          data.model_id,
          model.manifest_sha256,
          members[0]!.node_id,
          routeHash,
          terms,
          data.idempotency_key,
          digest,
        ],
      );
      for (const p of members)
        await tx.query(
          `INSERT INTO route_members(route_id,node_id,provider_id,resource_domain_id,ordinal,role,share_bps)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [
            id,
            p.node_id,
            p.provider_id,
            p.resource_domain_id,
            p.ordinal,
            p.role,
            p.share_bps,
          ],
        );
      await this.event(tx, user.id, "route_proposed", {
        route_id: id,
        route_sha256: routeHash,
      });
      return { id, route_sha256: routeHash, state: "CANDIDATE", terms };
    });
  }

  async accept(user: User, id: string, body: unknown) {
    uuid.parse(id);
    const data = z.object({ route_sha256: sha256 }).strict().parse(body);
    return this.db.transaction(async (tx) => {
      const route = (
        await tx.query(
          `SELECT r.* FROM execution_routes r WHERE r.id=$1 AND r.state<>'REVOKED'
        AND EXISTS(SELECT 1 FROM route_members m WHERE m.route_id=r.id AND m.provider_id=$2) FOR UPDATE`,
          [id, user.id],
        )
      ).rows[0];
      need(
        route,
        404,
        "route_missing",
        "Rota não encontrada para este operador.",
      );
      need(
        route.route_sha256 === data.route_sha256,
        409,
        "route_terms",
        "A assinatura dos termos da rota difere da revisada.",
      );
      const old = (
        await tx.query(
          "SELECT * FROM route_acceptances WHERE route_id=$1 AND provider_id=$2",
          [id, user.id],
        )
      ).rows[0];
      need(
        !old?.withdrawn_at,
        409,
        "route_withdrawn",
        "Esta participação foi retirada; uma nova proposta é necessária.",
      );
      if (!old) {
        await tx.query(
          "INSERT INTO route_acceptances(route_id,provider_id,route_sha256) VALUES($1,$2,$3)",
          [id, user.id, data.route_sha256],
        );
        await this.event(tx, user.id, "route_accepted", {
          route_id: id,
          route_sha256: data.route_sha256,
        });
      }
      return { accepted: true, route_id: id };
    });
  }

  async withdraw(user: User, id: string) {
    uuid.parse(id);
    return this.db.transaction(async (tx) => {
      const row = (
        await tx.query(
          "UPDATE route_acceptances SET withdrawn_at=coalesce(withdrawn_at,now()) WHERE route_id=$1 AND provider_id=$2 RETURNING route_id",
          [id, user.id],
        )
      ).rows[0];
      need(row, 404, "route_missing", "Participação não encontrada.");
      await this.event(tx, user.id, "route_withdrawn", {
        route_id: id,
        accepted_sessions_preserved: true,
      });
      return { withdrawn: true, route_id: id };
    });
  }

  async qualify(user: User, id: string, body: unknown) {
    this.auth.admin(user);
    uuid.parse(id);
    const data = z
      .object({
        state: z.enum(["LOCAL_PREVIEW", "REVOKED"]),
        note: z.string().min(20).max(1000),
      })
      .strict()
      .parse(body);
    return this.db.transaction(async (tx) => {
      const route = (
        await tx.query(
          "SELECT * FROM execution_routes WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      need(
        route && route.state !== "REVOKED",
        404,
        "route_missing",
        "Rota inexistente ou encerrada.",
      );
      if (data.state === "LOCAL_PREVIEW") {
        await tx.query("SELECT id FROM nodes WHERE id=$1 FOR UPDATE", [
          route.root_node_id,
        ]);
        const other = await tx.query(
          "SELECT id FROM execution_routes WHERE root_node_id=$1 AND state='LOCAL_PREVIEW' AND id<>$2",
          [route.root_node_id, id],
        );
        need(
          !other.rowCount,
          409,
          "route_root_in_use",
          "Encerre a rota anterior deste nó principal antes de qualificar a nova proposta.",
        );
        const missing = (
          await tx.query(
            `SELECT 1 FROM route_members m LEFT JOIN route_acceptances a ON a.route_id=m.route_id AND a.provider_id=m.provider_id
          WHERE m.route_id=$1 AND (a.provider_id IS NULL OR a.withdrawn_at IS NOT NULL OR a.route_sha256<>$2) LIMIT 1`,
            [id, route.route_sha256],
          )
        ).rowCount;
        need(
          !missing,
          409,
          "route_consent",
          "Todos os operadores precisam aceitar os mesmos termos.",
        );
      }
      await tx.query(
        "UPDATE execution_routes SET state=$2,qualification_note=$3 WHERE id=$1",
        [id, data.state, data.note],
      );
      await this.event(tx, user.id, "route_qualification", {
        route_id: id,
        ...data,
      });
      return { id, state: data.state };
    });
  }

  private async event(
    tx: import("pg").PoolClient,
    actor: string,
    kind: string,
    metadata: Record<string, unknown>,
  ) {
    await tx.query(
      "INSERT INTO events(actor_id,kind,metadata) VALUES($1,$2,$3)",
      [actor, kind, metadata],
    );
  }
}
