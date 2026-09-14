// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import pg from "pg";
import type { PoolClient } from "pg";

export class Database {
  readonly pool: pg.Pool;
  constructor(url: string) {
    this.pool = new pg.Pool({
      connectionString: url,
      max: 12,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      options:
        "-c search_path=nai,public -c statement_timeout=10000 -c idle_in_transaction_session_timeout=15000",
    });
  }
  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        const value = await work(client);
        await client.query("COMMIT");
        return value;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        const code = (error as { code?: string }).code;
        if (attempt === 4 || !["40001", "40P01"].includes(code ?? ""))
          throw error;
      } finally {
        client.release();
      }
      await new Promise((resolve) => setTimeout(resolve, 10 + attempt * 20));
    }
    throw new Error("Transaction retry exhausted");
  }
}
