// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { test, expect } from "@playwright/test";
import { loginThroughBrowser } from "./login";
import { readFile, mkdir } from "node:fs/promises";

test("the real mixed model explains device budgets and unequal placement on desktop and mobile", async ({
  page,
}) => {
  const recipe = await readFile(
    ".runtime/private-lab/device-routes/qwen32-mixed/recipe.json",
    "utf8",
  )
    .then(JSON.parse)
    .catch(() => null);
  test.skip(
    !recipe,
    "Requires the installed mixed-device model; no synthetic catalog entry is substituted.",
  );
  const config = JSON.parse(
    await readFile(".runtime/private-lab/config.json", "utf8"),
  );
  await page.goto("/");
  await loginThroughBrowser(page, config);
  await page.getByRole("button", { name: "Modelos", exact: true }).click();
  const card = page.locator(".model-card").filter({
    has: page.getByRole("heading", {
      name: recipe.model.display_name,
      exact: true,
    }),
  });
  await expect(
    card.getByText("Distribuição do modelo", { exact: true }),
  ).toBeVisible();
  await expect(card).toContainText("GPU NVIDIA (CUDA)");
  await expect(card).toContainText("peso de divisão 1/10");
  await expect(card).toContainText("peso de divisão 9/10");
  await expect(card).toContainText("3 GiB para buffers");
  await expect(card).toContainText("20 GiB para buffers");
  await expect(card).toContainText("remuneração segue os termos aceitos");
  await mkdir(".runtime/private-lab/screenshots", { recursive: true });
  await card.screenshot({
    path: ".runtime/private-lab/screenshots/device-model-desktop.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(card).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await card.screenshot({
    path: ".runtime/private-lab/screenshots/device-model-mobile.png",
  });
});
