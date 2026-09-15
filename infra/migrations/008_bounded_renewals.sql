-- Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
-- Bounded authority is consumed by immutable whole-window records, never by a timer counter.
SET search_path TO nai, public;
CREATE TABLE cooperative_renewal_authorizations (
  id uuid PRIMARY KEY, pool_id uuid NOT NULL, group_key text NOT NULL,
  authorized_by uuid NOT NULL REFERENCES users(id), policy_sha256 text NOT NULL,
  maximum_windows int NOT NULL CHECK(maximum_windows BETWEEN 1 AND 10000),
  maximum_working_microtu bigint NOT NULL CHECK(maximum_working_microtu>=0),
  maximum_reserve_microtu bigint NOT NULL CHECK(maximum_reserve_microtu>=0),
  windows_used int NOT NULL DEFAULT 0 CHECK(windows_used>=0 AND windows_used<=maximum_windows),
  working_committed_microtu bigint NOT NULL DEFAULT 0 CHECK(working_committed_microtu>=0 AND working_committed_microtu<=maximum_working_microtu),
  reserve_committed_microtu bigint NOT NULL DEFAULT 0 CHECK(reserve_committed_microtu>=0 AND reserve_committed_microtu<=maximum_reserve_microtu),
  terms jsonb NOT NULL, terms_sha256 text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL, state text NOT NULL DEFAULT 'ACTIVE' CHECK(state IN ('ACTIVE','REVOKED','EXPIRED','EXHAUSTED')),
  revoked_at timestamptz, idempotency_key uuid NOT NULL, request_sha256 text NOT NULL,
  last_status text NOT NULL DEFAULT 'WAITING', last_attempt_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(authorized_by,idempotency_key), FOREIGN KEY(pool_id,group_key) REFERENCES cooperative_groups(pool_id,group_key)
);
CREATE UNIQUE INDEX one_active_renewal_authority ON cooperative_renewal_authorizations(pool_id,group_key) WHERE state='ACTIVE';
CREATE TABLE cooperative_provider_mandates (
  id uuid PRIMARY KEY, pool_id uuid NOT NULL REFERENCES cooperative_pools(id), provider_id uuid NOT NULL REFERENCES users(id),
  route_id uuid NOT NULL REFERENCES execution_routes(id), route_sha256 text NOT NULL, policy_sha256 text NOT NULL,
  maximum_windows int NOT NULL CHECK(maximum_windows BETWEEN 1 AND 10000),
  windows_used int NOT NULL DEFAULT 0 CHECK(windows_used>=0 AND windows_used<=maximum_windows),
  terms jsonb NOT NULL, terms_sha256 text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'ACTIVE' CHECK(state IN ('ACTIVE','REVOKED','EXPIRED','EXHAUSTED')), revoked_at timestamptz,
  idempotency_key uuid NOT NULL, request_sha256 text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_id,idempotency_key)
);
CREATE UNIQUE INDEX one_active_provider_mandate ON cooperative_provider_mandates(pool_id,route_id,provider_id) WHERE state='ACTIVE';
ALTER TABLE route_availability_acceptances ADD COLUMN provider_mandate_id uuid REFERENCES cooperative_provider_mandates(id);
CREATE TABLE cooperative_renewal_runs (
  lease_id uuid PRIMARY KEY REFERENCES cooperative_windows(lease_id),
  authorization_id uuid NOT NULL REFERENCES cooperative_renewal_authorizations(id),
  sequence int NOT NULL CHECK(sequence>0), source text NOT NULL CHECK(source IN ('WORKING','RESERVE')),
  committed_microtu bigint NOT NULL CHECK(committed_microtu>0), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(authorization_id,sequence)
);
CREATE TABLE cooperative_mandate_usages (
  lease_id uuid NOT NULL REFERENCES cooperative_renewal_runs(lease_id), provider_id uuid NOT NULL REFERENCES users(id),
  mandate_id uuid NOT NULL REFERENCES cooperative_provider_mandates(id), terms_sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(lease_id,provider_id)
);
CREATE TABLE cooperative_renewal_events (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pool_id uuid NOT NULL REFERENCES cooperative_pools(id),
  authorization_id uuid REFERENCES cooperative_renewal_authorizations(id), provider_mandate_id uuid REFERENCES cooperative_provider_mandates(id),
  actor_id uuid REFERENCES users(id), kind text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION consume_renewal_authority() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=nai,pg_temp AS $$
DECLARE a cooperative_renewal_authorizations; l route_availability_leases; cw cooperative_windows; cost bigint;
BEGIN
  SELECT * INTO a FROM cooperative_renewal_authorizations WHERE id=NEW.authorization_id FOR UPDATE;
  SELECT * INTO l FROM route_availability_leases WHERE id=NEW.lease_id;
  SELECT * INTO cw FROM cooperative_windows WHERE lease_id=NEW.lease_id;
  cost=l.budget_microtu;
  IF a.state<>'ACTIVE' OR a.expires_at<=clock_timestamp() OR l.state<>'ACTIVE' OR l.writer_xid<>pg_current_xact_id()
    OR l.ends_ms>floor(extract(epoch FROM a.expires_at)*1000) OR NEW.sequence<>a.windows_used+1
    OR a.pool_id<>cw.pool_id OR a.group_key<>cw.group_key OR NEW.source<>cw.funding_source OR NEW.committed_microtu<>cost
    OR l.terms->'cooperative'->'renewal'->>'authorization_id' IS DISTINCT FROM a.id::text
    OR l.terms->'cooperative'->>'policy_sha256' IS DISTINCT FROM a.policy_sha256
    OR l.terms->'cooperative'->'renewal'->>'sequence' IS DISTINCT FROM NEW.sequence::text
    OR l.terms->'cooperative'->'renewal'->>'authorization_terms_sha256' IS DISTINCT FROM a.terms_sha256 THEN
    RAISE EXCEPTION 'renewal exceeds or does not match its current authority';
  END IF;
  UPDATE cooperative_renewal_authorizations SET windows_used=windows_used+1,
    working_committed_microtu=working_committed_microtu+CASE WHEN NEW.source='WORKING' THEN cost ELSE 0 END,
    reserve_committed_microtu=reserve_committed_microtu+CASE WHEN NEW.source='RESERVE' THEN cost ELSE 0 END,
    state=CASE WHEN windows_used+1>=maximum_windows OR
      (maximum_working_microtu-working_committed_microtu-CASE WHEN NEW.source='WORKING' THEN cost ELSE 0 END<cost
       AND maximum_reserve_microtu-reserve_committed_microtu-CASE WHEN NEW.source='RESERVE' THEN cost ELSE 0 END<cost) THEN 'EXHAUSTED' ELSE 'ACTIVE' END
    WHERE id=a.id;
  RETURN NEW;
END $$;
CREATE TRIGGER consume_complete_window AFTER INSERT ON cooperative_renewal_runs FOR EACH ROW EXECUTE FUNCTION consume_renewal_authority();
CREATE FUNCTION consume_provider_mandate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=nai,pg_temp AS $$
DECLARE m cooperative_provider_mandates; l route_availability_leases;
BEGIN
  SELECT * INTO m FROM cooperative_provider_mandates WHERE id=NEW.mandate_id FOR UPDATE;
  SELECT * INTO l FROM route_availability_leases WHERE id=NEW.lease_id;
  IF m.state<>'ACTIVE' OR m.expires_at<=clock_timestamp() OR l.ends_ms>floor(extract(epoch FROM m.expires_at)*1000)
    OR m.provider_id<>NEW.provider_id OR m.terms_sha256<>NEW.terms_sha256 OR m.route_id<>l.route_id OR m.route_sha256<>l.route_sha256
    OR m.pool_id::text IS DISTINCT FROM l.terms->'cooperative'->>'pool_id' OR m.policy_sha256 IS DISTINCT FROM l.terms->'cooperative'->>'policy_sha256'
    OR NOT EXISTS(SELECT 1 FROM route_availability_members am WHERE am.lease_id=l.id AND am.provider_id=m.provider_id)
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(l.terms->'cooperative'->'renewal'->'provider_mandates') grant_term
      WHERE grant_term->>'id'=m.id::text AND grant_term->>'provider_id'=m.provider_id::text AND grant_term->>'terms_sha256'=m.terms_sha256)
    OR NOT EXISTS(SELECT 1 FROM route_availability_acceptances ac WHERE ac.lease_id=l.id AND ac.provider_id=m.provider_id
      AND ac.provider_mandate_id=m.id AND ac.terms_sha256=l.terms_sha256) THEN
    RAISE EXCEPTION 'provider mandate does not cover this accepted window';
  END IF;
  UPDATE cooperative_provider_mandates SET windows_used=windows_used+1,
    state=CASE WHEN windows_used+1>=maximum_windows THEN 'EXHAUSTED' ELSE 'ACTIVE' END WHERE id=m.id;
  RETURN NEW;
