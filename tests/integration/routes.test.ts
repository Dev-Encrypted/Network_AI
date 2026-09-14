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
import { Sessions } from "../../apps/control-api/src/sessions.js";
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
async function job(f: Fixture, model = f.modelId) {
  const q = await market.quote(f.buyer, { model, max_output_tokens: 128 });
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
async function started(f: Fixture) {
  const s = await job(f),
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
