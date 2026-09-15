// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const config = JSON.parse(
  await readFile(".runtime/private-lab/config.json", "utf8"),
);

test("complete route readiness survives a lost funding response and preserves the accepted window", async ({
  page,
}) => {
  const profile = await readFile(".runtime/private-lab/cpu-route.json", "utf8")
    .then(JSON.parse)
    .catch(() => null);
  test.skip(
    !profile,
    "Requires the explicitly installed private CPU route; no fake readiness is substituted.",
  );
  await page.goto("/");
  await page.getByLabel("Usuário", { exact: true }).fill(config.admin_login);
  await page.getByLabel("Senha", { exact: true }).fill(config.admin_password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("button", { name: "Meus nós", exact: true }).click();
  const section = page.locator(".route-availability-section");
  const reason = `Browser funded route window ${randomUUID().slice(0, 8)}`;
  const auth = { headers: { Origin: config.web_origin } };
  let id: string | undefined;
  let dropped = false;
  await page.route("**/api/v1/availability/routes", async (route) => {
    if (!dropped && route.request().method() === "POST") {
      dropped = true;
      const created = await route.fetch();
      expect(created.status()).toBe(201);
      id = (await created.json()).id;
      await route.abort("failed");
    } else await route.continue();
  });
  try {
    await section
      .getByRole("combobox", { name: "Rota beneficiada", exact: true })
      .selectOption(profile.route_id);
    await section
      .getByLabel("Duração da janela (segundos)", { exact: true })
      .fill("30");
    await section
      .getByRole("combobox", { name: "Finalidade da janela", exact: true })
      .selectOption("EXPERIMENT");
    await section
      .getByLabel("Por que manter esta rota disponível?", { exact: true })
      .fill(reason);
    await section
      .getByRole("button", { name: "Financiar janela da rota", exact: true })
      .click();
    await expect(section.getByRole("alert")).toBeVisible();
    // The same unchanged logical offer must reuse its identity after a lost reply.
    await section
      .getByRole("button", { name: "Financiar janela da rota", exact: true })
      .click();
    await expect(section.getByRole("status")).toContainText(
      "Orçamento reservado",
    );
    const ls = (
      await (await page.request.get("/api/v1/availability/routes")).json()
    ).data.filter((l: any) => l.reason === reason);
    expect(ls).toHaveLength(1);
    expect(ls[0].id).toBe(id);
    const card = section.locator(".coverage-card").filter({ hasText: reason });
    await expect(card).toContainText("Aguardando todos os operadores");
    await card
      .getByRole("button", { name: "Aceitar janela", exact: true })
      .click();
    await expect(card).toContainText("Janela ativa");
    await expect(
      card.getByRole("cell", { name: "Aceito", exact: true }),
    ).toHaveCount(3);
    await expect
      .poll(
        async () => {
          const row = (
            await (await page.request.get("/api/v1/availability/routes")).json()
          ).data.find((l: any) => l.id === id);
          return BigInt(row.paid_microtu) > 0n;
        },
        { timeout: 12000 },
      )
      .toBe(true);
    await card.getByText("Termos desta janela", { exact: true }).click();
    await expect(card).toContainText(
      "30 segundos; 1000 microcréditos por segundo",
    );
    await mkdir(".runtime/private-lab/screenshots", { recursive: true });
    await card.screenshot({
      path: ".runtime/private-lab/screenshots/route-availability-desktop.png",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await card.screenshot({
      path: ".runtime/private-lab/screenshots/route-availability-mobile.png",
    });
    await card
      .getByRole("button", { name: "Encerrar minha contribuição", exact: true })
      .click();
    await expect(card).toContainText("Concluindo compromissos");
    await expect(
      card.getByRole("cell", { name: "Contribuição encerrada", exact: true }),
    ).toHaveCount(3);
    await expect(card).toContainText("Janela concluída", { timeout: 40000 });
  } finally {
    if (id)
      await page.request.post(`/api/v1/availability/routes/${id}/cancel`, {
        ...auth,
        data: {},
      });
  }
});

test("route proposal, consent, qualification and withdrawal work in the browser", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Usuário", { exact: true }).fill(config.admin_login);
  await page.getByLabel("Senha", { exact: true }).fill(config.admin_password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("button", { name: "Meus nós", exact: true }).click();
  const auth = { headers: { Origin: config.web_origin } };
  const me = await (await page.request.get("/api/v1/me")).json();
  const ns = (await (await page.request.get("/api/v1/nodes")).json()).data;
  const original = ns.find((n: any) => n.id === config.node_id);
  const label = `Browser route ${randomUUID().slice(0, 8)}`;
  const ids: string[] = [];
  let routeId: string | undefined;
  try {
    for (let i = 0; i < 2; i++) {
      const r = await page.request.post("/api/v1/admin/node-invites", {
        ...auth,
        data: {
          name: `${label} ${i}`,
          owner_id: me.id,
          resource_domain_id: original.resource_domain_id,
          model_id: original.model_id,
          base_url: `http://127.0.0.1:${43294 + i}`,
          node_kind: i === 0 ? "ROUTE_ROOT" : "RPC_STAGE",
        },
      });
      expect(r.ok()).toBe(true);
      ids.push((await r.json()).id);
    }
    // This browser journey verifies the control workflow, with OFFLINE nodes.
    // It makes no claim that these fixture identities executed any inference.
    await page.reload();
    await page.getByRole("button", { name: "Meus nós", exact: true }).click();
    const section = page.locator(".routes-section");
    await section
      .getByRole("button", { name: "Propor rota", exact: true })
      .click();
    await section.getByLabel("Nome da rota", { exact: true }).fill(label);
    await section
      .getByLabel("Nó principal", { exact: true })
      .selectOption(ids[0], { timeout: 10000 });
    await section
      .getByLabel("Identificador da etapa 1", { exact: true })
      .fill(ids[1]);
    await section
      .getByRole("button", { name: "Registrar proposta", exact: true })
      .click();
    const card = section
      .locator(".route-card")
      .filter({ has: page.getByRole("heading", { name: label, exact: true }) });
    await expect(card).toContainText("Pendente");
    const rs = (await (await page.request.get("/api/v1/routes")).json()).data;
    routeId = rs.find((r: any) => r.name === label).id;
    await card
      .getByRole("button", { name: "Aceitar termos", exact: true })
      .click();
    await expect(
      card.getByRole("cell", { name: "Aceito", exact: true }),
    ).toHaveCount(2);
    await card
      .getByLabel(`Registro de qualificação — ${label}`)
      .fill(
        "Browser workflow fixture only; offline nodes do not qualify real hardware.",
      );
    await card
      .getByRole("button", { name: "Qualificar para teste local", exact: true })
      .click();
    await expect(card).toContainText("Aguardando capacidade");
    await card
      .getByRole("button", { name: "Retirar participação", exact: true })
      .click();
    await expect(
      card.getByRole("cell", { name: "Retirado", exact: true }),
    ).toHaveCount(2);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await card.screenshot({
      path: ".runtime/private-lab/screenshots/route-mobile.png",
    });
    await card
      .getByRole("button", { name: "Encerrar rota", exact: true })
      .click();
    await expect(card.getByText("Encerrada", { exact: true })).toBeVisible();
  } finally {
    if (routeId)
      await page.request
        .post(`/api/v1/admin/routes/${routeId}/qualify`, {
          ...auth,
          data: {
            state: "REVOKED",
            note: "Browser fixture cleanup; preserve historical workflow evidence.",
          },
        })
        .catch(() => {});
    for (const id of ids)
      await page.request
        .post(`/api/v1/nodes/${id}/state`, {
          ...auth,
          data: { state: "REVOKED" },
        })
        .catch(() => {});
  }
});
test("availability funding, operator acceptance and closure work in the browser", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Usuário", { exact: true }).fill(config.admin_login);
  await page.getByLabel("Senha", { exact: true }).fill(config.admin_password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("button", { name: "Meus nós", exact: true }).click();
  const section = page.locator(".availability-section");
  await expect(
    section.getByRole("heading", { name: "Contratos de disponibilidade" }),
  ).toBeVisible();
  await section.getByLabel("Nó beneficiado").fill(config.node_id);
  await section.getByLabel("Duração (segundos)").fill("30");
  await section.getByRole("button", { name: "Financiar oferta" }).click();
  const row = section
    .getByRole("row")
    .filter({ hasText: "Operador local" })
    .first();
  await expect(row).toContainText("Aguardando operador");
  try {
    await row.getByRole("button", { name: "Aceitar", exact: true }).click();
    await expect(row).toContainText("Ativo");
    await expect
      .poll(async () => (await row.textContent())?.includes("0.0 s"), {
        timeout: 12000,
      })
      .toBe(false);
    await mkdir(".runtime/private-lab/screenshots", { recursive: true });
    await page.screenshot({
      path: ".runtime/private-lab/screenshots/availability-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const dimensions = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
    await page.screenshot({
      path: ".runtime/private-lab/screenshots/availability-mobile.png",
      fullPage: true,
    });
  } finally {
    await row.getByRole("button", { name: "Encerrar", exact: true }).click();
    await expect(row).toContainText("Encerrado");
  }
});
test("login, real streamed chat, session, wallet, API key and node controls", async ({
  page,
}) => {
  const exceptions: string[] = [];
  page.on("pageerror", (error) => exceptions.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Entre no seu ambiente" }),
  ).toBeVisible();
  await page.getByLabel("Usuário", { exact: true }).fill(config.admin_login);
  await page.getByLabel("Senha", { exact: true }).fill(config.admin_password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Uma conversa. Toda uma rede." }),
  ).toBeVisible();
  await mkdir(".runtime/private-lab/screenshots", { recursive: true });
  await page.screenshot({
    path: ".runtime/private-lab/screenshots/chat-desktop.png",
    fullPage: true,
  });
  await page
    .getByLabel("Sua mensagem")
    .fill("Responda apenas: conexão da rede confirmada.");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.locator(".message.assistant p")).toContainText(
    "confirmada",
    { timeout: 40000 },
  );
  await expect(
    page.getByRole("button", { name: "Interromper", exact: true }),
  ).toHaveCount(0, { timeout: 40000 });
  await page
    .getByRole("button", { name: "Ver esta sessão", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Detalhes da sessão" }),
  ).toBeVisible();
  await expect(page.locator(".detail-panel")).toContainText("Liquidado");
  await page.getByRole("button", { name: "Créditos", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Uso claro. Saldo rastreável." }),
  ).toBeVisible();
  await expect(page.locator("table")).toContainText("Liquidação");
  await page.getByRole("button", { name: "Acesso à API", exact: true }).click();
  const keyLabel = `Jornada de navegador ${randomUUID()}`;
  await page.getByLabel("Nome da integração").fill(keyLabel);
  await page.getByRole("button", { name: "Criar chave", exact: true }).click();
  await expect(page.locator(".key-reveal")).toBeVisible();
  // No screenshot or trace while a newly issued key is displayed.
  const row = page.getByRole("row").filter({ hasText: keyLabel }).last();
  await row.getByRole("button", { name: "Revogar" }).click();
  await expect(row).toContainText("Revogada");
  await page.getByRole("button", { name: "Já salvei a chave" }).click();
  await page.getByRole("button", { name: "Meus nós", exact: true }).click();
  const node = page.getByRole("row").filter({ hasText: "Operador local" });
  await node.getByRole("button", { name: "Pausar", exact: true }).click();
  await expect(
    node.getByRole("button", { name: "Retomar", exact: true }),
  ).toBeVisible();
  await node.getByRole("button", { name: "Retomar", exact: true }).click();
  await expect(
    node.getByRole("button", { name: "Pausar", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Modelos", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Modelos para cada tarefa" }),
  ).toBeVisible();
  await page.screenshot({
    path: ".runtime/private-lab/screenshots/catalog-desktop.png",
    fullPage: true,
  });
  expect(exceptions).toEqual([]);
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Entre no seu ambiente" }),
  ).toBeVisible();
});
test("mobile layout has accessible navigation and no page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Usuário", { exact: true }).fill(config.admin_login);
  await page.getByLabel("Senha", { exact: true }).fill(config.admin_password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Uma conversa. Toda uma rede." }),
  ).toBeVisible();
  await expect(page.getByLabel("Sua mensagem")).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
  await page.screenshot({
    path: ".runtime/private-lab/screenshots/chat-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Acesso à API", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Leve a rede para seu aplicativo" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sair no celular", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Entre no seu ambiente" }),
  ).toBeVisible();
  await expect(page.locator(".alert.error")).toHaveCount(0);
});
test("browser proxy denies internal control routes and rejects malformed requests", async ({
  request,
}) => {
  expect((await request.get("/api/v1/internal/sessions")).status()).toBe(404);
  expect(
    (await request.post("/api/v1/nodes/register", { data: {} })).status(),
  ).toBe(404);
  expect((await request.get("/api/v1/wallet")).status()).toBe(401);
  expect(
    (
      await request.post("/api/v1/auth/login", {
        headers: {
          Origin: config.web_origin,
          "Content-Type": "application/json",
        },
        data: "{",
      })
    ).status(),
  ).toBe(400);
});
test("logout fences a delayed quote and clears conversation state", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Usuário", { exact: true }).fill(config.admin_login);
  await page.getByLabel("Senha", { exact: true }).fill(config.admin_password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Uma conversa. Toda uma rede." }),
  ).toBeVisible();
  const quoted = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const finished = Promise.withResolvers<void>();
  let inferenceRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/inference/")) inferenceRequests++;
  });
  await page.route("**/api/v1/quotes", async (route) => {
    const response = await route.fetch();
    quoted.resolve();
    await release.promise;
    await route.fulfill({ response });
    finished.resolve();
  });
  await page
    .getByLabel("Sua mensagem")
    .fill("Mensagem privada para testar a troca de sessão.");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await quoted.promise;
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Entre no seu ambiente" }),
  ).toBeVisible();
  release.resolve();
  await finished.promise;
  await page.getByLabel("Usuário", { exact: true }).fill(config.admin_login);
  await page.getByLabel("Senha", { exact: true }).fill(config.admin_password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Uma conversa. Toda uma rede." }),
  ).toBeVisible();
  await expect(page.locator(".message")).toHaveCount(0);
  expect(inferenceRequests).toBe(0);
});

