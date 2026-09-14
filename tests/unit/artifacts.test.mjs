// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { acquire, validateManifest } from "../../scripts/artifacts.mjs";
const revision = "a".repeat(40);
const content = Buffer.from("verified tensor fixture");
const entry = {
  path: "model.gguf",
  bytes: content.length,
  sha256: createHash("sha256").update(content).digest("hex"),
  url: `https://huggingface.co/test/model/resolve/${revision}/model.gguf`,
};
const manifest = {
  schema_version: 1,
  model_id: "test/model",
  revision,
  license_id: "Apache-2.0",
  files: [entry],
};
test("artifact manifests reject traversal, executable formats, mutable revisions and device aliases", () => {
  for (const path of [
    "../model.gguf",
    "cache/../../file.json",
    "code.py",
    "weights.bin",
    "NUL.gguf",
    "CON/cache.json",
    "dir./file.json",
  ])
    assert.throws(() =>
      validateManifest({ ...manifest, files: [{ ...entry, path }] }),
    );
  assert.throws(() =>
    validateManifest({
      ...manifest,
      files: [entry, { ...entry, path: "MODEL.GGUF" }],
    }),
  );
  assert.throws(() =>
    validateManifest({
      ...manifest,
      files: [{ ...entry, url: entry.url.replace(revision, "main") }],
    }),
  );
  assert.throws(() =>
    validateManifest({
      ...manifest,
      files: [{ ...entry, url: "http://127.0.0.1/model" }],
    }),
  );
});
test("artifact acquisition resumes, verifies and refuses mismatches without overwriting", async (t) => {
  await mkdir(".runtime/artifact-tests", { recursive: true });
  const dir = await mkdtemp(".runtime/artifact-tests/case-");
  await writeFile(join(dir, "model.gguf.part"), content.subarray(0, 5));
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.equal(options.headers.Range, "bytes=5-");
    return new Response(content.subarray(5), {
      status: 206,
      headers: {
        "Content-Range": `bytes 5-${content.length - 1}/${content.length}`,
        "Content-Length": String(content.length - 5),
      },
    });
  });
  assert.equal((await acquire(manifest, dir)).files[0].verified, true);
  assert.deepEqual(await readFile(join(dir, "model.gguf")), content);
  assert.equal((await acquire(manifest, dir, true)).files[0].verified, true);
  await writeFile(join(dir, "model.gguf"), "wrong artifact");
  await assert.rejects(() => acquire(manifest, dir, true), /does not match/);
  assert.equal(
    await readFile(join(dir, "model.gguf"), "utf8"),
    "wrong artifact",
  );
});
test("artifact acquisition refuses destination junctions", async () => {
  await mkdir(".runtime/artifact-tests", { recursive: true });
  const root = await mkdtemp(".runtime/artifact-tests/junction-");
  const outside = await mkdtemp(".runtime/artifact-tests/outside-");
  const { resolve } = await import("node:path");
  await symlink(
    resolve(outside),
    join(root, "linked"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(
    () =>
      acquire(
        { ...manifest, files: [{ ...entry, path: "linked/model.gguf" }] },
        root,
      ),
    /real directory/,
  );
});
