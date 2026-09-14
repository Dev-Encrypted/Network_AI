// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import type { PoolClient, Pool } from "pg";
import { z } from "zod";

// Temporary admission headroom. It neither changes tariffs nor creates credits.
// Existing sessions retain their reservations when the limit falls.
export async function capacity(
  db: PoolClient | Pool,
  model: string,
  user: string,
) {
  z.string()
    .regex(/^[a-z0-9][a-z0-9._-]{1,79}$/)
    .parse(model);
  const row = (
    await db.query(
      `WITH eligible AS (
    SELECT DISTINCT d.id,d.slots FROM resource_domains d JOIN nodes n ON n.resource_domain_id=d.id JOIN models m ON m.id=n.model_id
    WHERE n.model_id=$1 AND m.state='LOCAL_PREVIEW' AND n.state='READY' AND n.desired_state='READY'
      AND n.last_seen>now()-interval '15 seconds' AND n.loaded_backend_models ? (m.manifest->>'backend_model')
    ) SELECT
      (SELECT coalesce(sum(slots),0)::int FROM eligible) AS slots,
      (SELECT count(*)::int FROM sessions WHERE resource_domain_id IN (SELECT id FROM eligible) AND state IN ('PREPARING','AUTHORIZED','RUNNING','CANCELLING')) AS occupied,
      (SELECT count(DISTINCT user_id)::int FROM sessions WHERE model_id=$1 AND user_id<>$2 AND state='QUEUED' AND queue_deadline>now()) AS waiting_others,
      (SELECT count(*)::int FROM sessions WHERE model_id=$1 AND user_id=$2 AND state NOT IN ('COMPLETED','FAILED','CANCELLED','INTERRUPTED')) AS active_for_account`,
      [model, user],
    )
  ).rows[0];
  const limit =
    row.waiting_others > 0 || row.slots === 0
      ? 1
      : row.occupied >= row.slots
        ? 2
        : 4;
  return {
    model,
    policy: "private-elastic-v1",
    temporary_session_limit: limit,
    hard_account_limit: 4,
    active_for_account: row.active_for_account,
    declared_ready_slots: row.slots,
    occupied_slots: row.occupied,
    reason:
      row.slots === 0
        ? "no_ready_capacity"
        : row.waiting_others > 0
          ? "shared_queue"
          : row.occupied >= row.slots
            ? "capacity_busy"
            : "spare_capacity",
  };
}
