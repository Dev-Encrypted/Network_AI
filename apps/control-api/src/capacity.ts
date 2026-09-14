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
      `WITH eligible AS (SELECT * FROM ready_execution_offers WHERE model_id=$1) SELECT
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id',offer_key,'domains',domain_ids) ORDER BY offer_key),'[]'::jsonb) FROM eligible) AS offers,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'slots',d.slots,'occupied',
        (SELECT count(*)::int FROM active_session_domains a WHERE a.resource_domain_id=d.id)) ORDER BY d.id),'[]'::jsonb)
        FROM resource_domains d WHERE EXISTS(SELECT 1 FROM eligible e WHERE d.id=ANY(e.domain_ids))) AS domains,
      (SELECT count(DISTINCT user_id)::int FROM sessions WHERE model_id=$1 AND user_id<>$2 AND state='QUEUED' AND queue_deadline>now()) AS waiting_others,
      (SELECT count(*)::int FROM sessions WHERE model_id=$1 AND user_id=$2 AND state NOT IN ('COMPLETED','FAILED','CANCELLED','INTERRUPTED')) AS active_for_account`,
      [model, user],
    )
  ).rows[0];
  // Deterministic greedy packing is conservative for overlapping routes. Summing
  // every stage/domain would advertise capacity that no complete route can use.
  function pack(occupied: boolean): number {
    const remaining = new Map<string, number>(
      row.domains.map((d: any) => [
        d.id,
        Math.max(0, d.slots - (occupied ? d.occupied : 0)),
      ]),
    );
    let count = 0;
    for (const offer of row.offers) {
      const fit = Math.min(
        ...offer.domains.map((id: string) => remaining.get(id) ?? 0),
      );
      if (fit > 0) {
        count += fit;
        for (const id of offer.domains)
          remaining.set(id, remaining.get(id)! - fit);
      }
    }
    return count;
  }
  const slots = pack(false),
    spare = pack(true);
  const limit = row.waiting_others > 0 || slots === 0 ? 1 : spare === 0 ? 2 : 4;
  return {
    model,
    policy: "private-elastic-v1",
    temporary_session_limit: limit,
    hard_account_limit: 4,
    active_for_account: row.active_for_account,
    declared_ready_slots: slots,
    occupied_slots: Math.max(0, slots - spare),
    capacity_method: "conservative_complete_route_packing",
    reason:
      slots === 0
        ? "no_ready_capacity"
        : row.waiting_others > 0
          ? "shared_queue"
          : spare === 0
            ? "capacity_busy"
            : "spare_capacity",
  };
}
