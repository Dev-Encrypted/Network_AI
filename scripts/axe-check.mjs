// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, writeFile } from "node:fs/promises";
const c = JSON.parse(
  await readFile(".runtime/private-lab/config.json", "utf8"),
);
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  await page.goto(c.web_origin);
  await page.getByLabel("Usuário", { exact: true }).fill(c.admin_login);
  await page.getByLabel("Senha", { exact: true }).fill(c.admin_password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Uma conversa. Toda uma rede." })
    .waitFor();
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const findings = result.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    description: v.description,
    nodes: v.nodes.map((n) => ({
      target: n.target,
      summary: n.failureSummary,
    })),
  }));
  await writeFile(
    ".runtime/private-lab/accessibility-report.json",
    JSON.stringify(
      {
        scope:
          "Authenticated chat; Chromium desktop; automated WCAG rules only",
        violations: findings,
        passed_rules: result.passes.length,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(findings, null, 2));
  if (findings.length) process.exitCode = 1;
} finally {
  await browser.close();
}
