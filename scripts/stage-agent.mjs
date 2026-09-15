// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Legacy entry point retained for existing installations and protocol tests.
export * from "../packages/contributor/src/stage.mjs";
import { runStageCli } from "../packages/contributor/src/stage.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await runStageCli();
