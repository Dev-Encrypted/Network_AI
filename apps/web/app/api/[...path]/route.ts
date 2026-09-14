// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { proxy } from "../../../lib/proxy";
export const dynamic = "force-dynamic";
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const path = (await context.params).path.join("/");
  const allowed =
    /^v1\/(health|me|models|quotes|wallet|capacity\/[a-z0-9._-]{2,80}|availability\/leases(?:\/[a-f0-9-]{36}\/(accept|cancel))?|keys(?:\/[a-f0-9-]{36})?|sessions(?:\/[a-f0-9-]{36}(?:\/cancel)?)?|nodes(?:\/[a-f0-9-]{36}\/state)?|auth\/(login|logout)|admin\/(users|grants|domains|node-invites|metrics|models\/[a-z0-9._-]{2,80}\/qualify))$/;
  if (!allowed.test(path))
    return Response.json(
      { error: { message: "Rota não encontrada." } },
      { status: 404 },
    );
  return proxy(
    request,
    `${process.env.NETWORK_AI_CONTROL_URL ?? "http://127.0.0.1:43101"}/api/${path}`,
  );
}
export { handle as GET, handle as POST, handle as DELETE };
