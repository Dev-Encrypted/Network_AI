// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import "reflect-metadata";
import {
  Module,
  type ArgumentsHost,
  type ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { readConfig } from "./config.js";
import { Database } from "./db.js";
import { Auth } from "./auth.js";
import { Market } from "./market.js";
import { Nodes } from "./nodes.js";
import { Sessions } from "./sessions.js";
import { ApiController } from "./controller.js";
import { AppError } from "./errors.js";

const config = readConfig();
const db = new Database(config.database_url);
const auth = new Auth(db, config);
const sessions = new Sessions(db, config);
@Module({
  controllers: [ApiController],
  providers: [
    { provide: Auth, useValue: auth },
    { provide: Market, useValue: new Market(db, auth) },
    { provide: Nodes, useValue: new Nodes(db) },
    { provide: Sessions, useValue: sessions },
  ],
})
class AppModule {}
class Filter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    if (error instanceof AppError)
      return reply
        .status(error.status)
        .send({ error: { code: error.code, message: error.message } });
    if (error instanceof ZodError)
      return reply.status(400).send({
        error: {
          code: "invalid_request",
          message: "Confira os campos enviados.",
          fields: error.issues.map((issue) => issue.path.join(".")),
        },
      });
    if ((error as { code?: string }).code === "23505")
      return reply.status(409).send({
        error: {
          code: "already_exists",
          message: "Já existe um registro com este identificador.",
        },
      });
    if ((error as { code?: string }).code === "23503")
      return reply.status(400).send({
        error: {
          code: "reference_missing",
          message: "Registro relacionado não encontrado.",
        },
      });
    if (error instanceof HttpException)
      return reply.status(error.getStatus()).send({
        error: {
          code: "http_error",
          message:
            error.getStatus() === 404
              ? "Rota não encontrada."
              : "Solicitação rejeitada.",
        },
      });
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && [400, 413, 415, 429].includes(statusCode))
      return reply
        .status(statusCode)
        .send({
          error: {
            code: "invalid_request",
            message: "Solicitação inválida ou acima do limite permitido.",
          },
        });
    process.stderr.write(
      `Control failure: ${(error as { code?: string }).code ?? "internal_error"}\n`,
    );
    return reply.status(500).send({
      error: {
        code: "internal_error",
        message: "Não foi possível concluir a operação.",
      },
    });
  }
}
const adapter = new FastifyAdapter({
  logger: false,
  bodyLimit: 131072,
  requestTimeout: 15000,
});
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  adapter,
  { logger: ["error", "warn"], bodyParser: false },
);
const server = adapter.getInstance();
server.removeContentTypeParser("application/json");
server.addContentTypeParser(
  "application/json",
  { parseAs: "buffer", bodyLimit: 131072 },
  (req, body, done) => {
    (req as FastifyRequest & { rawBody: Buffer }).rawBody = body as Buffer;
    try {
      done(null, JSON.parse((body as Buffer).toString("utf8")));
    } catch {
      done(Object.assign(new Error("Invalid JSON"), { statusCode: 400 }));
    }
  },
);
server.addHook("onRoute", (options) => {
  if (options.url.endsWith("/auth/login"))
    options.config = {
      ...options.config,
      rateLimit: { max: 10, timeWindow: "1 minute" },
    };
});
await app.register(cookie);
await app.register(rateLimit, { max: 3000, timeWindow: "1 minute" });
server.addHook("onSend", async (_req, reply, payload) => {
  reply
    .header("Cache-Control", "no-store")
    .header("X-Content-Type-Options", "nosniff");
  return payload;
});
app.useGlobalFilters(new Filter());
await db.pool.query("SELECT 1 FROM schema_migrations WHERE version=1");
await sessions.reap();
let reaping = false;
const timer = setInterval(() => {
  if (reaping) return;
  reaping = true;
  void sessions
    .reap()
    .catch(() => process.stderr.write("Reconciliation retry pending\n"))
    .finally(() => {
      reaping = false;
    });
}, 2000);
timer.unref();
await app.listen(config.control_port, "127.0.0.1");
process.stdout.write(
  `NETWORK AI control ready on 127.0.0.1:${config.control_port} (private_lab)\n`,
);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  await app.close();
  await db.pool.end();
}
process.on("SIGINT", () => {
  void close();
});
process.on("SIGTERM", () => {
  void close();
});
