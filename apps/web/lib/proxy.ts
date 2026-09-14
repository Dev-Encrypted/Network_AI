// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
export async function proxy(
  request: Request,
  target: string,
  stream = false,
): Promise<Response> {
  const url = new URL(target);
  if (url.hostname !== "127.0.0.1" || url.protocol !== "http:")
    return Response.json(
      { error: { message: "Configuração local inválida." } },
      { status: 503 },
    );
  const headers = new Headers();
  for (const name of [
    "authorization",
    "cookie",
    "origin",
    "content-type",
    "idempotency-key",
    "x-quote-id",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  let body: Uint8Array<ArrayBuffer> | undefined;
  if (!["GET", "HEAD"].includes(request.method)) {
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = request.body?.getReader();
    if (reader)
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 131072) {
            await reader.cancel();
            return Response.json(
              { error: { message: "Solicitação muito grande." } },
              { status: 413 },
            );
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
  }
  try {
    const response = await fetch(url, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "error",
      signal: stream
        ? request.signal
        : AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
    });
    const returned = new Headers({ "Cache-Control": "no-store" });
    for (const name of [
      "content-type",
      "set-cookie",
      "x-network-ai-session-id",
    ]) {
      const value = response.headers.get(name);
      if (value) returned.set(name, value);
    }
    return new Response(response.body, {
      status: response.status,
      headers: returned,
    });
  } catch {
    return Response.json(
      {
        error: {
          code: "service_unavailable",
          message: "Serviço local indisponível. Confira o estado do ambiente.",
        },
      },
      { status: 503 },
    );
  }
}
