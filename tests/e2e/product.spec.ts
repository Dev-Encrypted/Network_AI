// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const config = JSON.parse(
  await readFile(".runtime/private-lab/config.json", "utf8"),
);
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
