// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  amount,
  label,
  modelManifestSchema,
  quoteMaximum,
  quoteSchema,
  uuid,
} from "@network-ai/contracts";
import { Auth, type User } from "./auth.js";
import { Database } from "./db.js";
import { need } from "./errors.js";
import { availableAccount, post } from "./ledger.js";
import { canonical, hash, loopbackNodeUrl, secret } from "./security.js";

export class Market {
  constructor(
    readonly db: Database,
    readonly auth: Auth,
  ) {}
  async models() {
    return (
      await this.db.pool
        .query(`SELECT m.id,m.manifest,m.manifest_sha256,m.state,m.qualification_note,
      count(n.root_node_id)::int AS ready_nodes FROM models m LEFT JOIN ready_execution_offers n ON n.model_id=m.id
      GROUP BY m.id ORDER BY m.created_at`)
    ).rows.map((row) => ({
      ...row,
      available: row.state === "LOCAL_PREVIEW" && row.ready_nodes > 0,
    }));
  }
  async publish(user: User, body: unknown) {
    const manifest = modelManifestSchema.parse(body);
    const digest = hash(canonical(manifest));
    await this.db.pool.query(
      "INSERT INTO models(id,manifest,manifest_sha256,state,publisher_id) VALUES($1,$2,$3,'CANDIDATE',$4)",
      [manifest.model_id, manifest, digest, user.id],
    );
    return {
      id: manifest.model_id,
      manifest_sha256: digest,
      state: "CANDIDATE",
    };
  }
  async qualify(user: User, id: string, body: unknown) {
    this.auth.admin(user);
    const data = z
      .object({
        state: z.enum(["LOCAL_PREVIEW", "REVOKED"]),
        note: z.string().min(20).max(1000),
      })
      .strict()
      .parse(body);
    return this.db.transaction(async (tx) => {
      const result = await tx.query(
        "UPDATE models SET state=$2,qualification_note=$3 WHERE id=$1 RETURNING id,state",
        [id, data.state, data.note],
      );
      need(result.rowCount, 404, "model_missing", "Modelo não encontrado.");
      await tx.query(
        "INSERT INTO events(actor_id,kind,metadata) VALUES($1,'model_qualification',$2)",
        [user.id, { model_id: id, ...data }],
      );
      return result.rows[0];
    });
  }
  async quote(user: User, body: unknown) {
    const data = quoteSchema.parse(body);
    const result = await this.db.pool.query(
      "SELECT * FROM models WHERE id=$1 AND state='LOCAL_PREVIEW'",
      [data.model],
    );
    need(
      result.rowCount,
      404,
      "model_unavailable",
      "Modelo não habilitado para o laboratório.",
    );
    const row = result.rows[0]!;
    const manifest = modelManifestSchema.parse(row.manifest);
    need(
      data.max_output_tokens <= manifest.max_output_tokens,
      400,
      "output_limit",
      "Saída acima do limite deste modelo.",
    );
    const maximum = quoteMaximum(manifest, data.max_output_tokens);
    const pool = data.cooperative_pool_id
      ? (
          await this.db.pool.query(
            `SELECT p.* FROM cooperative_pools p
      WHERE p.id=$1 AND NOT p.paused AND p.support_until>now() AND EXISTS(SELECT 1 FROM cooperative_groups g WHERE g.pool_id=p.id AND g.model_id=$2)`,
            [data.cooperative_pool_id, data.model],
          )
        ).rows[0]
      : null;
    need(
      !data.cooperative_pool_id || pool,
      409,
      "pool_unavailable",
      "Este plano não oferece o modelo ou está sem apoio operacional.",
    );
    const id = randomUUID();
    const quote = await this.db.pool.query(
      `INSERT INTO quotes(id,user_id,model_id,manifest,manifest_sha256,max_output_tokens,maximum_microtu,expires_at,cooperative_pool_id,cooperative_policy_sha256)
      VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '60 seconds',$8,$9) RETURNING *`,
      [
        id,
        user.id,
        data.model,
        manifest,
        row.manifest_sha256,
        data.max_output_tokens,
        maximum.toString(),
        pool?.id ?? null,
        pool?.policy_sha256 ?? null,
      ],
    );
    return {
      ...quote.rows[0],
      unit: "LAB_TU",
      metering: "engine_reported",
      reservation_policy: "context_upper_bound",
      compensation: pool ? "READINESS_ONLY" : "INFERENCE_80_20",
      consumption_destination: pool
        ? "COOPERATIVE_POOL"
        : "PROVIDERS_AND_LAB_WORKING",
    };
  }
  async wallet(user: User) {
    const [accounts, journal] = await Promise.all([
      this.db.pool.query(
        "SELECT kind,balance,unit FROM ledger_accounts WHERE owner_id=$1 ORDER BY kind",
        [user.id],
      ),
      this.db.pool.query(
        `SELECT j.id,j.kind,j.metadata,j.created_at,l.account_id,l.amount FROM journal j
        JOIN journal_lines l ON l.journal_id=j.id JOIN ledger_accounts a ON a.id=l.account_id
        WHERE a.owner_id=$1 ORDER BY j.created_at DESC,j.id LIMIT 100`,
        [user.id],
      ),
    ]);
    return {
      unit: "LAB_TU",
      network: "network-ai-private-lab",
      redeemable: false,
      accounts: accounts.rows,
      journal: journal.rows,
    };
  }
  async keys(user: User) {
    return (
      await this.db.pool.query(
        "SELECT id,prefix,label,revoked_at,created_at FROM api_keys WHERE user_id=$1 ORDER BY created_at DESC",
        [user.id],
      )
    ).rows;
  }
  async newKey(user: User, body: unknown) {
    const data = z.object({ label }).strict().parse(body);
    const token = `nai_${secret()}`;
    const id = randomUUID();
    const count = await this.db.pool.query(
      "SELECT count(*)::int AS n FROM api_keys WHERE user_id=$1 AND revoked_at IS NULL",
      [user.id],
    );
    need(
      count.rows[0].n < 20,
      409,
      "key_limit",
      "Revogue uma chave antes de criar outra.",
    );
    await this.db.pool.query(
      "INSERT INTO api_keys(id,user_id,token_hash,prefix,label) VALUES($1,$2,$3,$4,$5)",
      [id, user.id, hash(token), token.slice(0, 12), data.label],
    );
    return { id, token, label: data.label };
  }
  async revokeKey(user: User, id: string) {
    uuid.parse(id);
    const result = await this.db.pool.query(
      "UPDATE api_keys SET revoked_at=coalesce(revoked_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id",
      [id, user.id],
    );
    need(result.rowCount, 404, "key_missing", "Chave não encontrada.");
    return { revoked: true };
  }
  async grant(user: User, body: unknown) {
    this.auth.admin(user);
    const data = z
      .object({
        user_id: uuid,
        amount_microtu: amount,
        idempotency_key: uuid,
        reason: z.string().min(10).max(200),
      })
      .strict()
      .parse(body);
    const value = BigInt(data.amount_microtu);
    need(
      value > 0n && value <= 1000_000_000n,
      400,
      "grant_limit",
      "A concessão de teste deve ficar entre 0 e 1.000 LAB_TU.",
    );
    const id = await this.db.transaction(async (tx) => {
      const previous = await tx.query(
        "SELECT metadata FROM journal WHERE business_key=$1",
        [`grant:${data.idempotency_key}`],
      );
      if (previous.rowCount)
        need(
          canonical(previous.rows[0].metadata) === canonical(data),
          409,
          "idempotency_conflict",
          "Identificador já utilizado com outros dados.",
        );
      return post(
        tx,
        `grant:${data.idempotency_key}`,
        "LAB_GRANT",
        [
          ["lab:issuer", -value],
          [availableAccount(data.user_id), value],
        ],
        data,
      );
    });
    return { journal_id: id, unit: "LAB_TU" };
  }
  async nodes(user: User) {
    return (
      await this.db.pool.query(
        `SELECT n.*,d.name AS domain_name,d.slots,
      (n.last_seen>now()-interval '15 seconds') AS online FROM nodes n JOIN resource_domains d ON d.id=n.resource_domain_id
      WHERE ($1::boolean OR n.owner_id=$2) ORDER BY n.created_at`,
        [user.role === "admin", user.id],
      )
    ).rows;
  }
  async domain(user: User, body: unknown) {
    this.auth.admin(user);
    const data = z
      .object({
        name: label,
        owner_id: uuid,
        slots: z.number().int().min(1).max(16),
      })
      .strict()
      .parse(body);
    const id = randomUUID();
    await this.db.pool.query(
      "INSERT INTO resource_domains(id,name,owner_id,slots) VALUES($1,$2,$3,$4)",
      [id, data.name, data.owner_id, data.slots],
    );
    return { id, ...data };
  }
  async invite(user: User, body: unknown) {
    this.auth.admin(user);
    const data = z
      .object({
        name: label,
        owner_id: uuid,
        resource_domain_id: uuid,
        model_id: z.string().max(80),
        base_url: z.url(),
        node_kind: z
          .enum(["INFERENCE", "ROUTE_ROOT", "RPC_STAGE"])
          .default("INFERENCE"),
      })
      .strict()
      .parse(body);
    const url = loopbackNodeUrl(data.base_url);
    const token = secret();
    const id = randomUUID();
    await this.db.transaction(async (tx) => {
      const domain = await tx.query(
        "SELECT id FROM resource_domains WHERE id=$1 AND owner_id=$2",
        [data.resource_domain_id, data.owner_id],
      );
      need(
        domain.rowCount,
        400,
        "domain_owner",
        "Domínio físico não pertence ao operador informado.",
      );
      await tx.query(
        "INSERT INTO nodes(id,owner_id,name,resource_domain_id,model_id,base_url,node_kind) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          id,
          data.owner_id,
          data.name,
          data.resource_domain_id,
          data.model_id,
          url,
          data.node_kind,
        ],
      );
      await tx.query(
        "INSERT INTO node_invites(token_hash,node_id,expires_at) VALUES($1,$2,now()+interval '24 hours')",
        [hash(token), id],
      );
    });
    return {
      id,
      invite: token,
      expires_in: 86400,
      operator: {
        schema_version: 1,
        node_kind: data.node_kind,
        capability_public_key: this.auth.config.capability_public_key,
        control_port: this.auth.config.control_port,
        gateway_port: this.auth.config.gateway_port,
        web_origin: this.auth.config.web_origin,
      },
    };
  }
  async nodeState(user: User, id: string, body: unknown) {
    uuid.parse(id);
    const data = z
      .object({ state: z.enum(["READY", "PAUSED", "REVOKED"]) })
      .strict()
      .parse(body);
    const result = await this.db.pool.query(
      `UPDATE nodes SET desired_state=$3,state=CASE WHEN $3='REVOKED' THEN 'REVOKED' ELSE state END
      WHERE id=$1 AND ($4::boolean OR owner_id=$2) AND desired_state<>'REVOKED' RETURNING id,desired_state`,
      [id, user.id, data.state, user.role === "admin"],
    );
    need(
      result.rowCount,
      404,
      "node_missing",
      "Nó não encontrado ou já revogado.",
    );
    return result.rows[0];
  }
}
