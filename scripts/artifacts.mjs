// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Explicit, resumable acquisition from a reviewed manifest. Never executes model code.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir,
  readFile,
  open,
  rename,
  stat,
  statfs,
  unlink,
  lstat,
  realpath,
} from "node:fs/promises";
import { resolve, join, dirname, relative, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

export function validateManifest(m) {
  if (
    m?.schema_version !== 1 ||
    !/^[a-f0-9]{40}$/.test(m.revision ?? "") ||
    !m.license_id ||
    !Array.isArray(m.files) ||
    !m.files.length ||
    m.files.length > 1024
  )
    throw new Error("Invalid artifact manifest");
  const paths = new Set();
  for (const f of m.files) {
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,240}$/.test(f.path ?? "") ||
      f.path
        .split("/")
        .some(
          (p) =>
            ["", ".", ".."].includes(p) ||
            p.endsWith(".") ||
            /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p),
        ) ||
      paths.has(f.path.toLowerCase())
    )
      throw new Error("Unsafe or duplicate artifact path");
    paths.add(f.path.toLowerCase());
    if (
      !/\.(gguf|safetensors|json|txt|model|tiktoken)$/i.test(f.path) &&
      !["LICENSE", "NOTICE", "README.md"].includes(f.path)
    )
      throw new Error("Executable and pickle artifacts are not supported");
    const u = new URL(f.url);
    if (
      u.protocol !== "https:" ||
      u.hostname !== "huggingface.co" ||
      u.port ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      !u.pathname.includes(`/resolve/${m.revision}/`)
    )
      throw new Error("Use a revision-pinned Hugging Face HTTPS URL");
    if (
      !Number.isSafeInteger(f.bytes) ||
      f.bytes < 1 ||
      f.bytes > 1024 ** 4 ||
      !/^[a-f0-9]{64}$/.test(f.sha256 ?? "")
    )
      throw new Error("Invalid artifact size or digest");
  }
  return m;
}
async function digest(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
export async function acquire(manifest, directory, verifyOnly = false) {
  validateManifest(manifest);
  await mkdir(resolve(directory), { recursive: true });
  const root = await realpath(resolve(directory));
  const report = {
    schema_version: 1,
    model_id: manifest.model_id,
    revision: manifest.revision,
    license_id: manifest.license_id,
    files: [],
  };
  for (const f of manifest.files) {
    const target = resolve(root, f.path);
    const rel = relative(root, target);
    if (rel.startsWith("..") || isAbsolute(rel))
      throw new Error("Artifact escapes destination");
    let parent = root;
    for (const segment of f.path.split("/").slice(0, -1)) {
      parent = join(parent, segment);
      await mkdir(parent).catch((e) => {
        if (e.code !== "EEXIST") throw e;
      });
      const info = await lstat(parent);
      if (info.isSymbolicLink() || !info.isDirectory())
        throw new Error("Artifact parent must be a real directory");
    }
    for (const path of [target, target + ".part"]) {
      const info = await lstat(path).catch((e) => {
        if (e.code === "ENOENT") return null;
        throw e;
      });
      if (info && (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1))
        throw new Error("Linked artifact file rejected");
    }
    const lockPath = target + ".lock";
    const lock = await open(lockPath, "wx", 0o600);
    try {
      const existing = await stat(target).catch((e) => {
        if (e.code === "ENOENT") return null;
        throw e;
      });
      if (!existing && !verifyOnly) {
        const part = target + ".part";
        for (let attempt = 0; attempt < 5; attempt++) {
          let offset = (
            await stat(part).catch((e) => {
              if (e.code === "ENOENT") return { size: 0 };
              throw e;
            })
          ).size;
          if (offset > f.bytes)
            throw new Error("Partial artifact exceeds manifest size");
          if (offset === f.bytes) break;
          const disk = await statfs(root);
          if (disk.bavail * disk.bsize < f.bytes - offset + 256 * 1024 * 1024)
            throw new Error("Insufficient free disk space");
          let handle;
          try {
            const response = await fetch(f.url, {
              headers: offset ? { Range: `bytes=${offset}-` } : {},
              signal: AbortSignal.timeout(3600000),
            });
            if (
              offset
                ? response.status !== 206 ||
                  response.headers.get("content-range") !==
                    `bytes ${offset}-${f.bytes - 1}/${f.bytes}`
                : response.status !== 200
            )
              throw new Error("Download status or resume range rejected");
            if (!response.body) throw new Error("Missing artifact body");
            if (
              response.headers.has("content-length") &&
              Number(response.headers.get("content-length")) !==
                f.bytes - offset
            )
              throw new Error("Artifact length differs from manifest");
            handle = await open(part, "a", 0o600);
            let announced = Math.floor(offset / 1024 ** 3);
            for await (const chunk of response.body) {
              if (offset + chunk.length > f.bytes)
                throw new Error("Artifact exceeds manifest size");
              // FileHandle.write can be short even when no exception is raised.
              let written = 0;
              while (written < chunk.length)
                written += (
                  await handle.write(chunk, written, chunk.length - written)
                ).bytesWritten;
              offset += chunk.length;
              if (Math.floor(offset / 1024 ** 3) > announced) {
                announced++;
                console.log(
                  `${f.path}: ${Math.round((offset / f.bytes) * 100)}%`,
                );
              }
            }
            await handle.sync();
            if (offset !== f.bytes) throw new Error("Truncated artifact");
            break;
          } catch (error) {
            if (attempt === 4) throw error;
            console.log(`${f.path}: resumable retry ${attempt + 1}/4`);
            await delay(1000 * (attempt + 1));
          } finally {
            await handle?.close();
          }
        }
        if ((await digest(part)) !== f.sha256)
          throw new Error(
            "Artifact SHA-256 mismatch; partial file retained for investigation",
          );
        await rename(part, target);
      } else if (
        !existing ||
        existing.size !== f.bytes ||
        (await digest(target)) !== f.sha256
      ) {
        throw new Error(
          "Existing artifact missing or does not match manifest; nothing overwritten",
        );
      }
      report.files.push({
        path: f.path,
        bytes: f.bytes,
        sha256: f.sha256,
        verified: true,
      });
    } finally {
      await lock.close();
      await unlink(lockPath);
    }
  }
  return report;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [manifestPath, directory, option] = process.argv.slice(2);
  if (!manifestPath || !directory || (option && option !== "--verify"))
    throw new Error(
      "Use node scripts/artifacts.mjs MANIFEST DIRECTORY [--verify]",
    );
  const report = await acquire(
    JSON.parse(await readFile(manifestPath, "utf8")),
    directory,
    option === "--verify",
  );
  console.log(JSON.stringify(report, null, 2));
}