test("bounded renewal controls preserve retry identity and revoke only future operator participation", async ({
  page,
}) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(10000);
  const profile = await readFile(".runtime/private-lab/cpu-route.json", "utf8")
    .then(JSON.parse)
    .catch(() => null);
  test.skip(
    !profile,
    "Requires the installed 32B route; no fabricated capacity is substituted.",
  );
  await page.goto("/");
  await page.getByLabel("Usuário", { exact: true }).fill(config.admin_login);
  await page.getByLabel("Senha", { exact: true }).fill(config.admin_password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Cooperação", exact: true }),
  ).toBeVisible();
  const auth = { headers: { Origin: config.web_origin } };
  const created = await page.request.post("/api/v1/cooperative/pools", {
    ...auth,
    data: {
      name: `Browser bounded renewal ${randomUUID().slice(0, 8)}`,
      support_until: new Date(Date.now() + 3600000).toISOString(),
      idempotency_key: randomUUID(),
      groups: [
        {
          key: "essential",
          route_ids: [profile.route_id],
          duration_seconds: 30,
          rate_microtu_per_second: "100",
        },
      ],
    },
  });
  expect(created.status()).toBe(201);
  const p = await created.json();
  const funded = await page.request.post(
    `/api/v1/cooperative/pools/${p.id}/fund`,
    {
      ...auth,
      data: {
        destination: "WORKING",
        amount_microtu: "6000",
        policy_sha256: p.policy_sha256,
        consent: "COMMITTED_LAB_CREDITS_NO_REDEMPTION",
        idempotency_key: randomUUID(),
      },
    },
  );
  expect(funded.status()).toBe(201);
  let authorityId: string | undefined,
    mandateId: string | undefined,
    dropped = false;
  await page.route(`**/cooperative/pools/${p.id}/renewals`, async (route) => {
    if (!dropped && route.request().method() === "POST") {
      dropped = true;
      const r = await route.fetch();
      expect(r.status()).toBe(201);
      authorityId = (await r.json()).id;
      await route.abort("failed");
    } else await route.continue();
  });
  const current = async () =>
    (
      await page.request.get(`/api/v1/cooperative/pools/${p.id}/renewals`)
    ).json();
  try {
    await page.getByRole("button", { name: "Cooperação", exact: true }).click();
    const card = page.locator(`[data-pool-id="${p.id}"]`);
    await card
      .getByText("Renovação automática com limites", { exact: true })
      .click();
    const panel = card.getByRole("region", {
      name: "Autorizações de renovação",
    });
    await panel.getByText("Autorizar gastos do fundo", { exact: true }).click();
    await panel
      .getByLabel("Motivo da autorização do fundo", { exact: true })
      .fill(
        "Browser authorizes bounded gross commitments without limit replenishment",
      );
    await panel
      .getByLabel("Autorizo estes compromissos brutos", { exact: false })
      .check();
    await panel
      .getByRole("button", { name: "Registrar limite do fundo", exact: true })
      .click();
    await expect(panel.getByRole("alert")).toBeVisible();
    const retry = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/cooperative/pools/${p.id}/renewals`) &&
        r.request().method() === "POST",
    );
    await panel
      .getByRole("button", { name: "Registrar limite do fundo", exact: true })
      .click();
    expect((await (await retry).json()).id).toBe(authorityId);
    expect((await current()).authorizations).toHaveLength(1);
    expect((await current()).runs).toHaveLength(0);
    await panel
      .getByText("Autorizar minha participação como operador", { exact: true })
      .click();
    await panel
      .getByRole("combobox", { name: "Minha rota autorizada", exact: true })
      .selectOption(profile.route_id);
    await panel
      .getByLabel("Motivo da minha autorização", { exact: true })
      .fill("Browser operator authorizes readiness-only bounded participation");
    await panel
      .getByLabel("Aceito receber por prontidão", { exact: false })
      .check();
    const accepted = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/cooperative/pools/${p.id}/provider-mandates`) &&
        r.request().method() === "POST",
    );
    await panel
      .getByRole("button", { name: "Registrar minha autorização", exact: true })
      .click();
    mandateId = (await (await accepted).json()).id;
    expect(mandateId).toBeTruthy();
    await expect
      .poll(async () => (await current()).runs.length, { timeout: 12000 })
      .toBe(1);
    const revoke = page.waitForResponse((r) =>
      r.url().endsWith(`/provider-mandates/${mandateId}/revoke`),
    );
    await panel
      .getByRole("button", { name: "Revogar participação futura", exact: true })
      .click();
    expect((await (await revoke).json()).state).toBe("REVOKED");
    const preserved = (await current()).runs[0];
    expect(preserved.state).toBe("ACTIVE");
    await expect
      .poll(
        async () =>
          BigInt((await current()).runs[0].paid_microtu) >
          BigInt(preserved.paid_microtu),
        { timeout: 12000 },
      )
      .toBe(true);
    await expect(
      panel.locator(`[data-provider-mandate="${mandateId}"]`),
    ).toContainText("Revogada");
    await panel.getByText("Autorizar gastos do fundo", { exact: true }).click();
    await panel
      .getByText("Autorizar minha participação como operador", { exact: true })
      .click();
    await mkdir(".runtime/private-lab/screenshots", { recursive: true });
    await panel.screenshot({
      path: ".runtime/private-lab/screenshots/renewal-desktop.png",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await panel.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await panel.screenshot({
      path: ".runtime/private-lab/screenshots/renewal-mobile.png",
    });
    await expect
      .poll(async () => (await current()).runs[0].state, { timeout: 35000 })
      .toBe("COMPLETED");
    await expect
      .poll(async () => (await current()).authorizations[0].last_status, {
        timeout: 12000,
      })
      .toBe("WAITING_FOR_OPERATORS");
    expect((await current()).runs).toHaveLength(1);
    await panel
      .getByRole("button", { name: "Revogar limite do fundo", exact: true })
      .click();
    await expect(
      panel.locator(`[data-renewal-authorization="${authorityId}"]`),
    ).toContainText("Revogada");
  } finally {
    const state = await current();
    for (const m of state.mandates)
      await page.request.post(
        `/api/v1/cooperative/provider-mandates/${m.id}/revoke`,
        { ...auth, data: {} },
      );
    for (const a of state.authorizations)
      await page.request.post(`/api/v1/cooperative/renewals/${a.id}/revoke`, {
        ...auth,
        data: {},
      });
    await page.request.post(`/api/v1/cooperative/pools/${p.id}/manage`, {
      ...auth,
      data: {
        paused: true,
        reason:
          "Browser renewal acceptance completed; future commitments paused, existing windows preserved",
      },
    });
    await expect
      .poll(
        async () =>
          (await current()).runs.every((r: any) =>
            ["COMPLETED", "CANCELLED", "EXPIRED"].includes(r.state),
          ),
        { timeout: 40000 },
      )
      .toBe(true);
  }
});

