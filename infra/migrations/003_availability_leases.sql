-- Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
-- Fully funded private availability contracts. No new issuance or cash conversion.
SET search_path TO nai, public;
CREATE TABLE availability_leases (
  id uuid PRIMARY KEY,
  sponsor_id uuid NOT NULL REFERENCES users(id),
  provider_id uuid NOT NULL REFERENCES users(id),
  node_id uuid NOT NULL REFERENCES nodes(id),
  resource_domain_id uuid NOT NULL REFERENCES resource_domains(id),
  model_id text NOT NULL REFERENCES models(id),
  manifest_sha256 text NOT NULL,
  idempotency_key text NOT NULL,
  request_sha256 text NOT NULL,
  escrow_account text NOT NULL UNIQUE REFERENCES ledger_accounts(id),
  state text NOT NULL CHECK(state IN ('OFFERED','ACTIVE','COMPLETED','CANCELLED','EXPIRED')),
  duration_seconds integer NOT NULL CHECK(duration_seconds BETWEEN 30 AND 3600),
  rate_microtu_per_second bigint NOT NULL CHECK(rate_microtu_per_second>0),
  budget_microtu bigint NOT NULL CHECK(budget_microtu>=0),
  paid_microtu bigint NOT NULL DEFAULT 0 CHECK(paid_microtu>=0 AND paid_microtu<=budget_microtu),
  credited_ms bigint NOT NULL DEFAULT 0 CHECK(credited_ms>=0 AND credited_ms<=duration_seconds*1000),
  sample_ms bigint,
  sample_ready boolean NOT NULL DEFAULT false,
  node_epoch bigint,
  started_ms bigint,
  ends_ms bigint,
  offer_expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE(sponsor_id,idempotency_key),
  CHECK(budget_microtu=rate_microtu_per_second*duration_seconds)
);
-- A declared physical domain cannot earn two overlapping readiness payments.
CREATE UNIQUE INDEX one_active_lease_per_domain ON availability_leases(resource_domain_id) WHERE state='ACTIVE';
CREATE INDEX availability_lease_reconcile ON availability_leases(state,created_at);
CREATE TABLE availability_events (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lease_id uuid NOT NULL REFERENCES availability_leases(id),
  kind text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_availability_events BEFORE UPDATE OR DELETE ON availability_events
FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();
REVOKE ALL ON availability_leases,availability_events FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON availability_leases TO network_ai_runtime;
GRANT SELECT,INSERT ON availability_events TO network_ai_runtime;
GRANT USAGE,SELECT ON SEQUENCE availability_events_sequence_seq TO network_ai_runtime;