END $$;
CREATE TRIGGER consume_provider_window AFTER INSERT ON cooperative_mandate_usages FOR EACH ROW EXECUTE FUNCTION consume_provider_mandate();
CREATE FUNCTION check_renewal_usage_complete() RETURNS trigger LANGUAGE plpgsql SET search_path=nai,pg_temp AS $$
BEGIN
  IF EXISTS(SELECT DISTINCT am.provider_id FROM route_availability_members am WHERE am.lease_id=NEW.lease_id
    EXCEPT SELECT provider_id FROM cooperative_mandate_usages WHERE lease_id=NEW.lease_id) THEN
    RAISE EXCEPTION 'renewal lacks a consumed mandate for every provider';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER complete_renewal_usage AFTER INSERT ON cooperative_renewal_runs DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_renewal_usage_complete();
CREATE FUNCTION forbid_authority_reactivation() RETURNS trigger LANGUAGE plpgsql SET search_path=nai,pg_temp AS $$
BEGIN
  IF OLD.state<>'ACTIVE' AND NEW.state IS DISTINCT FROM OLD.state THEN RAISE EXCEPTION 'closed authority cannot be reactivated'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER final_renewal_authority BEFORE UPDATE OF state ON cooperative_renewal_authorizations FOR EACH ROW EXECUTE FUNCTION forbid_authority_reactivation();
