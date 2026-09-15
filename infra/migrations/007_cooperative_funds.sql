-- Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
-- Explicit opt-in readiness-only cooperation. Existing contracts retain their terms.
SET search_path TO nai, public;
CREATE TABLE cooperative_pools (
  id uuid PRIMARY KEY, creator_id uuid NOT NULL REFERENCES users(id), name text NOT NULL,
  policy jsonb NOT NULL, policy_sha256 text NOT NULL UNIQUE,
  idempotency_key uuid NOT NULL, request_sha256 text NOT NULL,
  working_account text NOT NULL UNIQUE REFERENCES ledger_accounts(id),
  reserve_account text NOT NULL UNIQUE REFERENCES ledger_accounts(id),
  burn_account text NOT NULL UNIQUE REFERENCES ledger_accounts(id),
  support_until timestamptz NOT NULL, paused boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'HIBERNATING' CHECK(state IN ('NORMAL','DEFENSE','RECOVERY','HIBERNATING')),
  healthy_since timestamptz, sample_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  writer_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),
  UNIQUE(creator_id,idempotency_key)
);
CREATE TABLE cooperative_groups (
  pool_id uuid NOT NULL REFERENCES cooperative_pools(id), group_key text NOT NULL,
  model_id text NOT NULL REFERENCES models(id), rate_microtu_per_second bigint NOT NULL CHECK(rate_microtu_per_second>0),
  duration_seconds int NOT NULL CHECK(duration_seconds BETWEEN 30 AND 3600),
  PRIMARY KEY(pool_id,group_key)
);
CREATE TABLE cooperative_routes (
  pool_id uuid NOT NULL, group_key text NOT NULL,
  route_id uuid NOT NULL REFERENCES execution_routes(id), route_sha256 text NOT NULL,
  PRIMARY KEY(pool_id,route_id), FOREIGN KEY(pool_id,group_key) REFERENCES cooperative_groups(pool_id,group_key)
);
CREATE TABLE cooperative_funding (
  id uuid PRIMARY KEY, pool_id uuid NOT NULL REFERENCES cooperative_pools(id), user_id uuid NOT NULL REFERENCES users(id),
  destination text NOT NULL CHECK(destination IN ('WORKING','RESERVE')),
  amount_microtu bigint NOT NULL CHECK(amount_microtu>0), policy_sha256 text NOT NULL,
  idempotency_key uuid NOT NULL, request_sha256 text NOT NULL, journal_id uuid NOT NULL UNIQUE REFERENCES journal(id),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,idempotency_key)
);
CREATE TABLE cooperative_incidents (
  id uuid PRIMARY KEY, pool_id uuid NOT NULL REFERENCES cooperative_pools(id), group_key text NOT NULL,
  route_id uuid NOT NULL REFERENCES execution_routes(id), policy_sha256 text NOT NULL,
  budget_microtu bigint NOT NULL CHECK(budget_microtu>0), deadline timestamptz NOT NULL,
  reason text NOT NULL, evidence jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE cooperative_windows (
  lease_id uuid PRIMARY KEY REFERENCES route_availability_leases(id),
  pool_id uuid NOT NULL, group_key text NOT NULL,
  funding_source text NOT NULL CHECK(funding_source IN ('WORKING','RESERVE')),
  incident_id uuid UNIQUE REFERENCES cooperative_incidents(id),
  FOREIGN KEY(pool_id,group_key) REFERENCES cooperative_groups(pool_id,group_key),
  CHECK((funding_source='RESERVE')=(incident_id IS NOT NULL))
);
ALTER TABLE quotes ADD COLUMN cooperative_pool_id uuid REFERENCES cooperative_pools(id), ADD COLUMN cooperative_policy_sha256 text;
ALTER TABLE quotes ADD CHECK((cooperative_pool_id IS NULL)=(cooperative_policy_sha256 IS NULL));
ALTER TABLE sessions ADD COLUMN cooperative_pool_id uuid REFERENCES cooperative_pools(id),
  ADD COLUMN cooperative_policy_sha256 text, ADD COLUMN coverage_lease_id uuid REFERENCES cooperative_windows(lease_id),
  ADD COLUMN coverage_terms_sha256 text;
ALTER TABLE sessions ADD CHECK((cooperative_pool_id IS NULL)=(cooperative_policy_sha256 IS NULL));
ALTER TABLE sessions ADD CHECK((coverage_lease_id IS NULL)=(coverage_terms_sha256 IS NULL));
CREATE TABLE cooperative_settlements (
  session_id uuid PRIMARY KEY REFERENCES sessions(id), pool_id uuid NOT NULL REFERENCES cooperative_pools(id),
  policy_sha256 text NOT NULL, coverage_lease_id uuid NOT NULL REFERENCES cooperative_windows(lease_id),
  charge_microtu bigint NOT NULL CHECK(charge_microtu>0),
  working_microtu bigint NOT NULL CHECK(working_microtu>=0), reserve_microtu bigint NOT NULL CHECK(reserve_microtu>=0),
  burned_microtu bigint NOT NULL CHECK(burned_microtu>=0), allocation jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(charge_microtu=working_microtu+reserve_microtu+burned_microtu)
);
CREATE TABLE cooperative_refunds (
  session_id uuid PRIMARY KEY REFERENCES cooperative_settlements(session_id), actor_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL, journal_id uuid NOT NULL UNIQUE REFERENCES journal(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE cooperative_events (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, pool_id uuid NOT NULL REFERENCES cooperative_pools(id),
  actor_id uuid REFERENCES users(id), kind text NOT NULL, metadata jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION cooperative_immutable_context() RETURNS trigger LANGUAGE plpgsql SET search_path=nai,pg_temp AS $$
BEGIN
  IF NEW.cooperative_pool_id IS DISTINCT FROM OLD.cooperative_pool_id OR NEW.cooperative_policy_sha256 IS DISTINCT FROM OLD.cooperative_policy_sha256 THEN
    RAISE EXCEPTION 'cooperative quote context is immutable';
  END IF;
  IF TG_TABLE_NAME='sessions' THEN
  IF OLD.coverage_lease_id IS NOT NULL AND
    (NEW.coverage_lease_id IS DISTINCT FROM OLD.coverage_lease_id OR NEW.coverage_terms_sha256 IS DISTINCT FROM OLD.coverage_terms_sha256) THEN
    RAISE EXCEPTION 'accepted coverage context is immutable';
  END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_quote_cooperation BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION cooperative_immutable_context();
CREATE TRIGGER immutable_session_cooperation BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION cooperative_immutable_context();
CREATE FUNCTION check_cooperative_append() RETURNS trigger LANGUAGE plpgsql SET search_path=nai,pg_temp AS $$
BEGIN
  IF (SELECT writer_xid FROM cooperative_pools WHERE id=NEW.pool_id) IS DISTINCT FROM pg_current_xact_id() THEN
    RAISE EXCEPTION 'cannot append to committed cooperative plan';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cooperative_group_insert BEFORE INSERT ON cooperative_groups FOR EACH ROW EXECUTE FUNCTION check_cooperative_append();
CREATE TRIGGER cooperative_route_insert BEFORE INSERT ON cooperative_routes FOR EACH ROW EXECUTE FUNCTION check_cooperative_append();
CREATE FUNCTION check_cooperative_window() RETURNS trigger LANGUAGE plpgsql SET search_path=nai,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM route_availability_leases l JOIN cooperative_pools p ON p.id=NEW.pool_id
    JOIN cooperative_groups g ON g.pool_id=p.id AND g.group_key=NEW.group_key
    JOIN cooperative_routes cr ON cr.pool_id=p.id AND cr.group_key=g.group_key AND cr.route_id=l.route_id
    WHERE l.id=NEW.lease_id AND l.writer_xid=pg_current_xact_id() AND l.sponsor_id=p.creator_id
      AND l.rate_microtu_per_second=g.rate_microtu_per_second AND l.duration_seconds=g.duration_seconds AND l.route_sha256=cr.route_sha256
      AND l.terms->>'compensation'='READINESS_ONLY' AND l.terms->'cooperative'->>'pool_id'=p.id::text
      AND l.terms->'cooperative'->>'policy_sha256'=p.policy_sha256 AND l.terms->'cooperative'->>'group_key'=g.group_key
      AND l.terms->'cooperative'->>'funding_source'=NEW.funding_source
      AND (NEW.funding_source='WORKING' OR EXISTS(SELECT 1 FROM cooperative_incidents i WHERE i.id=NEW.incident_id
        AND i.pool_id=p.id AND i.group_key=g.group_key AND i.route_id=l.route_id AND i.budget_microtu=l.budget_microtu))) THEN
    RAISE EXCEPTION 'cooperative funding does not match accepted plan';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cooperative_window_insert BEFORE INSERT ON cooperative_windows FOR EACH ROW EXECUTE FUNCTION check_cooperative_window();
CREATE FUNCTION check_cooperative_session() RETURNS trigger LANGUAGE plpgsql SET search_path=nai,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM quotes q WHERE q.id=NEW.quote_id AND
    q.cooperative_pool_id IS NOT DISTINCT FROM NEW.cooperative_pool_id AND
    q.cooperative_policy_sha256 IS NOT DISTINCT FROM NEW.cooperative_policy_sha256) THEN
    RAISE EXCEPTION 'session cooperation must match its quote';
  END IF;
  IF NEW.coverage_lease_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM cooperative_windows cw
    JOIN route_availability_leases l ON l.id=cw.lease_id WHERE cw.lease_id=NEW.coverage_lease_id AND cw.pool_id=NEW.cooperative_pool_id
      AND l.route_id=NEW.route_id AND l.terms_sha256=NEW.coverage_terms_sha256) THEN
    RAISE EXCEPTION 'session coverage must match its pool and route';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cooperative_session_identity BEFORE INSERT OR UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION check_cooperative_session();
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['cooperative_groups','cooperative_routes','cooperative_funding','cooperative_incidents','cooperative_windows',
    'cooperative_settlements','cooperative_refunds','cooperative_events'] LOOP
    EXECUTE format('CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation()',t);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
    EXECUTE format('GRANT SELECT,INSERT ON %I TO network_ai_runtime',t);
  END LOOP;
END $$;
REVOKE ALL ON cooperative_pools FROM PUBLIC;
GRANT SELECT ON cooperative_pools TO network_ai_runtime;
GRANT INSERT(id,creator_id,name,policy,policy_sha256,idempotency_key,request_sha256,working_account,reserve_account,burn_account,support_until) ON cooperative_pools TO network_ai_runtime;
GRANT UPDATE(paused,state,healthy_since,sample_at,support_until) ON cooperative_pools TO network_ai_runtime;
GRANT USAGE,SELECT ON SEQUENCE cooperative_events_sequence_seq TO network_ai_runtime;
REVOKE ALL ON FUNCTION cooperative_immutable_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION check_cooperative_append(),check_cooperative_window(),check_cooperative_session() FROM PUBLIC;
