// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Real PostgreSQL tests in a fresh disposable database. No inference is simulated as hardware evidence.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { randomUUID, generateKeyPairSync, sign } from "node:crypto";
import { join } from "node:path";
import { Auth, type User } from "../../apps/control-api/src/auth.js";
import { Database } from "../../apps/control-api/src/db.js";
import { Market } from "../../apps/control-api/src/market.js";
import { Nodes } from "../../apps/control-api/src/nodes.js";
import { Sessions } from "../../apps/control-api/src/sessions.js";
import {
  createAccounts,
  availableAccount,
  post,
} from "../../apps/control-api/src/ledger.js";
import {
  hash,
  passwordHash,
  secret,
} from "../../apps/control-api/src/security.js";
import type { Config } from "../../apps/control-api/src/config.js";

const require = createRequire(
  new URL("../../apps/control-api/package.json", import.meta.url),
);
const { Pool } = require("pg");
const name = `network_ai_test_${randomUUID().replaceAll("-", "")}`;
let owner: any;
let server: any;
let db: Database;
let auth: Auth;
let market: Market;
let nodes: Nodes;
let sessions: Sessions;
let config: Config;
const admin: User = {
  id: randomUUID(),
  login: "admin_test",
  name: "Administrador de testes",
  role: "admin",
};
before(async () => {
  const raw = JSON.parse(
    await readFile(".runtime/private-lab/config.json", "utf8"),
  );
  const ownerUrl = new URL(raw.database_owner_url);
  server = new Pool({ connectionString: ownerUrl.toString() });
  assert.match(name, /^network_ai_test_[a-f0-9]{32}$/);
  await server.query(`CREATE DATABASE "${name}"`);
  ownerUrl.pathname = `/${name}`;
  owner = new Pool({
    connectionString: ownerUrl.toString(),
    options: "-c search_path=nai,public",
  });
  for (const file of (await readdir("infra/migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await owner.query(await readFile(join("infra/migrations", file), "utf8"));
  const runtimeUrl = new URL(raw.database_url);
  runtimeUrl.pathname = `/${name}`;
  config = {
    ...raw,
    database_url: runtimeUrl.toString(),
    database_owner_url: ownerUrl.toString(),
  };
  db = new Database(config.database_url);
  auth = new Auth(db, config);
  market = new Market(db, auth);
  nodes = new Nodes(db);
  sessions = new Sessions(db, config);
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
  if (db) await db.pool.end();
  if (owner) await owner.end();
  if (server) {
    assert.match(name, /^network_ai_test_[a-f0-9]{32}$/);
    await server.query(`DROP DATABASE IF EXISTS "${name}"`);
    await server.end();
  }
});
async function member() {
  return auth.createUser(admin, {
    login: `u_${randomUUID()}`,
    name: "Operador de teste",
    password: secret(),
    role: "member",
  });
}
async function fund(user: User, value = "100000000") {
  return market.grant(admin, {
    user_id: user.id,
    amount_microtu: value,
    idempotency_key: randomUUID(),
    reason: "Créditos da campanha automatizada isolada",
  });
}
async function fixture() {
  const user = await member();
  await fund(user);
  const modelId = `test-${randomUUID()}`;
  const manifest = {
    schema_version: 1,
    model_id: modelId,
    display_name: "Modelo de protocolo isolado",
    backend_model: "test-engine",
    revision: "fixture-v1",
    artifact_sha256: hash("fixture"),
    license_id: "Apache-2.0",
    source_url: "https://example.org/test",
    modality: "text",
    max_context_tokens: 8192,
    max_output_tokens: 512,
    max_input_bytes: 6000,
    input_rate_microtu: "1000",
    output_rate_microtu: "3000",
    rate_denominator: 1,
    description: "Contract fixture; never offered by a real engine",
    trust_policy: "private_lab",
  };
  await market.publish(user, manifest);
  await market.qualify(admin, modelId, {
    state: "LOCAL_PREVIEW",
    note: "Isolated protocol fixture for transactional tests only.",
  });
  const domain = await market.domain(admin, {
    name: "Isolated physical fixture",
    owner_id: user.id,
    slots: 1,
  });
  const invitation = await market.invite(admin, {
    name: "Fixture node",
    owner_id: user.id,
    resource_domain_id: domain.id,
    model_id: modelId,
    base_url: "http://127.0.0.1:43200",
  });
  await owner.query(
    `UPDATE nodes SET state='READY',epoch=1,boot_id=$2,last_seen=now(),loaded_backend_models='["test-engine"]' WHERE id=$1`,
    [invitation.id, randomUUID()],
  );
  return { user, modelId, nodeId: invitation.id, domainId: domain.id };
}
async function job(
  f: Awaited<ReturnType<typeof fixture>>,
  user = f.user,
  key = randomUUID(),
  requestHash = hash("request"),
) {
  const quote = await market.quote(user, {
    model: f.modelId,
    max_output_tokens: 128,
  });
  return sessions.create(user, {
    quote_id: quote.id,
    idempotency_key: key,
    request_sha256: requestHash,
    request_bytes: 100,
    model: f.modelId,
    max_tokens: 128,
    content_bytes: 10,
    message_count: 1,
  });
}
test("new members have zero initial balance", async () => {
  const user = await member();
  const wallet = await market.wallet(user);
  assert.deepEqual(
    wallet.accounts.map((row) => row.balance),
    ["0", "0"],
  );
});
test("member cannot grant or qualify", async () => {
  const user = await member();
  await assert.rejects(() => market.grant(user, {}), {
    code: "admin_required",
  });
  await assert.rejects(() => market.qualify(user, "x", {}), {
    code: "admin_required",
  });
});
test("grant is bound to its idempotency payload", async () => {
  const user = await member();
  const data = {
    user_id: user.id,
    amount_microtu: "1000",
    idempotency_key: randomUUID(),
    reason: "Grant idempotency validation",
  };
  const a = await market.grant(admin, data);
  assert.deepEqual(await market.grant(admin, data), a);
  await assert.rejects(
    () => market.grant(admin, { ...data, amount_microtu: "2000" }),
    { code: "idempotency_conflict" },
  );
});
test("runtime cannot mutate balance or inject a nonzero starting balance", async () => {
  await assert.rejects(
    () =>
      db.pool.query(
        "UPDATE ledger_accounts SET balance=999 WHERE id='lab:working'",
      ),
    { code: "42501" },
  );
  await assert.rejects(
    () =>
      db.pool.query(
        "INSERT INTO ledger_accounts(id,kind,balance) VALUES('injected','AVAILABLE',999)",
      ),
    { code: "42501" },
  );
});
test("runtime cannot mutate or append to committed journal", async () => {
  const user = await member();
  const grant = await fund(user, "10000");
  await assert.rejects(
    () =>
      db.pool.query("UPDATE journal SET kind='changed' WHERE id=$1", [
        grant.journal_id,
      ]),
    { code: "42501" },
  );
  await assert.rejects(
    () =>
      db.pool.query("DELETE FROM journal_lines WHERE journal_id=$1", [
        grant.journal_id,
      ]),
    { code: "42501" },
  );
  await assert.rejects(
    () =>
      db.pool.query(
        "INSERT INTO journal_lines(journal_id,account_id,amount) VALUES($1,'lab:working',1)",
        [grant.journal_id],
      ),
    /cannot append to committed journal/,
  );
});
test("unbalanced journal is rejected at commit and rolls back projection", async () => {
  const before = (
    await db.pool.query(
      "SELECT balance FROM ledger_accounts WHERE id='lab:working'",
    )
  ).rows[0].balance;
  await assert.rejects(
    () =>
      db.transaction(async (tx) => {
        const id = randomUUID();
        await tx.query(
          "INSERT INTO journal(id,business_key,kind) VALUES($1,$2,'BAD')",
          [id, id],
        );
        await tx.query(
          "INSERT INTO journal_lines(journal_id,account_id,amount) VALUES($1,'lab:working',1)",
          [id],
        );
      }),
    /unbalanced journal/,
  );
  assert.equal(
    (
      await db.pool.query(
        "SELECT balance FROM ledger_accounts WHERE id='lab:working'",
      )
    ).rows[0].balance,
    before,
  );
});
test("concurrent overspending admits only a funded reservation", async () => {
  const user = await member();
  await fund(user, "10000");
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      db.transaction((tx) =>
        post(tx, randomUUID(), "SPEND", [
          [availableAccount(user.id), -8000n],
          ["lab:working", 8000n],
        ]),
      ),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await market.wallet(user)).accounts.find((a) => a.kind === "AVAILABLE")!
      .balance,
    "2000",
  );
});
test("concurrent session retries reserve exactly once", async () => {
  const f = await fixture();
  const key = randomUUID();
  const jobs = await Promise.all([job(f, f.user, key), job(f, f.user, key)]);
  assert.equal(jobs[0].id, jobs[1].id);
  assert.equal(jobs.filter((s) => s.reused).length, 1);
  assert.equal(
    (
      await db.pool.query(
        "SELECT count(*)::int AS n FROM journal WHERE business_key=$1",
        [`hold:${jobs[0].id}`],
      )
    ).rows[0].n,
    1,
  );
  await assert.rejects(() => job(f, f.user, key, hash("changed")), {
    code: "idempotency_conflict",
  });
  await sessions.cancel(f.user, jobs[0].id);
});
test("session ownership blocks another member", async () => {
  const f = await fixture();
  const s = await job(f);
  const other = await member();
  await assert.rejects(() => sessions.get(other, s.id), {
    code: "session_missing",
  });
  await assert.rejects(() => sessions.cancel(other, s.id), {
    code: "session_missing",
  });
  await sessions.cancel(f.user, s.id);
});
test("revoked or unqualified models cannot be quoted", async () => {
  const f = await fixture();
  await market.qualify(admin, f.modelId, {
    state: "REVOKED",
    note: "Fixture revocation for access validation.",
  });
  await assert.rejects(
    () => market.quote(f.user, { model: f.modelId, max_output_tokens: 128 }),
    { code: "model_unavailable" },
  );
});
test("expired quote cannot reserve credits", async () => {
  const f = await fixture();
  const quote = await market.quote(f.user, {
    model: f.modelId,
    max_output_tokens: 128,
  });
  await owner.query(
    "UPDATE quotes SET expires_at=now()-interval '1 second' WHERE id=$1",
    [quote.id],
  );
  await assert.rejects(
    () =>
      sessions.create(f.user, {
        quote_id: quote.id,
        idempotency_key: randomUUID(),
        request_sha256: hash("x"),
        request_bytes: 100,
        model: f.modelId,
        max_tokens: 128,
        content_bytes: 1,
        message_count: 1,
      }),
    { code: "quote_expired" },
  );
});
test("two process nodes do not double a physical slot", async () => {
  const f = await fixture();
  const second = await market.invite(admin, {
    name: "Second fixture",
    owner_id: f.user.id,
    resource_domain_id: f.domainId,
    model_id: f.modelId,
    base_url: "http://127.0.0.1:43201",
  });
  await owner.query(
    `UPDATE nodes SET state='READY',epoch=1,last_seen=now(),loaded_backend_models='["test-engine"]' WHERE id=$1`,
    [second.id],
  );
  const a = await job(f);
  const b = await job(f);
  assert.equal((await sessions.admit(a.id)).state, "PREPARING");
  assert.equal((await sessions.admit(b.id)).state, "QUEUED");
  await sessions.cancel(f.user, a.id);
  await sessions.cancel(f.user, b.id);
});
test("admission rotates between funded tenants instead of exhausting one queue", async () => {
  const f = await fixture();
  const other = await member();
  await fund(other);
  const a = await job(f);
  const b = await job(f);
  const c = await job(f, other);
  assert.equal((await sessions.admit(a.id)).state, "PREPARING");
  await sessions.cancel(f.user, a.id);
  assert.equal((await sessions.admit(b.id)).state, "QUEUED");
  assert.equal((await sessions.admit(c.id)).state, "PREPARING");
  await sessions.cancel(other, c.id);
  await sessions.cancel(f.user, b.id);
});
test("signed node request rejects repeated nonce and modified body", async () => {
  const f = await fixture();
  const keys = generateKeyPairSync("ed25519");
  const raw = keys.publicKey
    .export({ format: "der", type: "spki" })
    .subarray(-32)
    .toString("base64url");
  await owner.query("UPDATE nodes SET public_key=$2 WHERE id=$1", [
    f.nodeId,
    raw,
  ]);
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = secret();
  const path = `/api/v1/nodes/${f.nodeId}/heartbeat`;
  const body = Buffer.from("{}");
  const signature = sign(
    null,
    Buffer.from(
      `network-ai/node/v1\nPOST\n${path}\n${timestamp}\n${nonce}\n${hash(body)}`,
    ),
    keys.privateKey,
  ).toString("base64url");
  const req = {
    method: "POST",
    url: path,
    rawBody: body,
    headers: {
      "x-node-timestamp": String(timestamp),
      "x-node-nonce": nonce,
      "x-node-signature": signature,
    },
  };
  await nodes.signed(req as any, f.nodeId);
  await assert.rejects(() => nodes.signed(req as any, f.nodeId), {
    code: "nonce_replayed",
  });
  await assert.rejects(
    () =>
      nodes.signed(
        { ...req, rawBody: Buffer.from('{"x":1}') } as any,
        f.nodeId,
      ),
    { code: "node_signature" },
  );
});
test("claim consumes authorization once and signed receipt settles once", async () => {
  const f = await fixture();
  const s = await job(f);
  const a = await sessions.admit(s.id);
  const prepare = secret();
  await sessions.authorize(s.id, { prepare_id: prepare });
  const claim = {
    session_id: s.id,
    attempt_id: a.attempt_id,
    epoch: 1,
    prepare_id: prepare,
  };
  await sessions.claim(f.nodeId, claim);
  await assert.rejects(() => sessions.claim(f.nodeId, claim), {
    code: "claim_rejected",
  });
  const receipt = {
    session_id: s.id,
    attempt_id: a.attempt_id,
    epoch: 1,
    state: "COMPLETED",
    prompt_tokens: 12,
    completion_tokens: 8,
    output_sha256: hash("contract output"),
    stream_done: true,
    finish_reason: "stop",
    error_code: null,
    elapsed_ms: 100,
    metering_source: "engine_reported",
  };
  const result = await sessions.receipt(f.nodeId, receipt);
  assert.equal(result.charged_microtu, "36000");
  assert.equal((await sessions.receipt(f.nodeId, receipt)).duplicate, true);
  await assert.rejects(
    () => sessions.receipt(f.nodeId, { ...receipt, completion_tokens: 9 }),
    { code: "receipt_conflict" },
  );
  const finished = await sessions.get(f.user, s.id);
  assert.equal(finished.billing_state, "SETTLED");
  assert.equal(finished.state, "COMPLETED");
});
test("invalid metering is disputed, not charged", async () => {
  const f = await fixture();
  const s = await job(f);
  const a = await sessions.admit(s.id);
  const prepare = secret();
  await sessions.authorize(s.id, { prepare_id: prepare });
  await sessions.claim(f.nodeId, {
    session_id: s.id,
    attempt_id: a.attempt_id,
    epoch: 1,
    prepare_id: prepare,
  });
  await sessions.receipt(f.nodeId, {
    session_id: s.id,
    attempt_id: a.attempt_id,
    epoch: 1,
    state: "COMPLETED",
    prompt_tokens: 12,
    completion_tokens: 129,
    output_sha256: hash("invalid"),
    stream_done: true,
    finish_reason: "length",
    error_code: null,
    elapsed_ms: 100,
    metering_source: "engine_reported",
  });
  const result = await sessions.get(f.user, s.id);
  assert.equal(result.billing_state, "DISPUTED");
  assert.equal(result.charged_microtu, "0");
});
test("reconciliation refunds an abandoned execution and fences old epoch", async () => {
  const f = await fixture();
  const s = await job(f);
  await sessions.admit(s.id);
  await nodes.resume(f.nodeId, { boot_id: randomUUID() });
  await sessions.reap();
  const result = await sessions.get(f.user, s.id);
  assert.equal(result.state, "INTERRUPTED");
  assert.equal(result.billing_state, "REFUNDED");
});
test("global accounting projection matches immutable lines and sums to zero", async () => {
  const total = await db.pool.query(
    "SELECT sum(balance)::text AS total FROM ledger_accounts",
  );
  assert.equal(total.rows[0].total, "0");
  const mismatch = await db.pool.query(
    `SELECT a.id FROM ledger_accounts a LEFT JOIN journal_lines l ON l.account_id=a.id GROUP BY a.id HAVING a.balance<>coalesce(sum(l.amount),0)`,
  );
  assert.equal(mismatch.rowCount, 0);
  const held = await db.pool.query(
    `SELECT a.id FROM ledger_accounts a WHERE kind='HELD' AND balance<>coalesce((SELECT sum(hold_microtu) FROM sessions s WHERE s.user_id=a.owner_id AND s.billing_state='HELD'),0)`,
  );
  assert.equal(held.rowCount, 0);
});
