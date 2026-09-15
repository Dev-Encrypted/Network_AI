// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Planning weights select layer proportions; they are not measured throughput,
// a guarantee of exact byte placement, or provider payment percentages.
export function clusterOptions(a) {
  const integer = (value, fallback, min, max) => {
    const text = String(value ?? fallback);
    if (!/^(0|[1-9][0-9]*)$/.test(text))
      throw new Error("Invalid cluster integer");
    const n = Number(text);
    if (!Number.isSafeInteger(n) || n < min || n > max)
      throw new Error("Invalid cluster bounds");
    return n;
  };
  const workers = integer(a.workers, 2, 0, 15),
    port = integer(a.port, 43220, 1024, 65535),
    rpc = integer(a["rpc-port"], 43820, 1024, 65535),
    rpcForward = integer(a["rpc-forward-port"], rpc, 1024, 65535),
    threads = integer(a.threads, 8, 1, 32),
    context = integer(a.context, 2048, 512, 131072),
    batch = integer(a.batch, 128, 1, 2048);
  const externalWorkers = a["worker-supervision"] === "external";
  if (
    a["worker-supervision"] &&
    (!externalWorkers || workers < 1 || !a["rpc-forward-port"])
  )
    throw new Error("External workers require guarded route endpoints");
  const ports = (start) => Array.from({ length: workers }, (_, i) => start + i);
  const rawPorts = ports(rpc),
    forwardPorts = ports(rpcForward);
  if (
    [...rawPorts, ...forwardPorts].some((p) => p > 65535 || p === port) ||
    (a["rpc-forward-port"] &&
      (workers === 0 || rawPorts.some((p) => forwardPorts.includes(p))))
  )
    throw new Error("Cluster port collision");
  if (
    a["rpc-transport"] &&
    (a["rpc-transport"] !== "iroh-direct-quic-guarded-rpc" ||
      !a["rpc-forward-port"])
  )
    throw new Error("Invalid guarded RPC transport");
  const split =
    a["tensor-split"] === undefined
      ? Array(workers).fill(1)
      : String(a["tensor-split"])
          .split(",")
          .map((n) => integer(n, null, 1, 10000));
  if (
    split.length !== workers ||
    (a["tensor-split"] !== undefined && workers === 0)
  )
    throw new Error("One positive tensor split weight is required per worker");
  return {
    workers,
    port,
    rpc,
    rpcForward,
    threads,
    context,
    batch,
    split,
    externalWorkers,
    rawPorts,
    forwardPorts,
  };
}