test("cooperative plan, funding retry, readiness consent and opted-in chat work in the browser", async ({
  page,
}) => {
  const profile = await readFile(".runtime/private-lab/cpu-route.json", "utf8")
    .then(JSON.parse)
    .catch(() => null);
  test.skip(
    !profile,
    "Requires the installed 32B route; never fabricated by CI.",
  );
  await page.goto("/");
  await page.getByLabel("Usuário", { exact: true }).fill(config.admin_login);
  await page.getByLabel("Senha", { exact: true }).fill(config.admin_password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("button", { name: "Cooperação", exact: true }).click();
  const section = page.getByRole("region", { name: "Fundos cooperativos" });
  await section
    .getByText("Criar plano de capacidade essencial", { exact: true })
    .click();
  const name = `Browser cooperative fund ${randomUUID().slice(0, 8)}`;
  await section.getByLabel("Nome do fundo", { exact: true }).fill(name);
  await section
    .getByRole("combobox", { name: "Rota do grupo 1", exact: true })
    .selectOption(profile.route_id);
  await section
    .getByLabel("Duração de cada janela (segundos)", { exact: true })
    .fill("30");
  const created = page.waitForResponse(
    (r) =>
      r.url().endsWith("/cooperative/pools") && r.request().method() === "POST",
  );
  await section
    .getByRole("button", { name: "Criar fundo cooperativo", exact: true })
    .click();
  const p = await (await created).json();
  expect(p.id).toBeTruthy();
  let leaseId: string | undefined,
    dropped = false,
    fundingId: string | undefined;
  const auth = { headers: { Origin: config.web_origin } };
  await page.route(`**/cooperative/pools/${p.id}/fund`, async (route) => {
    if (!dropped) {
      dropped = true;
      const r = await route.fetch();
      expect(r.status()).toBe(201);
      fundingId = (await r.json()).id;
      await route.abort("failed");
    } else await route.continue();
  });
  try {
    const card = page.locator(`[data-pool-id="${p.id}"]`);
    await card
      .getByText("Contribuir com créditos existentes", { exact: true })
      .click();
    await card
      .getByLabel("Contribuição em microcréditos", { exact: true })
      .fill("3000");
    await card.getByRole("checkbox").check();
    await card
      .getByRole("button", { name: "Contribuir para o fundo", exact: true })
      .click();
    await expect(section.getByRole("alert")).toBeVisible();
    const retry = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/cooperative/pools/${p.id}/fund`) &&
        r.request().method() === "POST",
    );
    await card
      .getByRole("button", { name: "Contribuir para o fundo", exact: true })
      .click();
    expect((await (await retry).json()).id).toBe(fundingId);
    await card.getByText("Financiar próxima janela", { exact: true }).click();
    await card
      .getByLabel("Motivo da janela", { exact: true })
      .fill("Browser confirms accepted cooperative readiness-only capacity");
    const window = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/cooperative/pools/${p.id}/windows`) &&
        r.request().method() === "POST",
    );
    await card
      .getByRole("button", {
        name: "Financiar janela cooperativa",
        exact: true,
      })
      .click();
    const l = await (await window).json();
    leaseId = l.id;
    expect(leaseId).toBeTruthy();
    await page.getByRole("button", { name: "Meus nós", exact: true }).click();
    const coverage = page.locator(".coverage-card").filter({
      hasText: l.terms_sha256,
    });
    await coverage.getByText("Termos desta janela", { exact: true }).click();
    await expect(coverage).toContainText(
      "não existe um segundo pagamento 80/20",
    );
    await coverage
      .getByRole("button", { name: "Aceitar janela cooperativa", exact: true })
      .click();
    await expect(coverage).toContainText("Janela ativa");
    await page.getByRole("button", { name: "Conversar", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Modelo de inferência", exact: true })
      .selectOption(profile.model_id);
    await page
      .getByRole("combobox", { name: "Destino do consumo", exact: true })
      .selectOption(p.id);
    await page.getByLabel("Limite de saída", { exact: true }).last().fill("64");
    await page
      .getByLabel("Sua mensagem")
      .fill("Say only: cooperative credits work. /no_think");
    const q = page.waitForResponse(
      (r) => r.url().endsWith("/quotes") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Enviar mensagem" }).click();
    expect((await (await q).json()).cooperative_pool_id).toBe(p.id);
    await expect(page.locator(".message.assistant p")).not.toBeEmpty({
      timeout: 25000,
    });
    await expect(
      page.getByRole("button", { name: "Interromper", exact: true }),
    ).toHaveCount(0, { timeout: 25000 });
    await page.getByRole("button", { name: "Cooperação", exact: true }).click();
    const finalCard = page.locator(`[data-pool-id="${p.id}"]`);
    await finalCard
      .getByText("Consumo e destino dos créditos", { exact: true })
      .click();
    await expect(finalCard.locator("tbody tr")).toHaveCount(1, {
      timeout: 10000,
    });
    await mkdir(".runtime/private-lab/screenshots", { recursive: true });
    await finalCard.screenshot({
      path: ".runtime/private-lab/screenshots/cooperative-desktop.png",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await finalCard.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await finalCard.screenshot({
      path: ".runtime/private-lab/screenshots/cooperative-mobile.png",
    });
  } finally {
    if (leaseId) {
      await page.request.post(`/api/v1/availability/routes/${leaseId}/cancel`, {
        ...auth,
        data: {},
      });
      await expect
        .poll(
          async () => {
            const r = await page.request.get("/api/v1/availability/routes");
            return (await r.json()).data.find((l: any) => l.id === leaseId)
              ?.state;
          },
          { timeout: 35000 },
        )
        .toMatch(/COMPLETED|CANCELLED/);
    }
    await page.request.post(`/api/v1/cooperative/pools/${p.id}/manage`, {
      ...auth,
      data: {
        paused: true,
        reason:
          "Browser acceptance completed; preserve funds and prevent new promises",
      },
    });
  }
});
