// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { createUserSchema, loginSchema } from "@network-ai/contracts";
import type { Config } from "./config.js";
import { Database } from "./db.js";
import { need } from "./errors.js";
import { createAccounts } from "./ledger.js";
import { hash, passwordHash, passwordMatches, secret } from "./security.js";

export interface User {
  id: string;
  login: string;
  name: string;
  role: "admin" | "member";
}
export class Auth {
  constructor(
    readonly db: Database,
    readonly config: Config,
  ) {}
  async authenticate(
    request: FastifyRequest,
    forwarded = false,
  ): Promise<User> {
    const bearer = forwarded
      ? request.headers["x-consumer-authorization"]
      : request.headers.authorization;
    const cookie = forwarded
      ? request.headers["x-consumer-cookie"]
      : request.headers.cookie;
    let result;
    if (typeof bearer === "string" && bearer.startsWith("Bearer nai_")) {
      result = await this.db.pool.query<User>(
        `SELECT u.id,u.login,u.name,u.role FROM api_keys k
        JOIN users u ON u.id=k.user_id WHERE k.token_hash=$1 AND k.revoked_at IS NULL AND NOT u.disabled`,
        [hash(bearer.slice(7))],
      );
    } else {
      const token =
        typeof cookie === "string"
          ? cookie
              .split(";")
              .map((item) => item.trim())
              .find((item) => item.startsWith(`${this.config.cookie_name}=`))
              ?.split("=")[1]
          : undefined;
      need(
        token && token.length <= 100,
        401,
        "authentication_required",
        "Entre na sua conta para continuar.",
      );
      if (!["GET", "HEAD"].includes(request.method)) {
        const origin = forwarded
          ? request.headers["x-consumer-origin"]
          : request.headers.origin;
        need(
          origin === this.config.web_origin,
          403,
          "origin_denied",
          "Origem da solicitação não autorizada.",
        );
      }
      result = await this.db.pool.query<User>(
        `SELECT u.id,u.login,u.name,u.role FROM auth_sessions s
        JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND NOT u.disabled`,
        [hash(token)],
      );
    }
    need(
      result.rowCount === 1,
      401,
      "authentication_required",
      "Sessão expirada ou chave inválida.",
    );
    return result.rows[0]!;
  }
  admin(user: User): void {
    need(
      user.role === "admin",
      403,
      "admin_required",
      "Esta ação requer uma conta administradora.",
    );
  }
  async login(
    body: unknown,
    origin: unknown,
  ): Promise<{ token: string; user: User }> {
    need(
      origin === this.config.web_origin,
      403,
      "origin_denied",
      "Origem da solicitação não autorizada.",
    );
    const data = loginSchema.parse(body);
    const result = await this.db.pool.query<
      User & { password_hash: string; disabled: boolean }
    >("SELECT * FROM users WHERE login=$1", [data.login]);
    const row = result.rows[0];
    // Always perform the same password derivation, including unknown accounts.
    const stored =
      row?.password_hash ??
      "scrypt:unknown-user:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const valid = await passwordMatches(data.password, stored);
    need(
      row && !row.disabled && valid,
      401,
      "invalid_credentials",
      "Usuário ou senha inválidos.",
    );
    const token = secret();
    await this.db.pool.query(
      "INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours')",
      [hash(token), row.id],
    );
    return {
      token,
      user: { id: row.id, login: row.login, name: row.name, role: row.role },
    };
  }
  async logout(request: FastifyRequest): Promise<void> {
    await this.authenticate(request);
    const token = request.cookies[this.config.cookie_name];
    if (token)
      await this.db.pool.query(
        "DELETE FROM auth_sessions WHERE token_hash=$1",
        [hash(token)],
      );
  }
  async createUser(actor: User, body: unknown): Promise<User> {
    this.admin(actor);
    const data = createUserSchema.parse(body);
    const password = await passwordHash(data.password);
    return this.db.transaction(async (tx) => {
      const user = {
        id: randomUUID(),
        login: data.login,
        name: data.name,
        role: data.role,
      };
      await tx.query(
        "INSERT INTO users(id,login,name,role,password_hash) VALUES($1,$2,$3,$4,$5)",
        [user.id, user.login, user.name, user.role, password],
      );
      await createAccounts(tx, user.id);
      await tx.query(
        "INSERT INTO events(actor_id,kind,metadata) VALUES($1,'user_created',$2)",
        [actor.id, { user_id: user.id }],
      );
      return user;
    });
  }
}
