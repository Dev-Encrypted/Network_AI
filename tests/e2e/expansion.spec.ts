// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Browser evidence uses the actual one-account route. It never fabricates independent operators or mature health.
import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
const config = JSON.parse(
  await readFile(".runtime/private-lab/config.json", "utf8"),
);
test("private expansion forms bind support, preserve retry identity and explain real one-host blockers", async ({
  page,
}) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(10000);
  const profile = await readFile(".runtime/private-lab/cpu-route.json", "utf8")
    .then(JSON.parse)
    .catch(() => null);
  test.skip(
    !profile,
    "Requires the real installed route; no fabricated capacity is substituted",
  );
  await page.goto("/");
  await page.getByLabel("Usuário", { exact: true }).fill(config.admin_login);
  await page.getByLabel("Senha", { exact: true }).fill(config.admin_password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Cooperação", exact: true }),
  ).toBeVisible();
  const auth = { headers: { Origin: config.web_origin } },
    me = await (await page.request.get("/api/v1/me")).json();
  const self = me.user ?? me;
  const created = await page.request.post("/api/v1/cooperative/pools", {
    ...auth,
    data: {
      name: `Browser expansion gates ${randomUUID().slice(0, 8)}`,
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
  let supportId: string | undefined,
    affiliationId: string | undefined,
    dropped = false;
  const current = async () =>
    (
      await page.request.get(`/api/v1/cooperative/pools/${p.id}/renewals`)
    ).json();
  await page.route(
    `**/cooperative/pools/${p.id}/operating-support`,
    async (route) => {
      if (!dropped && route.request().method() === "POST") {
        dropped = true;
        const r = await route.fetch();
        expect(r.status()).toBe(201);
        supportId = (await r.json()).id;
        await route.abort("failed");
      } else await route.continue();
    },
  );
  try {
    await page.getByRole("button", { name: "Cooperação", exact: true }).click();
    const card = page.locator(`[data-pool-id="${p.id}"]`);
    await card
      .getByText("Renovação automática com limites", { exact: true })
      .click();
    const panel = card.getByRole("region", {
      name: "Autorizações de renovação",
    });
    await panel
      .getByText("Expansão conforme a demanda", { exact: true })
      .click();
    await panel
      .getByText("Administrar declarações econômicas privadas", { exact: true })
      .click();
    const admin = panel.getByRole("region", {
      name: "Declarações econômicas privadas",
    });
    const reference =
      "Private browser validation: the logged-in account and all installed route components share one local account; no independent ownership asserted";
    await admin
      .getByLabel("Referência da evidência revisada", { exact: true })
      .fill(reference);
    await admin
      .getByLabel("SHA-256 do documento revisado", { exact: true })
      .fill(createHash("sha256").update(reference).digest("hex"));
    const existing = await (
      await page.request.get("/api/v1/admin/economics")
    ).json();
    if (
      !existing.affiliations.some(
        (a: any) =>
          a.user_id === self.id &&
          !a.revoked_at &&
          new Date(a.expires_at).getTime() > Date.now(),
      )
    ) {
      await admin
        .getByLabel("Nome da parte econômica", { exact: true })
        .fill("Dev-Encrypted local account (private declaration)");
      const partyResult = page.waitForResponse(
        (r) =>
          r.url().endsWith("/admin/economics/parties") &&
          r.request().method() === "POST",
      );
      await admin
        .getByRole("button", { name: "Registrar parte econômica", exact: true })
        .click();
      const party = await (await partyResult).json();
      await expect(
        admin.getByRole("button", {
          name: "Registrar classificação da conta",
          exact: true,
        }),
      ).toBeEnabled();
      await admin
        .getByRole("combobox", { name: "Conta a classificar", exact: true })
        .selectOption(self.id);
      await admin
        .getByRole("combobox", {
          name: "Parte responsável pela conta",
          exact: true,
        })
        .selectOption(party.id);
      const classified = page.waitForResponse(
        (r) =>
          r.url().endsWith("/admin/economics/affiliations") &&
          r.request().method() === "POST",
      );
      await admin
        .getByRole("button", {
          name: "Registrar classificação da conta",
          exact: true,
        })
        .click();
      const classification = await (await classified).json();
      affiliationId = classification.id;
      expect(classification.user_id).toBe(self.id);
    }
    await admin
      .getByLabel("Recursos e responsabilidades do apoio", { exact: true })
      .fill(
        "Existing local CPU computer and installed route for private browser validation only; one account and no verified external cash commitment.",
      );
    await admin
      .getByLabel("Registro apoio em recursos", { exact: false })
      .check();
    await admin
      .getByRole("button", { name: "Registrar apoio operacional", exact: true })
      .click();
    await expect(admin.getByRole("alert")).toBeVisible();
    const retry = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/cooperative/pools/${p.id}/operating-support`) &&
        r.request().method() === "POST",
    );
    await admin
      .getByRole("button", { name: "Registrar apoio operacional", exact: true })
      .click();
    expect((await (await retry).json()).id).toBe(supportId);
    expect((await current()).operating_support).toHaveLength(1);
    await panel.getByText("Autorizar gastos do fundo", { exact: true }).click();
    await panel
      .getByRole("combobox", {
        name: "Finalidade do limite do fundo",
        exact: true,
      })
      .selectOption("EXPANSION");
    await panel
      .getByRole("combobox", {
        name: "Apoio vinculado à expansão",
        exact: true,
      })
      .selectOption(supportId!);
    await expect(
      panel.getByLabel("Limite de reserva em microcréditos", { exact: true }),
    ).toBeDisabled();
    await expect(
      panel.getByLabel("Limite de reserva em microcréditos", { exact: true }),
    ).toHaveValue("0");
    await panel
      .getByLabel("Validade da autorização do fundo (minutos)", { exact: true })
      .fill("5");
    await panel
      .getByLabel("Motivo da autorização do fundo", { exact: true })
      .fill(
        "Browser binds working-only expansion to private support without replacing demand gates",
      );
    await panel
      .getByLabel("Autorizo estes compromissos brutos", { exact: false })
      .check();
    const authorized = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/cooperative/pools/${p.id}/renewals`) &&
        r.request().method() === "POST",
    );
    await panel
      .getByRole("button", { name: "Registrar limite do fundo", exact: true })
      .click();
    const a = await (await authorized).json();
    expect(a.coverage_kind).toBe("EXPANSION");
    expect(a.operating_support_id).toBe(supportId);
    await panel
      .getByText("Autorizar minha participação como operador", { exact: true })
      .click();
    await panel
      .getByRole("combobox", {
        name: "Finalidade da minha participação",
        exact: true,
      })
      .selectOption("EXPANSION");
    await panel
      .getByRole("combobox", { name: "Minha rota autorizada", exact: true })
      .selectOption(profile.route_id);
    await panel
      .getByLabel("Motivo da minha autorização", { exact: true })
      .fill(
        "Browser operator consents specifically to future bounded expansion windows",
      );
    await panel
      .getByLabel("Autorizo apenas janelas de expansão", { exact: false })
      .check();
    const accepted = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/cooperative/pools/${p.id}/provider-mandates`) &&
        r.request().method() === "POST",
    );
    await panel
      .getByRole("button", { name: "Registrar minha autorização", exact: true })
      .click();
    expect((await (await accepted).json()).coverage_kind).toBe("EXPANSION");
    await expect
      .poll(async () => (await current()).authorizations[0].last_status)
      .toMatch(/^EXPANSION_/);
    const v = await current();
    expect(v.runs).toHaveLength(0);
    expect(v.authorizations[0].working_committed_microtu).toBe("0");
    expect(v.expansion[0].eligible_funded_parties).toBe(0);
    await expect(
      panel.locator('[data-expansion-gate="funded_pressure"]'),
    ).toContainText("Pendente");
    await expect(
      panel.locator('[data-expansion-gate="recurring_flow"]'),
    ).toContainText("Pendente");
    await panel.getByText("Autorizar gastos do fundo", { exact: true }).click();
    await panel
      .getByText("Autorizar minha participação como operador", { exact: true })
      .click();
    await panel
      .getByText("Administrar declarações econômicas privadas", { exact: true })
      .click();
    await mkdir(".runtime/private-lab/screenshots", { recursive: true });
    await panel
      .locator(".expansion-panel")
      .screenshot({
        path: ".runtime/private-lab/screenshots/expansion-desktop.png",
      });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await panel
      .locator(".expansion-panel")
      .screenshot({
        path: ".runtime/private-lab/screenshots/expansion-mobile.png",
      });
    await panel
      .getByText("Administrar declarações econômicas privadas", { exact: true })
      .click();
    await admin
      .getByRole("button", { name: "Revogar este apoio", exact: true })
      .click();
    await expect(
      panel.locator(`[data-operating-support="${supportId}"]`),
    ).toContainText("Apoio revogado");
  } finally {
    const v = await current();
    for (const m of v.mandates)
      await page.request.post(
        `/api/v1/cooperative/provider-mandates/${m.id}/revoke`,
        { ...auth, data: {} },
      );
    for (const a of v.authorizations)
      await page.request.post(`/api/v1/cooperative/renewals/${a.id}/revoke`, {
        ...auth,
        data: {},
      });
    for (const s of v.operating_support)
      await page.request.post(
        `/api/v1/cooperative/operating-support/${s.id}/revoke`,
        { ...auth, data: {} },
      );
    if (affiliationId)
      await page.request.post(
        `/api/v1/admin/economics/affiliations/${affiliationId}/revoke`,
        { ...auth, data: {} },
      );
    await page.request.post(`/api/v1/cooperative/pools/${p.id}/manage`, {
      ...auth,
      data: {
        paused: true,
        reason:
          "Browser expansion controls validated; no independent demand or public qualification is claimed",
      },
    });
  }
});
