// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  outputDir: ".runtime/private-lab/browser-results",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  reporter: [
    ["list"],
    ["json", { outputFile: ".runtime/private-lab/browser-report.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:43100",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    trace: "off",
    screenshot: "off",
  },
});
