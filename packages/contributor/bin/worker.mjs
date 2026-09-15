#!/usr/bin/env node
// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { ensureIdentity, configureWorker } from "../src/configure.mjs";
import { loadProfile, requireValue } from "../src/profile.mjs";
import { startWorker, requestStop, workerStatus } from "../src/supervisor.mjs";

try {
  const { values: args, positionals } = parseArgs({
    allowPositionals: true,
    options: Object.fromEntries(
      ["directory", "config", "invite", "settings"].map((k) => [
        k,
        { type: "string" },
      ]),
    ),
  });
  const command = positionals[0];
  if (command === "help" || !command) {
    console.log(`NETWORK AI contributor (private CPU preview)
  identity --directory PATH
  configure --directory PATH --invite FILE --settings FILE
  check --config FILE
  start --config FILE
  status --config FILE
  stop --config FILE
Only identity.json is public. Read README.md for peer exchange and the pinned Windows CPU engine.`);
  } else if (command === "identity") {
    requireValue(
      args.directory && positionals.length === 1,
      "worker_arguments",
    );
    await ensureIdentity(resolve(args.directory));
    console.log(
      "Contributor identities prepared. Exchange only identity.json.",
    );
  } else if (command === "configure") {
    requireValue(
      args.directory &&
        args.invite &&
        args.settings &&
        positionals.length === 1,
      "worker_arguments",
    );
    const settingsFile = resolve(args.settings),
      settings = JSON.parse(await readFile(settingsFile, "utf8"));
    settings.engine.directory = resolve(
      dirname(settingsFile),
      settings.engine.directory,
    );
    for (const b of Object.values(settings.binaries))
      b.path = resolve(dirname(settingsFile), b.path);
    console.log(
      JSON.stringify(
        await configureWorker(
          resolve(args.directory),
          JSON.parse(await readFile(resolve(args.invite), "utf8")),
          settings,
        ),
      ),
    );
  } else {
    requireValue(
      args.config &&
        ["check", "start", "stop", "status"].includes(command) &&
        positionals.length === 1,
      "worker_arguments",
    );
    if (command === "check") {
      const { profile } = await loadProfile(args.config);
      console.log(
        JSON.stringify({
          valid: true,
          node_id: profile.node.id,
          route_id: profile.binding.route_id,
          engine_id: profile.engine.id,
          backend_credentials_required: false,
        }),
      );
    } else if (command === "status")
      console.log(JSON.stringify(await workerStatus(args.config)));
    else if (command === "stop")
      console.log(JSON.stringify(await requestStop(args.config)));
    else {
      const worker = await startWorker(args.config);
      console.log(
        "Contributor processes started; route readiness requires its root and the coordinator.",
      );
      process.on("SIGINT", () => void worker.stop());
      process.on("SIGTERM", () => void worker.stop());
      process.stdin.on("data", (chunk) => {
        if (chunk.length <= 16 && chunk.toString().trim() === "stop")
          void worker.stop();
      });
      const result = await worker.closed;
      if (result.failure) process.exitCode = 1;
    }
  }
} catch (e) {
  // Configuration values, keys, upstream response bodies and tokens are private.
  console.error(
    JSON.stringify({
      error: /^[a-z_]{1,64}$/.test(e.code ?? "")
        ? e.code
        : "worker_configuration_or_runtime_error",
    }),
  );
  process.exitCode = 1;
}
