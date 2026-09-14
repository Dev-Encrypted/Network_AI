// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly sessionId?: string,
  ) {
    super(message);
  }
}
export function need(
  condition: unknown,
  status: number,
  code: string,
  message: string,
): asserts condition {
  if (!condition) throw new AppError(status, code, message);
}