CREATE TRIGGER final_provider_mandate BEFORE UPDATE OF state ON cooperative_provider_mandates FOR EACH ROW EXECUTE FUNCTION forbid_authority_reactivation();
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['cooperative_renewal_runs','cooperative_mandate_usages','cooperative_renewal_events'] LOOP
    EXECUTE format('CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation()',t);
    EXECUTE format('GRANT SELECT,INSERT ON %I TO network_ai_runtime',t);
  END LOOP;
END $$;
REVOKE ALL ON cooperative_renewal_authorizations,cooperative_provider_mandates,cooperative_renewal_runs,cooperative_mandate_usages,cooperative_renewal_events FROM PUBLIC;
GRANT SELECT ON cooperative_renewal_authorizations,cooperative_provider_mandates TO network_ai_runtime;
GRANT INSERT(id,pool_id,group_key,authorized_by,policy_sha256,maximum_windows,maximum_working_microtu,maximum_reserve_microtu,terms,terms_sha256,
  expires_at,idempotency_key,request_sha256) ON cooperative_renewal_authorizations TO network_ai_runtime;
GRANT INSERT(id,pool_id,provider_id,route_id,route_sha256,policy_sha256,maximum_windows,terms,terms_sha256,expires_at,idempotency_key,request_sha256)
  ON cooperative_provider_mandates TO network_ai_runtime;
GRANT UPDATE(state,revoked_at,last_status,last_attempt_at) ON cooperative_renewal_authorizations TO network_ai_runtime;
GRANT UPDATE(state,revoked_at) ON cooperative_provider_mandates TO network_ai_runtime;
GRANT USAGE,SELECT ON SEQUENCE cooperative_renewal_events_sequence_seq TO network_ai_runtime;
REVOKE ALL ON FUNCTION consume_renewal_authority(),consume_provider_mandate(),check_renewal_usage_complete(),forbid_authority_reactivation() FROM PUBLIC;
