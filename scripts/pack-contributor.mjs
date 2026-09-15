// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Stage the exact declared dependency without changing the workspace's pnpm linker.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, cp, readFile, writeFile, access } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import {
  hashFile,
  workerEnvironment,
} from "../packages/contributor/src/profile.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  source = join(root, "packages/contributor");
const directory = join(root, ".runtime/contributor-package", randomUUID()),
  staged = join(directory, "source"),
  unpacked = join(directory, "unpacked");
await mkdir(join(staged, "node_modules"), { recursive: true });
await mkdir(unpacked);
const pkg = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
for (const file of ["package.json", ...pkg.files])
  await cp(join(source, file), join(staged, file), {
    recursive: true,
    dereference: true,
    errorOnExist: true,
  });
const zod = dirname(
  createRequire(join(source, "package.json")).resolve("zod/package.json"),
);
assert.equal(
  JSON.parse(await readFile(join(zod, "package.json"), "utf8")).version,
  pkg.dependencies.zod,
);
await cp(zod, join(staged, "node_modules/zod"), {
  recursive: true,
  dereference: true,
});
async function run(program, args, cwd) {
  return new Promise((res, rej) => {
    const child = spawn(program, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: workerEnvironment(),
    });
    let out = "",
      err = "";
    child.stdout.on("data", (c) => {
      out += c;
    });
    child.stderr.on("data", (c) => {
      err += c;
    });
    child.on("error", rej);
    child.on("exit", (code) =>
      code === 0
        ? res(out)
        : rej(new Error(`Packaging command failed (${code}): ${err}`)),
    );
  });
}
let npm;
for (const candidate of [
  join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
  resolve(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js"),
]) {
  try {
    await access(candidate);
    npm = candidate;
    break;
  } catch {}
}
assert.ok(npm, "Use a Node installation with npm available beside its runtime");
const packed = JSON.parse(
  await run(
    process.execPath,
    [
      npm,
      "pack",
      "--ignore-scripts",
      "--offline",
      "--json",
      "--pack-destination",
      directory,
    ],
    staged,
  ),
)[0];
const artifact = join(directory, packed.filename);
assert.match(packed.filename, /^network-ai-contributor-[0-9.]+\.tgz$/);
await run("tar", ["-xzf", artifact, "-C", unpacked], directory);
const packageDir = join(unpacked, "package");
const help = await run(
  process.execPath,
  [join(packageDir, "bin/worker.mjs"), "help"],
  packageDir,
);
assert.match(help, /NETWORK AI contributor/);
assert.match(help, /devices/);
for (const file of [
  "src/engine-pin.json",
  "src/engine-pin.cuda12.json",
  "src/devices.mjs",
  "src/rpc-memory.mjs",
  "examples/settings.cpu-budget.windows.json",
  "examples/settings.cuda.windows.json",
])
  await access(join(packageDir, file));
const extractedZod = JSON.parse(
  await readFile(join(packageDir, "node_modules/zod/package.json"), "utf8"),
);
assert.equal(extractedZod.version, pkg.dependencies.zod);
assert.equal(extractedZod.license, "MIT");
await access(join(packageDir, "node_modules/zod/LICENSE"));
await run(
  process.execPath,
  [
    join(packageDir, "bin/worker.mjs"),
    "identity",
    "--directory",
    join(directory, "identity-smoke"),
  ],
  packageDir,
);
const report = {
  schema_version: 1,
  version: pkg.version,
  filename: packed.filename,
  sha256: await hashFile(artifact),
  bytes: packed.size,
  dependency: {
    name: "zod",
    version: extractedZod.version,
    bundled: true,
    license_included: true,
  },
  extraction_and_cli_without_coordinator_source: true,
  device_profiles_and_both_engine_pins_included: true,
  model_or_engine_included: false,
  executable_signing_or_multi_host_qualification: false,
};
await writeFile(
  join(directory, "report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify({ ...report, artifact }, null, 2));
