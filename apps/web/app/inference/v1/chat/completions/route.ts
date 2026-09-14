// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { proxy } from "../../../../../lib/proxy";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return proxy(
    request,
    `${process.env.NETWORK_AI_GATEWAY_URL ?? "http://127.0.0.1:43102"}/v1/chat/completions`,
    true,
  );
}
