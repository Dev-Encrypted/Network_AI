// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Auth } from "./auth.js";
import { Market } from "./market.js";
import { Nodes } from "./nodes.js";
import { Sessions } from "./sessions.js";
import { Availability } from "./availability.js";
import { RouteAvailability } from "./route-availability.js";
import { Cooperative } from "./cooperative.js";
import { Routes } from "./routes.js";
import { capacity } from "./capacity.js";
import { need } from "./errors.js";
import { same } from "./security.js";

@Controller("api/v1")
export class ApiController {
  constructor(
    @Inject(Auth) readonly auth: Auth,
    @Inject(Market) readonly market: Market,
    @Inject(Nodes) readonly nodes: Nodes,
    @Inject(Sessions) readonly sessions: Sessions,
    @Inject(Availability) readonly availability: Availability,
    @Inject(RouteAvailability) readonly routeAvailability: RouteAvailability,
    @Inject(Cooperative) readonly cooperative: Cooperative,
    @Inject(Routes) readonly routes: Routes,
  ) {}
  internal(req: FastifyRequest) {
    need(
      typeof req.headers["x-gateway-secret"] === "string" &&
        same(req.headers["x-gateway-secret"], this.auth.config.gateway_secret),
      401,
      "gateway_auth",
      "Gateway não autorizado.",
    );
  }
  @Get("health") async health() {
    await this.auth.db.pool.query("SELECT 1");
    return {
      status: "ok",
      mode: "private_lab",
      protocol: "network-ai.private.v1",
      unit: "LAB_TU",
    };
  }
  @Post("auth/login") async login(
    @Req() req: FastifyRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const result = await this.auth.login(body, req.headers.origin);
    res.setCookie(this.auth.config.cookie_name, result.token, {
      httpOnly: true,
      sameSite: "strict",
      secure: false,
      path: "/",
      maxAge: 43200,
    });
    return { user: result.user };
  }
  @Post("auth/logout") async logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    await this.auth.logout(req);
    res.clearCookie(this.auth.config.cookie_name, { path: "/" });
    return { ok: true };
  }
  @Get("me") async me(@Req() req: FastifyRequest) {
    return this.auth.authenticate(req);
  }
  @Get("models") async models(@Req() req: FastifyRequest) {
    await this.auth.authenticate(req);
    return { data: await this.market.models() };
  }
  @Get("capacity/:model") async capacity(
    @Req() req: FastifyRequest,
    @Param("model") model: string,
  ) {
    const user = await this.auth.authenticate(req);
    return capacity(this.auth.db.pool, model, user.id);
  }
  @Get("routes") async listRoutes(@Req() req: FastifyRequest) {
    return { data: await this.routes.list(await this.auth.authenticate(req)) };
  }
  @Post("routes") async publishRoute(
    @Req() req: FastifyRequest,
    @Body() body: unknown,
  ) {
    return this.routes.publish(await this.auth.authenticate(req), body);
  }
  @Post("routes/:id/accept") async acceptRoute(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.routes.accept(await this.auth.authenticate(req), id, body);
  }
  @Post("routes/:id/withdraw") async withdrawRoute(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
  ) {
    return this.routes.withdraw(await this.auth.authenticate(req), id);
  }
  @Post("admin/routes/:id/qualify") async qualifyRoute(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.routes.qualify(await this.auth.authenticate(req), id, body);
  }
  @Get("availability/leases") async leases(@Req() req: FastifyRequest) {
    return {
      data: await this.availability.list(await this.auth.authenticate(req)),
    };
  }
  @Get("cooperative/pools") async pools(@Req() req: FastifyRequest) {
    return {
      data: await this.cooperative.list(await this.auth.authenticate(req)),
    };
  }
  @Post("cooperative/pools") async createPool(
    @Req() req: FastifyRequest,
    @Body() body: unknown,
  ) {
    return this.cooperative.create(await this.auth.authenticate(req), body);
  }
  @Post("cooperative/pools/:id/fund") async fundPool(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.cooperative.fund(await this.auth.authenticate(req), id, body);
  }
  @Post("cooperative/pools/:id/windows") async poolWindow(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.cooperative.offer(await this.auth.authenticate(req), id, body);
  }
  @Post("cooperative/pools/:id/manage") async managePool(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.cooperative.manage(await this.auth.authenticate(req), id, body);
  }
  @Post("cooperative/refunds/:id") async refundCooperation(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.cooperative.refund(await this.auth.authenticate(req), id, body);
  }
  @Get("availability/routes") async routeLeases(@Req() req: FastifyRequest) {
    return {
      data: await this.routeAvailability.list(
        await this.auth.authenticate(req),
      ),
    };
  }
  @Post("availability/routes") async offerRouteLease(
    @Req() req: FastifyRequest,
    @Body() body: unknown,
  ) {
    return this.routeAvailability.offer(
      await this.auth.authenticate(req),
      body,
    );
  }
  @Post("availability/routes/:id/accept") async acceptRouteLease(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.routeAvailability.accept(
      await this.auth.authenticate(req),
      id,
      body,
    );
  }
  @Post("availability/routes/:id/cancel") async cancelRouteLease(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
  ) {
    return this.routeAvailability.cancel(await this.auth.authenticate(req), id);
  }
  @Post("availability/leases") async offerLease(
    @Req() req: FastifyRequest,
    @Body() body: unknown,
  ) {
    return this.availability.offer(await this.auth.authenticate(req), body);
  }
  @Post("availability/leases/:id/accept") async acceptLease(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
  ) {
    return this.availability.accept(await this.auth.authenticate(req), id);
  }
  @Post("availability/leases/:id/cancel") async cancelLease(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
  ) {
    return this.availability.cancel(await this.auth.authenticate(req), id);
  }
  @Post("models") async publish(
    @Req() req: FastifyRequest,
    @Body() body: unknown,
  ) {
    return this.market.publish(await this.auth.authenticate(req), body);
  }
  @Post("quotes") async quote(
    @Req() req: FastifyRequest,
    @Body() body: unknown,
  ) {
    return this.market.quote(await this.auth.authenticate(req), body);
  }
  @Get("wallet") async wallet(@Req() req: FastifyRequest) {
    return this.market.wallet(await this.auth.authenticate(req));
  }
  @Get("sessions") async list(@Req() req: FastifyRequest) {
    return {
      data: await this.sessions.list(await this.auth.authenticate(req)),
    };
  }
  @Get("sessions/:id") async session(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
  ) {
    return this.sessions.get(await this.auth.authenticate(req), id);
  }
  @Post("sessions/:id/cancel") async cancel(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
  ) {
    return this.sessions.cancel(await this.auth.authenticate(req), id);
  }
  @Get("keys") async keys(@Req() req: FastifyRequest) {
    return { data: await this.market.keys(await this.auth.authenticate(req)) };
  }
  @Post("keys") async key(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.market.newKey(await this.auth.authenticate(req), body);
  }
  @Delete("keys/:id") async revokeKey(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
  ) {
    return this.market.revokeKey(await this.auth.authenticate(req), id);
  }
  @Get("nodes") async listNodes(@Req() req: FastifyRequest) {
    return { data: await this.market.nodes(await this.auth.authenticate(req)) };
  }
  @Post("nodes/:id/state") async nodeState(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.market.nodeState(await this.auth.authenticate(req), id, body);
  }
  @Post("admin/users") async user(
    @Req() req: FastifyRequest,
    @Body() body: unknown,
  ) {
    return this.auth.createUser(await this.auth.authenticate(req), body);
  }
  @Get("admin/users") async users(@Req() req: FastifyRequest) {
    this.auth.admin(await this.auth.authenticate(req));
    return {
      data: (
        await this.auth.db.pool.query(
          "SELECT id,login,name,role,disabled,created_at FROM users ORDER BY created_at",
        )
      ).rows,
    };
  }
  @Post("admin/grants") async grant(
    @Req() req: FastifyRequest,
    @Body() body: unknown,
  ) {
    return this.market.grant(await this.auth.authenticate(req), body);
  }
  @Post("admin/domains") async domain(
    @Req() req: FastifyRequest,
    @Body() body: unknown,
  ) {
    return this.market.domain(await this.auth.authenticate(req), body);
  }
  @Get("admin/domains") async domains(@Req() req: FastifyRequest) {
    this.auth.admin(await this.auth.authenticate(req));
    return {
      data: (
        await this.auth.db.pool.query(
          "SELECT * FROM resource_domains ORDER BY created_at",
        )
      ).rows,
    };
  }
  @Post("admin/node-invites") async invite(
    @Req() req: FastifyRequest,
    @Body() body: unknown,
  ) {
    return this.market.invite(await this.auth.authenticate(req), body);
  }
  @Post("admin/models/:id/qualify") async qualify(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.market.qualify(await this.auth.authenticate(req), id, body);
  }
  @Get("admin/metrics") async metrics(@Req() req: FastifyRequest) {
    this.auth.admin(await this.auth.authenticate(req));
    const [states, ledger, nodes] = await Promise.all([
      this.auth.db.pool.query(
        "SELECT state,count(*)::int AS count FROM sessions GROUP BY state",
      ),
      this.auth.db.pool.query(
        "SELECT coalesce(sum(balance),0)::text AS total,(SELECT count(*)::int FROM journal) AS entries FROM ledger_accounts",
      ),
      this.auth.db.pool.query(
        "SELECT count(*) FILTER(WHERE last_seen>now()-interval '15 seconds' AND state='READY')::int AS ready,count(DISTINCT resource_domain_id)::int AS domains FROM nodes",
      ),
    ]);
    return {
      sessions: states.rows,
      ledger: ledger.rows[0],
      nodes: nodes.rows[0],
    };
  }
  @Post("nodes/register") async register(@Body() body: unknown) {
    return this.nodes.register(body);
  }
  @Post("nodes/:id/resume") async resume(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    await this.nodes.signed(req, id);
    return this.nodes.resume(id, body);
  }
  @Post("nodes/:id/heartbeat") async heartbeat(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    await this.nodes.signed(req, id);
    return this.nodes.heartbeat(id, body);
  }
  @Post("nodes/:id/claim") async claim(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    await this.nodes.signed(req, id);
    return this.sessions.claim(id, body);
  }
  @Post("nodes/:id/receipts") async receipt(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    await this.nodes.signed(req, id);
    return this.sessions.receipt(id, body);
  }
  @Post("nodes/:id/stage-claim") async stageClaim(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    await this.nodes.signed(req, id);
    return this.sessions.stageClaim(id, body);
  }
  @Post("nodes/:id/stage-receipts") async stageReceipt(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    await this.nodes.signed(req, id);
    return this.sessions.stageReceipt(id, body);
  }
  @Post("internal/sessions") async create(
    @Req() req: FastifyRequest,
    @Body() body: unknown,
  ) {
    this.internal(req);
    return this.sessions.create(await this.auth.authenticate(req, true), body);
  }
  @Post("internal/sessions/:id/admit") async admit(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
  ) {
    this.internal(req);
    return this.sessions.admit(id);
  }
  @Post("internal/sessions/:id/authorize") async authorize(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    this.internal(req);
    return this.sessions.authorize(id, body);
  }
  @Post("internal/sessions/:id/fail") async fail(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    this.internal(req);
    return this.sessions.fail(id, body);
  }
  @Get("internal/sessions/:id") async status(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
  ) {
    this.internal(req);
    return this.sessions.status(id);
  }
}
