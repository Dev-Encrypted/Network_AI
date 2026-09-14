-- Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
-- Accepted prices, counterparties, model revision and funding identity stay fixed.
SET search_path TO nai, public;
REVOKE UPDATE ON availability_leases FROM network_ai_runtime;
GRANT UPDATE(state,paid_microtu,credited_ms,sample_ms,sample_ready,node_epoch,started_ms,ends_ms,finished_at)
ON availability_leases TO network_ai_runtime;
