// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Real database contract tests. Fabricated node reports are not hardware evidence.
import { after, before, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { Auth, type User } from "../../apps/control-api/src/auth.js";
import { Database } from "../../apps/control-api/src/db.js";
import { Market } from "../../apps/control-api/src/market.js";
import { Nodes } from "../../apps/control-api/src/nodes.js";
import { Routes } from "../../apps/control-api/src/routes.js";
import { Availability } from "../../apps/control-api/src/availability.js";
import { RouteAvailability } from "../../apps/control-api/src/route-availability.js";
import { Sessions } from "../../apps/control-api/src/sessions.js";
import {
  Cooperative,
  recycle,
} from "../../apps/control-api/src/cooperative.js";
import { capacity } from "../../apps/control-api/src/capacity.js";
import { createAccounts } from "../../apps/control-api/src/ledger.js";
import {
  hash,
  passwordHash,
  secret,
} from "../../apps/control-api/src/security.js";
import {
  splitByBps,
  MAX_AMOUNT,
  formatTU,
} from "../../packages/contracts/src/index.js";
const { Pool } = createRequire(
  new URL("../../apps/control-api/package.json", import.meta.url),
)("pg");
const name = `network_ai_test_${randomUUID().replaceAll("-", "")}`;
let server: any,
  owner: any,
  db: Database,
  auth: Auth,
  market: Market,
  nodes: Nodes,
  routes: Routes,
  sessions: Sessions;
const admin: User = {
  id: randomUUID(),
  login: "route_admin",
  name: "Route test administrator",
  role: "admin",
};
before(async () => {
  const c = JSON.parse(
    await readFile(".runtime/private-lab/config.json", "utf8"),
  );
  const o = new URL(c.database_owner_url),
    r = new URL(c.database_url);
  server = new Pool({ connectionString: o.toString() });
  assert.match(name, /^network_ai_test_[a-f0-9]{32}$/);
  await server.query(`CREATE DATABASE "${name}"`);
  o.pathname = r.pathname = `/${name}`;
  owner = new Pool({
    connectionString: o.toString(),
    options: "-c search_path=nai,public",
  });
  for (const file of (await readdir("infra/migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await owner.query(await readFile(join("infra/migrations", file), "utf8"));
  db = new Database(r.toString());
  auth = new Auth(db, { ...c, database_url: r.toString() });
  market = new Market(db, auth);
  nodes = new Nodes(db);
  routes = new Routes(db, auth);
  sessions = new Sessions(db, auth.config);
  await owner.query(
    "INSERT INTO users(id,login,name,password_hash,role) VALUES($1,$2,$3,$4,$5)",
    [
      admin.id,
      admin.login,
      admin.name,
      await passwordHash(secret()),
      admin.role,
    ],
  );
  await db.transaction((tx) => createAccounts(tx, admin.id));
});
after(async () => {
  await db?.pool.end();
  await owner?.end();
  if (server) {
    assert.match(name, /^network_ai_test_[a-f0-9]{32}$/);
    await server.query(`DROP DATABASE IF EXISTS "${name}"`);
    await server.end();
  }
});
async function member() {
  return auth.createUser(admin, {
    login: `route_${randomUUID()}`,
    name: "Isolated participant",
    password: secret(),
    role: "member",
  });
}
async function fund(user: User) {
  await market.grant(admin, {
    user_id: user.id,
    amount_microtu: "100000000",
    idempotency_key: randomUUID(),
    reason: "Isolated route contract acceptance",
  });
}
async function ready(id: string) {
  await owner.query(
    "UPDATE nodes SET epoch=1,boot_id=$2,state='READY',last_seen=now(),loaded_backend_models='[\"route-test-engine\"]' WHERE id=$1",
    [id, randomUUID()],
  );
}
async function fixture(t: TestContext, shared = false, qualified = true) {
  const root = await member(),
    buyer = await member();
  await fund(buyer);
  const providers = shared
    ? [root, root, root]
    : [root, await member(), await member()];
  const modelId = `route-${randomUUID()}`;
  const manifest = {
    schema_version: 1,
    model_id: modelId,
    display_name: "Routing contract fixture",
    backend_model: "route-test-engine",
    revision: "isolated-v1",
    artifact_sha256: hash("contract fixture only"),
    license_id: "Apache-2.0",
    source_url: "https://example.org/fixture",
    modality: "text",
    max_context_tokens: 8192,
    max_output_tokens: 512,
    max_input_bytes: 6000,
    input_rate_microtu: "1000",
    output_rate_microtu: "3000",
    rate_denominator: 1,
    description:
      "Fabricated reports for transactional tests; no model is executed",
    trust_policy: "private_lab",
  };
  await market.publish(root, manifest);
  await market.qualify(admin, modelId, {
    state: "LOCAL_PREVIEW",
    note: "Database contract fixture; no hardware qualification.",
  });
  const parts: any[] = [];
  for (let i = 0; i < 3; i++) {
    const domain =
      shared && i > 0
        ? { id: parts[0].domainId }
        : await market.domain(admin, {
            name: "Declared test domain",
            owner_id: providers[i]!.id,
            slots: 1,
          });
    const node = await market.invite(admin, {
      name: `Contract part ${i}`,
      owner_id: providers[i]!.id,
      resource_domain_id: domain.id,
      model_id: modelId,
      base_url: `http://127.0.0.1:${43240 + i}`,
      node_kind: i === 0 ? "ROUTE_ROOT" : "RPC_STAGE",
    });
    await ready(node.id);
    parts.push({
      nodeId: node.id,
      domainId: domain.id,
      provider: providers[i]!,
      prepare: secret(),
    });
  }
  const proposal = {
    name: "A complete private route",
    model_id: modelId,
    idempotency_key: randomUUID(),
    participants: parts.map((p, i) => ({
      node_id: p.nodeId,
      share_bps: i === 0 ? 1000 : 4500,
    })),
  };
  const route = await routes.publish(root, proposal);
  if (qualified) {
    for (const provider of new Map(providers.map((p) => [p.id, p])).values())
      await routes.accept(provider, route.id, {
        route_sha256: route.route_sha256,
      });
    await routes.qualify(admin, route.id, {
      state: "LOCAL_PREVIEW",
      note: "Database contract fixture; no hardware qualification.",
    });
  }
  t.after(async () => {
    await owner.query(
      `UPDATE route_availability_leases SET
      started_ms=started_ms-3600000,ends_ms=ends_ms-3600000,offer_expires_at=now()-interval '1 second'
      WHERE route_id=$1`,
      [route.id],
    );
    await new RouteAvailability(db).reconcile();
    await owner.query(
      "UPDATE sessions SET queue_deadline=now()-interval '1 second',execution_deadline=now()-interval '1 second' WHERE model_id=$1",
      [modelId],
    );
    await sessions.reap();
    await market.qualify(admin, modelId, {
      state: "REVOKED",
      note: "Completed isolated database contract fixture.",
    });
  });
  return { root, buyer, providers, modelId, manifest, parts, route, proposal };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function job(f: Fixture, model = f.modelId, pool?: string) {
  const q = await market.quote(f.buyer, {
    model,
    max_output_tokens: 128,
    ...(pool ? { cooperative_pool_id: pool } : {}),
  });
  return sessions.create(f.buyer, {
    quote_id: q.id,
    idempotency_key: randomUUID(),
    request_sha256: hash("request"),
    request_bytes: 100,
    model,
    max_tokens: 128,
    content_bytes: 12,
    message_count: 1,
  });
}
async function started(f: Fixture, pool?: string) {
  const s = await job(f, f.modelId, pool),
    a = await sessions.admit(s.id);
  assert.equal(a.state, "PREPARING");
  assert.equal(a.participants.length, 3);
  await sessions.authorize(s.id, {
    prepare_id: f.parts[0].prepare,
    participants: f.parts
      .slice(1)
      .map((p) => ({ node_id: p.nodeId, prepare_id: p.prepare })),
  });
  for (const p of f.parts.slice(1))
    await sessions.stageClaim(p.nodeId, {
      session_id: s.id,
      attempt_id: a.attempt_id,
      epoch: 1,
      prepare_id: p.prepare,
    });
  await sessions.claim(f.parts[0].nodeId, {
    session_id: s.id,
    attempt_id: a.attempt_id,
    epoch: 1,
    prepare_id: f.parts[0].prepare,
  });
  const root = {
    session_id: s.id,
    attempt_id: a.attempt_id,
    epoch: 1,
    state: "COMPLETED",
    prompt_tokens: 100,
    completion_tokens: 20,
    output_sha256: hash("fabricated output"),
    stream_done: true,
    finish_reason: "stop",
    error_code: null,
    elapsed_ms: 200,
    metering_source: "engine_reported",
  };
  const stage = {
    session_id: s.id,
    attempt_id: a.attempt_id,
    epoch: 1,
    route_sha256: f.route.route_sha256,
    state: "COMPLETED",
    completed_commands: 20,
    request_bytes: "1000",
    response_bytes: "2000",
    transcript_sha256: hash("fabricated RPC transcript"),
    elapsed_ms: 190,
    metering_source: "rpc_observed",
    error_code: null,
  };
  return { s, a, root, stage };
}
async function balance(user: User) {
  return BigInt(
    (await market.wallet(user)).accounts.find((a) => a.kind === "AVAILABLE")
      .balance,
  );
}

test("route terms require every provider, reject edits and keep committed membership fixed", async (t) => {
  const f = await fixture(t, false, false);
  assert.equal((await routes.publish(f.root, f.proposal)).id, f.route.id);
  await assert.rejects(
    () => routes.publish(f.root, { ...f.proposal, name: "changed" }),
    { code: "idempotency_conflict" },
  );
  await assert.rejects(
    () =>
      routes.accept(f.buyer, f.route.id, {
        route_sha256: f.route.route_sha256,
      }),
    { code: "route_missing" },
  );
  await assert.rejects(
    () => routes.accept(f.root, f.route.id, { route_sha256: hash("wrong") }),
    { code: "route_terms" },
  );
  await routes.accept(f.root, f.route.id, {
    route_sha256: f.route.route_sha256,
  });
  await assert.rejects(
    () =>
      routes.qualify(admin, f.route.id, {
        state: "LOCAL_PREVIEW",
        note: "Every provider must accept this route.",
      }),
    { code: "route_consent" },
  );
  for (const p of f.providers.slice(1))
    await routes.accept(p, f.route.id, { route_sha256: f.route.route_sha256 });
  await routes.qualify(admin, f.route.id, {
    state: "LOCAL_PREVIEW",
    note: "All fixture participants have consented.",
  });
  await assert.rejects(
    () =>
      db.pool.query(
        "UPDATE route_members SET share_bps=10000 WHERE route_id=$1",
        [f.route.id],
      ),
    { code: "42501" },
  );
  await assert.rejects(
    () =>
      db.pool.query("UPDATE execution_routes SET route_sha256=$2 WHERE id=$1", [
        f.route.id,
        hash("edit"),
      ]),
    { code: "42501" },
  );
  await assert.rejects(
    () =>
      db.pool.query("UPDATE nodes SET owner_id=$2 WHERE id=$1", [
        f.parts[1].nodeId,
        f.root.id,
      ]),
    { code: "42501" },
  );
  await assert.rejects(
    () =>
      db.pool.query(
        `INSERT INTO route_members(route_id,node_id,provider_id,resource_domain_id,ordinal,role,share_bps)
    VALUES($1,$2,$3,$4,3,'STAGE',1)`,
        [
          f.route.id,
          f.parts[1].nodeId,
          f.providers[1]!.id,
          f.parts[1].domainId,
        ],
      ),
    /cannot append to committed route/,
  );
});

test("one missing stage removes the complete offer and cannot fall back to its root", async (t) => {
  const f = await fixture(t);
  assert.equal(
    (await market.models()).find((m) => m.id === f.modelId).available,
    true,
  );
  await market.nodeState(f.providers[2]!, f.parts[2].nodeId, {
    state: "PAUSED",
  });
  assert.equal(
    (await market.models()).find((m) => m.id === f.modelId).available,
    false,
  );
  assert.equal(
    (await capacity(db.pool, f.modelId, f.buyer.id)).declared_ready_slots,
    0,
  );
  const s = await job(f);
  assert.equal((await sessions.admit(s.id)).state, "QUEUED");
  assert.equal(
    (
      await db.pool.query("SELECT * FROM session_domains WHERE session_id=$1", [
        s.id,
      ])
    ).rowCount,
    0,
  );
});

test("concurrent routes reserve every domain atomically and a shared host is counted once", async (t) => {
  const f = await fixture(t, true);
  assert.equal(
    (await capacity(db.pool, f.modelId, f.buyer.id)).declared_ready_slots,
    1,
  );
  const a = await job(f),
    b = await job(f);
  const results = await Promise.all([
    sessions.admit(a.id),
    sessions.admit(b.id),
  ]);
  assert.equal(results.filter((r) => r.state === "PREPARING").length, 1);
  assert.equal(results.filter((r) => r.state === "QUEUED").length, 1);
  assert.equal(
    (
      await db.pool.query(
        "SELECT * FROM active_session_domains WHERE resource_domain_id=$1",
        [f.parts[0].domainId],
      )
    ).rowCount,
    1,
  );
  assert.equal(
    (await capacity(db.pool, f.modelId, f.buyer.id)).temporary_session_limit,
    2,
  );
});

test("a reserved worker domain also blocks an ordinary whole-model node", async (t) => {
  const f = await fixture(t);
  const active = await started(f);
  const model = `whole-${randomUUID()}`;
  await market.publish(f.providers[1]!, { ...f.manifest, model_id: model });
  await market.qualify(admin, model, {
    state: "LOCAL_PREVIEW",
    note: "A whole-model fixture sharing the worker domain.",
  });
  const node = await market.invite(admin, {
    name: "Shared-domain whole model",
    owner_id: f.providers[1]!.id,
    resource_domain_id: f.parts[1].domainId,
    model_id: model,
    base_url: "http://127.0.0.1:43249",
  });
  await ready(node.id);
  const waiting = await job(f, model);
  assert.equal((await sessions.admit(waiting.id)).state, "QUEUED");
  await sessions.cancel(f.buyer, active.s.id);
  await sessions.stageReceipt(f.parts[1].nodeId, {
    ...active.stage,
    state: "CANCELLED",
    error_code: "cancelled",
  });
  assert.equal((await sessions.admit(waiting.id)).state, "PREPARING");
  await sessions.cancel(f.buyer, waiting.id);
});

test("no root claim is accepted until every prepared stage has claimed exactly once", async (t) => {
  const f = await fixture(t),
    s = await job(f),
    a = await sessions.admit(s.id);
  await assert.rejects(
    () => sessions.authorize(s.id, { prepare_id: f.parts[0].prepare }),
    { code: "route_prepare_incomplete" },
  );
  await sessions.authorize(s.id, {
    prepare_id: f.parts[0].prepare,
    participants: f.parts
      .slice(1)
      .map((p) => ({ node_id: p.nodeId, prepare_id: p.prepare })),
  });
  const body = {
    session_id: s.id,
    attempt_id: a.attempt_id,
    epoch: 1,
    prepare_id: f.parts[0].prepare,
  };
  await assert.rejects(() => sessions.claim(f.parts[0].nodeId, body), {
    code: "route_unclaimed",
  });
  const claim = { ...body, prepare_id: f.parts[1].prepare };
  const results = await Promise.allSettled([
    sessions.stageClaim(f.parts[1].nodeId, claim),
    sessions.stageClaim(f.parts[1].nodeId, claim),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  await assert.rejects(() => sessions.claim(f.parts[0].nodeId, body), {
    code: "route_unclaimed",
  });
  await sessions.stageClaim(f.parts[2].nodeId, {
    ...body,
    prepare_id: f.parts[2].prepare,
  });
  assert.equal((await sessions.claim(f.parts[0].nodeId, body)).accepted, true);
});

test("all receipts settle one charge across frozen providers in either arrival order", async (t) => {
  for (const rootFirst of [true, false]) {
    const f = await fixture(t),
      before = await balance(f.buyer),
      a = await started(f);
    if (rootFirst) await sessions.receipt(f.parts[0].nodeId, a.root);
    await sessions.stageReceipt(f.parts[1].nodeId, a.stage);
    assert.equal((await sessions.get(f.buyer, a.s.id)).billing_state, "HELD");
    assert.equal(await balance(f.providers[1]!), 0n);
    await sessions.stageReceipt(f.parts[2].nodeId, a.stage);
    if (!rootFirst) await sessions.receipt(f.parts[0].nodeId, a.root);
    const s = await sessions.get(f.buyer, a.s.id);
    assert.equal(s.state, "COMPLETED");
    assert.equal(s.charged_microtu, "160000");
    assert.equal(await balance(f.buyer), before - 160000n);
    assert.deepEqual(await Promise.all(f.providers.map(balance)), [
      12800n,
      57600n,
      57600n,
    ]);
    assert.deepEqual(
      s.participants.map((p) => p.paid_microtu),
      ["12800", "57600", "57600"],
    );
    assert.equal(
      (await sessions.stageReceipt(f.parts[1].nodeId, a.stage)).duplicate,
      true,
    );
    await assert.rejects(
      () =>
        sessions.stageReceipt(f.parts[1].nodeId, {
          ...a.stage,
          completed_commands: 21,
        }),
      { code: "receipt_conflict" },
    );
    assert.equal(
      (
        await db.pool.query(
          "SELECT * FROM active_session_domains WHERE session_id=$1",
          [a.s.id],
        )
      ).rowCount,
      0,
    );
  }
});

test("missing or empty worker evidence cannot earn payment", async (t) => {
  const f = await fixture(t),
    a = await started(f),
    before = (await sessions.get(f.buyer, a.s.id)).hold_microtu;
  const root = await sessions.receipt(f.parts[0].nodeId, a.root);
  assert.equal(root.receipt_pending, true);
  assert.equal((await sessions.get(f.buyer, a.s.id)).hold_microtu, before);
  await sessions.stageReceipt(f.parts[1].nodeId, {
    ...a.stage,
    completed_commands: 0,
  });
  const ended = await sessions.get(f.buyer, a.s.id);
  assert.equal(ended.state, "FAILED");
  assert.equal(ended.billing_state, "REFUNDED");
  assert.equal(ended.charged_microtu, "0");
  assert.deepEqual(await Promise.all(f.providers.map(balance)), [0n, 0n, 0n]);
});

test("worker restart fences the whole route and releases every reservation", async (t) => {
  const f = await fixture(t),
    a = await started(f);
  await nodes.resume(f.parts[2].nodeId, { boot_id: randomUUID() });
  await assert.rejects(
    () => sessions.stageReceipt(f.parts[1].nodeId, a.stage),
    { code: "route_node_changed" },
  );
  await sessions.reap();
  const ended = await sessions.get(f.buyer, a.s.id);
  assert.equal(ended.state, "INTERRUPTED");
  assert.equal(ended.billing_state, "REFUNDED");
  assert.equal(
    (
      await db.pool.query(
        "SELECT * FROM active_session_domains WHERE session_id=$1",
        [a.s.id],
      )
    ).rowCount,
    0,
  );
});

test("provider withdrawal stops new admission while preserving the accepted route terms", async (t) => {
  const f = await fixture(t),
    a = await started(f);
  await routes.withdraw(f.providers[1]!, f.route.id);
  assert.equal(
    (await market.models()).find((m) => m.id === f.modelId).available,
    false,
  );
  await assert.rejects(
    () =>
      routes.accept(f.providers[1]!, f.route.id, {
        route_sha256: f.route.route_sha256,
      }),
    { code: "route_withdrawn" },
  );
  await sessions.receipt(f.parts[0].nodeId, a.root);
  for (const p of f.parts.slice(1))
    await sessions.stageReceipt(p.nodeId, a.stage);
  assert.equal((await sessions.get(f.buyer, a.s.id)).state, "COMPLETED");
  const replacement = await routes.publish(f.root, {
    ...f.proposal,
    idempotency_key: randomUUID(),
  });
  assert.notEqual(replacement.route_sha256, f.route.route_sha256);
  for (const provider of f.providers)
    await routes.accept(provider, replacement.id, {
      route_sha256: replacement.route_sha256,
    });
  await assert.rejects(
    () =>
      routes.qualify(admin, replacement.id, {
        state: "LOCAL_PREVIEW",
        note: "The prior root route still has an active qualification.",
      }),
    { code: "route_root_in_use" },
  );
  await routes.qualify(admin, f.route.id, {
    state: "REVOKED",
    note: "The previous route is closed before qualifying a replacement.",
  });
  await routes.qualify(admin, replacement.id, {
    state: "LOCAL_PREVIEW",
    note: "All providers explicitly accepted the replacement route terms.",
  });
});

test("late completion cannot charge before the periodic reaper runs", async (t) => {
  const f = await fixture(t),
    a = await started(f);
  for (const p of f.parts.slice(1))
    await sessions.stageReceipt(p.nodeId, a.stage);
  await owner.query(
    "UPDATE sessions SET execution_deadline=now()-interval '1 second' WHERE id=$1",
    [a.s.id],
  );
  const result = await sessions.receipt(f.parts[0].nodeId, a.root);
  assert.equal(result.terminal, true);
  assert.equal((await sessions.get(f.buyer, a.s.id)).charged_microtu, "0");
});

test("payout rounding conserves the entire funded pool, including integer extremes", () => {
  assert.equal(formatTU(1n), "0,000001");
  assert.equal(formatTU(12960n), "0,01296");
  assert.equal(formatTU(-12960n), "-0,01296");
  assert.deepEqual(splitByBps(3200n, [1111, 3333, 5556]), [355n, 1067n, 1778n]);
  for (const total of [0n, 1n, 9n, MAX_AMOUNT]) {
    const values = splitByBps(total, [1000, 4500, 4500]);
    assert.equal(
      values.reduce((a, b) => a + b, 0n),
      total,
    );
    assert.ok(values.every((v) => v >= 0n));
  }
  assert.throws(() => splitByBps(1n, [5000, 5001]), RangeError);
});

test("route journals still match all account projections and held obligations", async () => {
  assert.equal(
    (
      await db.pool.query(
        "SELECT sum(balance)::text AS total FROM ledger_accounts",
      )
    ).rows[0].total,
    "0",
  );
  assert.equal(
    (
      await db.pool
        .query(`SELECT a.id FROM ledger_accounts a LEFT JOIN journal_lines l ON l.account_id=a.id
    GROUP BY a.id HAVING a.balance<>coalesce(sum(l.amount),0)`)
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await db.pool
        .query(`SELECT a.id FROM ledger_accounts a WHERE kind='HELD' AND balance<>
    coalesce((SELECT sum(hold_microtu) FROM sessions s WHERE s.user_id=a.owner_id AND s.billing_state='HELD'),0)`)
    ).rowCount,
    0,
  );
});

const coverage = () => new RouteAvailability(db);
function coverageTerms(f: Fixture, rate = "1000") {
  return {
    route_id: f.route.id,
    duration_seconds: 30,
    rate_microtu_per_second: rate,
    purpose: "EXPERIMENT",
    reason: "Isolated database readiness contract fixture.",
    idempotency_key: randomUUID(),
  };
}
async function acceptCoverage(f: Fixture, lease: any) {
  let result;
  for (const p of new Map(f.providers.map((p) => [p.id, p])).values())
    result = await coverage().accept(p, lease.id, {
      terms_sha256: lease.terms_sha256,
    });
  return result!;
}
async function coverageRow(f: Fixture, id: string) {
  return (await coverage().list(f.buyer)).find((l) => l.id === id)!;
}
async function elapsedCoverage(id: string, ms = 1000) {
  // Explicit test-only owner intervention: synthetic observation time, never hardware evidence.
  await owner.query(
    "UPDATE route_availability_leases SET sample_ms=sample_ms-$2 WHERE id=$1",
    [id, ms],
  );
}
async function finishCoverage(id: string) {
  await owner.query(
    `UPDATE route_availability_leases SET started_ms=started_ms-3600000,ends_ms=ends_ms-3600000 WHERE id=$1`,
    [id],
  );
  await coverage().reconcile();
}

test("route readiness funding is atomic, idempotent, scoped and bound to immutable complete terms", async (t) => {
  const f = await fixture(t),
    body = coverageTerms(f),
    before = await balance(f.buyer);
  const lease = await coverage().offer(f.buyer, body);
  assert.equal(lease.state, "OFFERED");
  assert.equal(lease.budget_microtu, "30000");
  assert.equal(await balance(f.buyer), before - 30000n);
  assert.equal((await coverage().offer(f.buyer, body)).id, lease.id);
  await assert.rejects(
    () => coverage().offer(f.buyer, { ...body, duration_seconds: 31 }),
    { code: "idempotency_conflict" },
  );
  assert.equal(
    (await coverage().list(f.root)).some((l) => l.id === lease.id),
    true,
  );
  const stranger = await member();
  assert.deepEqual(await coverage().list(stranger), []);
  await assert.rejects(
    () =>
      coverage().accept(stranger, lease.id, {
        terms_sha256: lease.terms_sha256,
      }),
    { code: "lease_missing" },
  );
  await assert.rejects(() => coverage().cancel(stranger, lease.id), {
    code: "lease_missing",
  });
  await assert.rejects(
    () =>
      coverage().accept(f.root, lease.id, { terms_sha256: hash("changed") }),
    { code: "lease_terms" },
  );
  for (const sql of [
    "UPDATE route_availability_leases SET duration_seconds=31 WHERE id=$1",
    "UPDATE route_availability_leases SET terms=terms WHERE id=$1",
    "UPDATE route_availability_members SET maximum_microtu=1 WHERE lease_id=$1",
    "DELETE FROM route_availability_events WHERE lease_id=$1",
    "UPDATE route_availability_acceptances SET terms_sha256='changed' WHERE lease_id=$1",
  ])
    await assert.rejects(() => db.pool.query(sql, [lease.id]), {
      code: "42501",
    });
  await assert.rejects(
    () =>
      db.pool.query(
        `INSERT INTO route_availability_members(lease_id,node_id,provider_id,resource_domain_id,ordinal,role,share_bps,maximum_microtu)
    VALUES($1,$2,$3,$4,5,'STAGE',1,1)`,
        [lease.id, f.parts[1].nodeId, f.providers[1]!.id, f.parts[1].domainId],
      ),
    /cannot append to committed availability terms/,
  );
  await coverage().cancel(f.buyer, lease.id);
  await coverage().cancel(f.buyer, lease.id);
  assert.equal(await balance(f.buyer), before);
});

test("only an entirely ready qualified route can be funded and insufficient funds create nothing", async (t) => {
  const f = await fixture(t),
    body = coverageTerms(f),
    unfunded = await member();
  await assert.rejects(() => coverage().offer(unfunded, body), {
    code: "insufficient_credits",
  });
  assert.equal((await coverage().list(unfunded)).length, 0);
  await market.nodeState(f.providers[1]!, f.parts[1].nodeId, {
    state: "PAUSED",
  });
  await assert.rejects(() => coverage().offer(f.buyer, body), {
    code: "route_not_ready",
  });
  await market.nodeState(f.providers[1]!, f.parts[1].nodeId, {
    state: "READY",
  });
  for (const p of f.parts) await ready(p.nodeId);
  await routes.withdraw(f.providers[1]!, f.route.id);
  await assert.rejects(() => coverage().offer(f.buyer, body), {
    code: "route_not_ready",
  });
  assert.equal((await coverage().list(f.buyer)).length, 0);
});

test("all provider signatures precede activation and the last signature rolls back if a stage becomes unavailable", async (t) => {
  const f = await fixture(t),
    lease = await coverage().offer(f.buyer, coverageTerms(f));
  for (const p of f.providers.slice(0, 2)) {
    assert.equal(
      (
        await coverage().accept(p, lease.id, {
          terms_sha256: lease.terms_sha256,
        })
      ).state,
      "OFFERED",
    );
  }
  await owner.query(
    "UPDATE nodes SET last_seen=now()-interval '10 seconds' WHERE id=$1",
    [f.parts[2].nodeId],
  );
  await assert.rejects(
    () =>
      coverage().accept(f.providers[2]!, lease.id, {
        terms_sha256: lease.terms_sha256,
      }),
    { code: "route_not_ready" },
  );
  assert.equal(
    (
      await db.pool.query(
        "SELECT count(*)::int AS n FROM route_availability_acceptances WHERE lease_id=$1",
        [lease.id],
      )
    ).rows[0].n,
    2,
  );
  assert.equal(
    (
      await db.pool.query(
        "SELECT 1 FROM availability_domain_claims WHERE route_lease_id=$1",
        [lease.id],
      )
    ).rowCount,
    0,
  );
  await ready(f.parts[2].nodeId);
  const started = await acceptCoverage(f, lease);
  assert.equal(started.state, "ACTIVE");
  assert.equal(Number(started.ends_ms) - Number(started.started_ms), 30000);
  assert.equal(
    (
      await db.pool.query(
        "SELECT 1 FROM availability_domain_claims WHERE route_lease_id=$1",
        [lease.id],
      )
    ).rowCount,
    3,
  );
});

test("shared physical capacity has one claim and one budget despite several stage identities", async (t) => {
  const f = await fixture(t, true),
    lease = await coverage().offer(f.buyer, coverageTerms(f));
  await acceptCoverage(f, lease);
  assert.equal(
    (
      await db.pool.query(
        "SELECT 1 FROM availability_domain_claims WHERE route_lease_id=$1",
        [lease.id],
      )
    ).rowCount,
    1,
  );
  await elapsedCoverage(lease.id);
  await coverage().reconcile();
  const paid = await coverageRow(f, lease.id);
  assert.ok(BigInt(paid.paid_microtu) > 0n);
  assert.equal(
    paid.participants.reduce(
      (s: bigint, p: any) => s + BigInt(p.paid_microtu),
      0n,
    ),
    BigInt(paid.paid_microtu),
  );
  assert.equal(await balance(f.root), BigInt(paid.paid_microtu));
  assert.equal(
    paid.participants.reduce(
      (s: bigint, p: any) => s + BigInt(p.maximum_microtu),
      0n,
    ),
    30000n,
  );
});

test("concurrent complete-route acceptances cannot double-lease any shared domain", async (t) => {
  const f = await fixture(t, true),
    a = await coverage().offer(f.buyer, coverageTerms(f)),
    b = await coverage().offer(f.buyer, coverageTerms(f));
  const results = await Promise.allSettled([
    acceptCoverage(f, a),
    acceptCoverage(f, b),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = results.find(
    (r) => r.status === "rejected",
  ) as PromiseRejectedResult;
  assert.equal(rejected.reason.code, "domain_leased");
  assert.equal(
    (
      await db.pool.query(
        "SELECT 1 FROM availability_domain_claims WHERE resource_domain_id=$1",
        [f.parts[0].domainId],
      )
    ).rowCount,
    1,
  );
});

test("standalone and complete-route contracts share sponsor caps and bidirectional physical exclusion", async (t) => {
  const f = await fixture(t, true),
    single = new Availability(db);
  const whole = await market.invite(admin, {
    name: "Whole model on the same physical capacity",
    owner_id: f.root.id,
    resource_domain_id: f.parts[0].domainId,
    model_id: f.modelId,
    base_url: "http://127.0.0.1:43249",
  });
  await ready(whole.id);
  const nodeTerms = () => ({
    node_id: whole.id,
    duration_seconds: 30,
    rate_microtu_per_second: "1000",
    idempotency_key: randomUUID(),
  });
  await assert.rejects(
    () => single.offer(f.buyer, { ...nodeTerms(), node_id: f.parts[1].nodeId }),
    { code: "node_unavailable" },
  );
  const nodeLease = await single.offer(f.buyer, nodeTerms());
  await single.accept(f.root, nodeLease.id);
  const routeLease = await coverage().offer(f.buyer, coverageTerms(f));
  await assert.rejects(() => acceptCoverage(f, routeLease), {
    code: "domain_leased",
  });
  await single.cancel(f.buyer, nodeLease.id);
  await acceptCoverage(f, routeLease);
  const blocked = await single.offer(f.buyer, nodeTerms());
  await assert.rejects(() => single.accept(f.root, blocked.id), {
    code: "domain_leased",
  });
  const a = await single.offer(f.buyer, nodeTerms()),
    b = await coverage().offer(f.buyer, coverageTerms(f));
  await assert.rejects(() => single.offer(f.buyer, nodeTerms()), {
    code: "lease_limit",
  });
  await assert.rejects(() => coverage().offer(f.buyer, coverageTerms(f)), {
    code: "lease_limit",
  });
  for (const l of [blocked, a]) await single.cancel(f.buyer, l.id);
  await coverage().cancel(f.buyer, b.id);
  await finishCoverage(routeLease.id);
  const restored = await single.offer(f.buyer, nodeTerms());
  await single.accept(f.root, restored.id);
  await single.cancel(f.buyer, restored.id);
});

test("ready components keep their accepted entitlement when another stage fails", async (t) => {
  const f = await fixture(t),
    lease = await coverage().offer(f.buyer, coverageTerms(f));
  await acceptCoverage(f, lease);
  await market.nodeState(f.providers[1]!, f.parts[1].nodeId, {
    state: "PAUSED",
  });
  await elapsedCoverage(lease.id);
  await coverage().reconcile();
  const row = await coverageRow(f, lease.id);
  assert.equal(row.state, "DRAINING");
  assert.equal(row.joint_ready_ms, "0");
  assert.equal(row.participants[1].paid_microtu, "0");
  assert.ok(BigInt(row.participants[0].paid_microtu) > 0n);
  assert.ok(BigInt(row.participants[2].paid_microtu) > 0n);
  assert.deepEqual(
    await Promise.all(f.providers.map(balance)),
    row.participants.map((p: any) => BigInt(p.paid_microtu)),
  );
  await assert.rejects(() => coverage().offer(f.buyer, coverageTerms(f)), {
    code: "route_not_ready",
  });
  const terminal = await coverage().cancel(f.buyer, lease.id);
  assert.equal(terminal.state, "DRAINING");
  assert.equal(
    (
      await db.pool.query("SELECT balance FROM ledger_accounts WHERE id=$1", [
        row.escrow_account,
      ])
    ).rows[0].balance,
    (30000n - BigInt(terminal.paid_microtu)).toString(),
  );
  await finishCoverage(lease.id);
  const ended = await coverageRow(f, lease.id);
  assert.equal(ended.state, "COMPLETED");
  assert.equal(
    (
      await db.pool.query("SELECT balance FROM ledger_accounts WHERE id=$1", [
        row.escrow_account,
      ])
    ).rows[0].balance,
    "0",
  );
  assert.equal(await balance(f.buyer), 100000000n - BigInt(ended.paid_microtu));
});

test("provider exit relinquishes only its future earnings and preserves other funded obligations", async (t) => {
  const f = await fixture(t),
    lease = await coverage().offer(f.buyer, coverageTerms(f));
  await acceptCoverage(f, lease);
  await coverage().cancel(f.providers[1]!, lease.id);
  const before = await coverageRow(f, lease.id);
  await elapsedCoverage(lease.id);
  await coverage().reconcile();
  const after = await coverageRow(f, lease.id);
  assert.equal(after.state, "DRAINING");
  assert.equal(
    after.participants[1].paid_microtu,
    before.participants[1].paid_microtu,
  );
  assert.ok(after.participants[1].withdrawn_at);
  assert.ok(
    BigInt(after.participants[0].paid_microtu) >
      BigInt(before.participants[0].paid_microtu),
  );
  assert.equal(
    (
      await db.pool.query(
        "SELECT 1 FROM availability_domain_claims WHERE route_lease_id=$1",
        [lease.id],
      )
    ).rowCount,
    3,
  );
});

test("coordinator outages and node epochs cannot be extrapolated into paid readiness", async (t) => {
  const f = await fixture(t),
    lease = await coverage().offer(f.buyer, coverageTerms(f));
  await acceptCoverage(f, lease);
  await elapsedCoverage(lease.id, 10000);
  await coverage().reconcile();
  assert.equal((await coverageRow(f, lease.id)).paid_microtu, "0");
  await elapsedCoverage(lease.id);
  await owner.query("UPDATE nodes SET epoch=epoch+1 WHERE id=$1", [
    f.parts[1].nodeId,
  ]);
  await coverage().reconcile();
  const after = await coverageRow(f, lease.id);
  assert.equal(after.participants[1].paid_microtu, "0");
  assert.ok(BigInt(after.participants[0].paid_microtu) > 0n);
  assert.equal(after.joint_ready_ms, "0");
  await elapsedCoverage(lease.id);
  await coverage().reconcile();
  assert.ok(
    BigInt((await coverageRow(f, lease.id)).participants[1].paid_microtu) > 0n,
  );
});

test("a backwards clock checkpoint cannot rewind accrued coverage", async (t) => {
  const f = await fixture(t),
    lease = await coverage().offer(f.buyer, coverageTerms(f));
  await acceptCoverage(f, lease);
  await owner.query(
    "UPDATE route_availability_leases SET sample_ms=sample_ms+10000 WHERE id=$1",
    [lease.id],
  );
  const before = await coverageRow(f, lease.id);
  await coverage().reconcile();
  const after = await coverageRow(f, lease.id);
  assert.equal(after.sample_ms, before.sample_ms);
  assert.equal(after.paid_microtu, "0");
  await elapsedCoverage(lease.id, 10000);
});

test("expired partial signatures refund the sponsor once without paying a fragment", async (t) => {
  const f = await fixture(t),
    lease = await coverage().offer(f.buyer, coverageTerms(f));
  await coverage().accept(f.root, lease.id, {
    terms_sha256: lease.terms_sha256,
  });
  await owner.query(
    "UPDATE route_availability_leases SET offer_expires_at=now()-interval '1 second' WHERE id=$1",
    [lease.id],
  );
  await assert.rejects(
    () =>
      coverage().accept(f.providers[1]!, lease.id, {
        terms_sha256: lease.terms_sha256,
      }),
    { code: "offer_expired" },
  );
  await Promise.all([coverage().reconcile(), coverage().reconcile()]);
  const after = await coverageRow(f, lease.id);
  assert.equal(after.state, "EXPIRED");
  assert.equal(after.paid_microtu, "0");
  assert.equal(await balance(f.buyer), 100000000n);
  assert.deepEqual(await Promise.all(f.providers.map(balance)), [0n, 0n, 0n]);
  assert.equal(
    (
      await db.pool.query("SELECT 1 FROM journal WHERE business_key=$1", [
        `route-lease:${lease.id}:refund`,
      ])
    ).rowCount,
    1,
  );
});

test("fractional shares conserve the full window budget and repeated completion cannot pay twice", async (t) => {
  const f = await fixture(t),
    lease = await coverage().offer(f.buyer, coverageTerms(f, "1"));
  await acceptCoverage(f, lease);
  // Fabricate an already observed 29s prefix to exercise the exact 30s boundary.
  await owner.query(
    "UPDATE route_availability_members SET credited_ms=29000 WHERE lease_id=$1",
    [lease.id],
  );
  await owner.query(
    `WITH c AS (SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms)
    UPDATE route_availability_leases SET started_ms=c.ms-30000,ends_ms=c.ms,sample_ms=c.ms-1000,joint_ready_ms=29000 FROM c WHERE id=$1`,
    [lease.id],
  );
  await Promise.all([
    coverage().reconcile(),
    coverage().cancel(f.buyer, lease.id),
  ]);
  const after = await coverageRow(f, lease.id);
  assert.equal(after.state, "COMPLETED");
  assert.equal(after.paid_microtu, "30");
  assert.equal(after.joint_ready_ms, "30000");
  assert.deepEqual(
    after.participants.map((p: any) => p.paid_microtu),
    ["3", "13", "14"],
  );
  await coverage().cancel(f.buyer, lease.id);
  assert.deepEqual(await Promise.all(f.providers.map(balance)), [3n, 13n, 14n]);
  assert.equal(
    (
      await db.pool.query(
        "SELECT 1 FROM availability_domain_claims WHERE route_lease_id=$1",
        [lease.id],
      )
    ).rowCount,
    0,
  );
});

test("route readiness payment projections, escrow remainders and domain claims reconcile", async () => {
  assert.equal(
    (await db.pool.query("SELECT sum(balance)::text AS n FROM ledger_accounts"))
      .rows[0].n,
    "0",
  );
  assert.equal(
    (
      await db.pool
        .query(`SELECT a.id FROM ledger_accounts a LEFT JOIN journal_lines l ON l.account_id=a.id
    GROUP BY a.id HAVING a.balance<>coalesce(sum(l.amount),0)`)
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await db.pool
        .query(`SELECT l.id FROM route_availability_leases l JOIN ledger_accounts a ON a.id=l.escrow_account
    WHERE a.balance<>CASE WHEN l.state IN ('OFFERED','ACTIVE','DRAINING') THEN l.budget_microtu-l.paid_microtu ELSE 0 END`)
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await db.pool
        .query(`SELECT l.id FROM route_availability_leases l JOIN route_availability_members p ON p.lease_id=l.id
    GROUP BY l.id HAVING sum(p.paid_microtu)<>l.paid_microtu OR sum(p.maximum_microtu)<>l.budget_microtu`)
    ).rowCount,
    0,
  );
  await assert.rejects(
    () => db.pool.query("DELETE FROM availability_domain_claims"),
    { code: "42501" },
  );
  assert.equal(
    (
      await db.pool
        .query(`SELECT c.resource_domain_id FROM availability_domain_claims c
    LEFT JOIN route_availability_leases r ON r.id=c.route_lease_id LEFT JOIN availability_leases n ON n.id=c.node_lease_id
    WHERE (c.route_lease_id IS NOT NULL AND r.state NOT IN ('ACTIVE','DRAINING')) OR (c.node_lease_id IS NOT NULL AND n.state<>'ACTIVE')`)
    ).rowCount,
    0,
  );
});

const coop = () => new Cooperative(db);
async function poolFixture(
  t: TestContext,
  working = "10000000",
  reserve = "0",
) {
  const f = await fixture(t);
  const data = {
    name: "Isolated cooperative fund",
    support_until: new Date(Date.now() + 3600000).toISOString(),
    idempotency_key: randomUUID(),
    groups: [
      {
        key: "essential",
        route_ids: [f.route.id],
        rate_microtu_per_second: "100",
        duration_seconds: 60,
      },
    ],
  };
  const p = await coop().create(f.buyer, data);
  for (const [destination, value] of [
    ["WORKING", working],
    ["RESERVE", reserve],
  ])
    if (BigInt(value!) > 0n)
      await coop().fund(f.buyer, p.id, {
        destination,
        amount_microtu: value,
        policy_sha256: p.policy_sha256,
        consent: "COMMITTED_LAB_CREDITS_NO_REDEMPTION",
        idempotency_key: randomUUID(),
      });
  return { f, p, data };
}
async function coopWindow(f: Fixture, p: any, source = "WORKING") {
  const l = await coop().offer(f.buyer, p.id, {
    group_key: "essential",
    source,
    reason: "Isolated essential complete-route coverage",
    idempotency_key: randomUUID(),
  });
  for (const provider of new Map(f.providers.map((v) => [v.id, v])).values())
    await new RouteAvailability(db).accept(provider, l.id, {
      terms_sha256: l.terms_sha256,
    });
  return l;
}
async function settleCoop(f: Fixture, p: any) {
  const v = await started(f, p.id);
  for (const part of f.parts.slice(1))
    await sessions.stageReceipt(part.nodeId, v.stage);
  await sessions.receipt(f.parts[0].nodeId, v.root);
  return await sessions.get(f.buyer, v.s.id);
}

test("cooperation: floor-first recycling conserves microcredits across all destinations", () => {
  assert.deepEqual(recycle(100n, 0n, 0n, 30n, 50n, 40n), {
    floor: 30n,
    reserve: 40n,
    working: 20n,
    burned: 10n,
  });
  assert.deepEqual(recycle(1n, 30n, 40n, 30n, 50n, 40n), {
    floor: 0n,
    reserve: 0n,
    working: 1n,
    burned: 0n,
  });
  for (let q = 0n; q < 300n; q++) {
    const a = recycle(q, 7n, 3n, 37n, 59n, 47n);
    assert.equal(a.floor + a.reserve + a.working + a.burned, q);
  }
});
test("cooperation: committed funding needs exact policy consent, is atomic and idempotent", async (t) => {
  const { f, p } = await poolFixture(t, "0");
  const before = await balance(f.buyer);
  const b = {
    destination: "WORKING",
    amount_microtu: "50000",
    policy_sha256: p.policy_sha256,
    consent: "COMMITTED_LAB_CREDITS_NO_REDEMPTION",
    idempotency_key: randomUUID(),
  };
  const a = await Promise.all([
    coop().fund(f.buyer, p.id, b),
    coop().fund(f.buyer, p.id, b),
  ]);
  assert.equal(a[0].id, a[1].id);
  assert.equal(before - (await balance(f.buyer)), 50000n);
  await assert.rejects(
    coop().fund(f.buyer, p.id, { ...b, amount_microtu: "50001" }),
    /Identificador/,
  );
  await assert.rejects(
    coop().fund(f.buyer, p.id, {
      ...b,
      idempotency_key: randomUUID(),
      policy_sha256: hash("wrong"),
    }),
    /hash/,
  );
  await assert.rejects(
    coop().fund(f.buyer, p.id, {
      ...b,
      idempotency_key: randomUUID(),
      amount_microtu: "100000001",
    }),
    /Saldo/,
  );
  assert.equal(
    (
      await db.pool.query("SELECT balance FROM ledger_accounts WHERE id=$1", [
        p.working_account,
      ])
    ).rows[0].balance,
    "50000",
  );
});
test("cooperation: a plan cannot double count the same physical capacity across groups", async (t) => {
  const { f, data } = await poolFixture(t);
  await assert.rejects(
    coop().create(f.buyer, {
      ...data,
      idempotency_key: randomUUID(),
      groups: [data.groups[0], { ...data.groups[0], key: "duplicate" }],
    }),
    /duplicar/,
  );
  await assert.rejects(
    coop().manage(f.root, (await coop().list(f.root))[0].id, {
      paused: true,
      reason: "Unauthorized alteration attempt",
    }),
    /responsável/,
  );
});
test("cooperation: one funded complete window per group and exact readiness-only provider consent", async (t) => {
  const { f, p } = await poolFixture(t);
  const input = {
    group_key: "essential",
    source: "WORKING",
    reason: "Explicit funded readiness-only terms",
    idempotency_key: randomUUID(),
  };
  const [l, retry] = await Promise.all([
    coop().offer(f.buyer, p.id, input),
    coop().offer(f.buyer, p.id, input),
  ]);
  assert.equal(l.id, retry.id);
  assert.equal(l.terms.compensation, "READINESS_ONLY");
  assert.equal(l.terms.cooperative.policy_sha256, p.policy_sha256);
  await assert.rejects(
    coop().offer(f.buyer, p.id, { ...input, idempotency_key: randomUUID() }),
    /já tem/,
  );
  await assert.rejects(
    new RouteAvailability(db).accept(f.root, l.id, {
      terms_sha256: hash("wrong"),
    }),
    /termos/,
  );
  await new RouteAvailability(db).cancel(f.buyer, l.id);
  assert.equal(
    (
      await db.pool.query("SELECT balance FROM ledger_accounts WHERE id=$1", [
        p.working_account,
      ])
    ).rows[0].balance,
    "10000000",
  );
});
test("cooperation: protected reserve requires an essential working shortfall and records one incident", async (t) => {
  const { f, p } = await poolFixture(t, "10000", "30000");
  const input = {
    group_key: "essential",
    source: "RESERVE",
    reason: "Essential renewal requires protected contingency",
    idempotency_key: randomUUID(),
  };
  await assert.rejects(coop().offer(f.buyer, p.id, input), /capital de giro/);
  const q = await poolFixture(t, "0", "30000");
  const l = await coop().offer(q.f.buyer, q.p.id, input);
  assert.equal(l.terms.cooperative.funding_source, "RESERVE");
  const retry = await coop().offer(q.f.buyer, q.p.id, input);
  assert.equal(retry.id, l.id);
  assert.equal(
    (
      await db.pool.query(
        "SELECT count(*)::int AS n FROM cooperative_incidents WHERE pool_id=$1",
        [q.p.id],
      )
    ).rows[0].n,
    1,
  );
  await new RouteAvailability(db).cancel(q.f.buyer, l.id);
  assert.equal(
    (
      await db.pool.query("SELECT balance FROM ledger_accounts WHERE id=$1", [
        q.p.reserve_account,
      ])
    ).rows[0].balance,
    "30000",
  );
});
test("cooperation: uncovered requests do not block eligible ordinary work", async (t) => {
  const { f, p } = await poolFixture(t);
  const waiting = await job(f, f.modelId, p.id);
  const ordinary = await job(f);
  assert.equal((await sessions.admit(waiting.id)).state, "QUEUED");
  assert.equal((await sessions.admit(ordinary.id)).state, "PREPARING");
  await sessions.cancel(f.buyer, ordinary.id);
  await sessions.cancel(f.buyer, waiting.id);
});
test("cooperation: signed admission binds coverage, caps execution deadline and recycles only verified consumption", async (t) => {
  const { f, p } = await poolFixture(t);
  const l = await coopWindow(f, p);
  const j = await started(f, p.id);
  const claims = JSON.parse(
    Buffer.from(j.a.capability.split(".")[1], "base64url").toString(),
  );
  assert.equal(claims.coverage_lease_id, l.id);
  assert.equal(claims.cooperative_pool_id, p.id);
  const active = await sessions.get(f.buyer, j.s.id);
  const lease = (
    await db.pool.query(
      "SELECT ends_ms FROM route_availability_leases WHERE id=$1",
      [l.id],
    )
  ).rows[0];
  assert.ok(
    new Date(active.execution_deadline).getTime() <= Number(lease.ends_ms),
  );
  for (const part of f.parts.slice(1))
    await sessions.stageReceipt(part.nodeId, j.stage);
  const before = (
    await db.pool.query("SELECT balance FROM ledger_accounts WHERE id=$1", [
      p.reserve_account,
    ])
  ).rows[0].balance;
  await sessions.receipt(f.parts[0].nodeId, j.root);
  await sessions.receipt(f.parts[0].nodeId, j.root);
  const done = await sessions.get(f.buyer, j.s.id);
  assert.equal(done.billing_state, "SETTLED");
  assert.equal(done.charged_microtu, "160000");
  assert.ok(done.participants.every((v: any) => v.paid_microtu === "0"));
  assert.equal(
    BigInt(
      (
        await db.pool.query("SELECT balance FROM ledger_accounts WHERE id=$1", [
          p.reserve_account,
        ])
      ).rows[0].balance,
    ) - BigInt(before),
    160000n,
  );
  assert.equal(
    (
      await db.pool.query(
        "SELECT count(*)::int AS n FROM cooperative_settlements WHERE session_id=$1",
        [j.s.id],
      )
    ).rows[0].n,
    1,
  );
  await assert.rejects(
    db.pool.query(
      "UPDATE sessions SET cooperative_pool_id=NULL,cooperative_policy_sha256=NULL WHERE id=$1",
      [j.s.id],
    ),
    /immutable|must match its quote/,
  );
});
test("cooperation: completed usage refund reverses exact destinations once without changing grants", async (t) => {
  const { f, p } = await poolFixture(t);
  await coopWindow(f, p);
  const done = await settleCoop(f, p);
  const b = await balance(f.buyer);
  await assert.rejects(
    coop().refund(f.buyer, done.id, {
      reason: "Consumer cannot approve own settlement refund",
    }),
    /administração/,
  );
  const input = { reason: "Verified isolated service dispute full refund" };
  const a = await Promise.all([
    coop().refund(admin, done.id, input),
    coop().refund(admin, done.id, input),
  ]);
  assert.equal(a[0].journal_id, a[1].journal_id);
  assert.equal((await balance(f.buyer)) - b, 160000n);
  assert.equal(
    (await sessions.get(f.buyer, done.id)).billing_state,
    "REFUNDED",
  );
});
test("cooperation: refunds cannot spend escrow or create replacement credits after recycled funds are spent", async (t) => {
  const { f, p } = await poolFixture(t, "0", "6000");
  await coopWindow(f, p, "RESERVE");
  const done = await settleCoop(f, p);
  const l = (await new RouteAvailability(db).list(f.buyer)).find(
    (v) => v.terms.cooperative?.pool_id === p.id,
  )!;
  await owner.query(
    "UPDATE route_availability_leases SET started_ms=started_ms-3600000,ends_ms=ends_ms-3600000 WHERE id=$1",
    [l.id],
  );
  await new RouteAvailability(db).reconcile();
  await coop().offer(f.buyer, p.id, {
    group_key: "essential",
    source: "WORKING",
    reason: "Recycled working capital funds next useful window",
    idempotency_key: randomUUID(),
  });
  await assert.rejects(
    coop().refund(admin, done.id, {
      reason: "Refund must wait for exact destination replenishment",
    }),
    /Saldo/,
  );
  assert.equal(
    (
      await db.pool.query(
        "SELECT count(*)::int AS n FROM cooperative_refunds WHERE session_id=$1",
        [done.id],
      )
    ).rows[0].n,
    0,
  );
});
test("cooperation: operational pause blocks new acceptances while preserving already funded obligations", async (t) => {
  const { f, p } = await poolFixture(t);
  const l = await coop().offer(f.buyer, p.id, {
    group_key: "essential",
    source: "WORKING",
    reason: "Pause before final independent operator acceptance",
    idempotency_key: randomUUID(),
  });
  await coop().manage(f.buyer, p.id, {
    paused: true,
    reason: "Bounded operational support is paused",
  });
  for (const provider of f.providers.slice(0, 2))
    await new RouteAvailability(db).accept(provider, l.id, {
      terms_sha256: l.terms_sha256,
    });
  await assert.rejects(
    new RouteAvailability(db).accept(f.providers[2]!, l.id, {
      terms_sha256: l.terms_sha256,
    }),
    /apoio operacional/,
  );
  await new RouteAvailability(db).cancel(f.buyer, l.id);
  assert.equal(
    (
      await db.pool.query("SELECT balance FROM ledger_accounts WHERE id=$1", [
        p.working_account,
      ])
    ).rows[0].balance,
    "10000000",
  );
});

test("cooperation: spent destinations and burn reversals remain exactly backed", async (t) => {
  const { f, p } = await poolFixture(t, "10000000", "25920000");
  await coopWindow(f, p);
  const done = await settleCoop(f, p);
  const x = (
    await db.pool.query(
      "SELECT * FROM cooperative_settlements WHERE session_id=$1",
      [done.id],
    )
  ).rows[0];
  assert.equal(x.burned_microtu, "160000");
  assert.equal(
    (
      await db.pool.query("SELECT balance FROM ledger_accounts WHERE id=$1", [
        p.burn_account,
      ])
    ).rows[0].balance,
    "160000",
  );
  await coop().refund(admin, done.id, {
    reason: "Verified service correction reverses only original burn",
  });
  assert.equal(
    (
      await db.pool.query("SELECT balance FROM ledger_accounts WHERE id=$1", [
        p.burn_account,
      ])
    ).rows[0].balance,
    "0",
  );
});
test("cooperation: recovery requires continuous full-day observations and resets after a coordinator gap", async (t) => {
  const { f, p } = await poolFixture(t, "10000000", "25920000");
  await coop().reconcile();
  assert.equal(
    (await coop().list(f.buyer)).find((v) => v.id === p.id)!.state,
    "RECOVERY",
  );
  // An isolated fixture clock proves the transition; this is not a real 24-hour campaign.
  await owner.query(
    "UPDATE cooperative_pools SET healthy_since=now()-interval '25 hours',sample_at=now() WHERE id=$1",
    [p.id],
  );
  await coop().reconcile();
  assert.equal(
    (await coop().list(f.buyer)).find((v) => v.id === p.id)!.state,
    "NORMAL",
  );
  await owner.query(
    "UPDATE cooperative_pools SET sample_at=now()-interval '7 seconds' WHERE id=$1",
    [p.id],
  );
  await coop().reconcile();
  assert.equal(
    (await coop().list(f.buyer)).find((v) => v.id === p.id)!.state,
    "RECOVERY",
  );
  await coop().manage(f.buyer, p.id, {
    paused: true,
    reason: "End of bounded isolated recovery contract",
  });
  await coop().reconcile();
  assert.equal(
    (await coop().list(f.buyer)).find((v) => v.id === p.id)!.state,
    "HIBERNATING",
  );
});
test("cooperation: committed plans, settlements and runtime policy permissions are immutable", async (t) => {
  const { f, p } = await poolFixture(t);
  await assert.rejects(
    db.pool.query("UPDATE cooperative_pools SET policy='{}' WHERE id=$1", [
      p.id,
    ]),
    { code: "42501" },
  );
  await assert.rejects(
    db.pool.query(
      "INSERT INTO cooperative_groups(pool_id,group_key,model_id,rate_microtu_per_second,duration_seconds) VALUES($1,'extra',$2,100,60)",
      [p.id, f.modelId],
    ),
    /committed cooperative plan/,
  );
  await assert.rejects(
    db.pool.query("DELETE FROM cooperative_funding WHERE pool_id=$1", [p.id]),
    { code: "42501" },
  );
  const overall = (
    await db.pool.query("SELECT sum(balance)::text AS n FROM ledger_accounts")
  ).rows[0].n;
  assert.equal(overall, "0");
});
