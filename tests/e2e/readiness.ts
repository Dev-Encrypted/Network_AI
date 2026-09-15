// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { expect, type APIRequestContext } from "@playwright/test";

// Admission requires a current complete route, not only a previously loaded
// model. Wait on the public observation without changing readiness or credits.
export async function expectReadyRoute(
  request: APIRequestContext,
  routeId: string,
) {
  await expect
    .poll(
      async () => {
        const response = await request.get("/api/v1/routes");
        const body = await response.json();
        expect(response.status(), body.error?.code).toBe(200);
        return body.data.find((route: { id: string }) => route.id === routeId)
          ?.available;
      },
      { timeout: 12000, message: "The installed complete route must be ready" },
    )
    .toBe(true);
}
