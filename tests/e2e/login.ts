// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { expect, test, type Page } from "@playwright/test";
import { setTimeout as delay } from "node:timers/promises";

// A full real-browser campaign includes more logins than one server rate-limit
// window permits. Honor that boundary; never restart or weaken the limiter.
export async function loginThroughBrowser(
  page: Page,
  credentials: { admin_login: string; admin_password: string },
) {
  const password = page.getByLabel("Senha", { exact: true });
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      await page
        .getByLabel("Usuário", { exact: true })
        .fill(credentials.admin_login);
      await password.fill(credentials.admin_password);
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/v1/auth/login") &&
          r.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      const received = await response;
      if (received.status() === 201) {
        await expect(password).toHaveCount(0);
        return;
      }
      // Failed-test DOM snapshots must not retain the entered password.
      await password.fill("");
      expect(
        received.status(),
        "Browser login must succeed or return an explicit rate limit",
      ).toBe(429);
      const retry = Number(received.headers()["retry-after"]);
      const waitMs =
        (Number.isFinite(retry) && retry > 0 && retry <= 60
          ? Math.ceil(retry)
          : 60) *
          1000 +
        1000;
      test.setTimeout(test.info().timeout + waitMs + 5000);
      await delay(waitMs);
    }
    throw new Error(
      "Browser login remained throttled after bounded rate-limit waits",
    );
  } finally {
    if (await password.count())
      await password.fill("", { timeout: 1000 }).catch(() => {});
  }
}
