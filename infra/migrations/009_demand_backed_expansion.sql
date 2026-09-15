-- Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
-- Private declared parties and bounded working-only expansion. No issuance or public ownership proof.
SET search_path TO nai, public;
CREATE TABLE economic_parties (
  id uuid PRIMARY KEY, name text NOT NULL, evidence_sha256 text NOT NULL,
  source_reference text NOT NULL, created_by uuid NOT NULL REFERENCES users(id),
  idempotency_key uuid NOT NULL, request_sha256 text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(created_by,idempotency_key)
);
CREATE TABLE economic_affiliations (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), party_id uuid NOT NULL REFERENCES economic_parties(id),
  evidence_sha256 text NOT NULL, source_reference text NOT NULL, created_by uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  idempotency_key uuid NOT NULL, request_sha256 text NOT NULL, UNIQUE(created_by,idempotency_key), CHECK(expires_at>created_at)
);
CREATE UNIQUE INDEX one_unrevoked_affiliation ON economic_affiliations(user_id) WHERE revoked_at IS NULL;
CREATE TABLE cooperative_operating_support (
  id uuid PRIMARY KEY, pool_id uuid NOT NULL REFERENCES cooperative_pools(id), policy_sha256 text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id), scope text NOT NULL, evidence_sha256 text NOT NULL, source_reference text NOT NULL,
  expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  idempotency_key uuid NOT NULL, request_sha256 text NOT NULL, terms jsonb NOT NULL, terms_sha256 text NOT NULL UNIQUE,
  UNIQUE(created_by,idempotency_key), CHECK(expires_at>created_at)
);
ALTER TABLE cooperative_renewal_authorizations ADD COLUMN coverage_kind text NOT NULL DEFAULT 'ESSENTIAL' CHECK(coverage_kind IN ('ESSENTIAL','EXPANSION')),
  ADD COLUMN operating_support_id uuid REFERENCES cooperative_operating_support(id),
  ADD CHECK(coverage_kind<>'EXPANSION' OR (maximum_reserve_microtu=0 AND operating_support_id IS NOT NULL));
ALTER TABLE cooperative_provider_mandates ADD COLUMN coverage_kind text NOT NULL DEFAULT 'ESSENTIAL' CHECK(coverage_kind IN ('ESSENTIAL','EXPANSION'));
DROP INDEX one_active_renewal_authority;
CREATE UNIQUE INDEX one_active_renewal_authority ON cooperative_renewal_authorizations(pool_id,group_key,coverage_kind) WHERE state='ACTIVE';
DROP INDEX one_active_provider_mandate;
CREATE UNIQUE INDEX one_active_provider_mandate ON cooperative_provider_mandates(pool_id,route_id,provider_id,coverage_kind) WHERE state='ACTIVE';
ALTER TABLE cooperative_windows ADD COLUMN coverage_kind text NOT NULL DEFAULT 'ESSENTIAL' CHECK(coverage_kind IN ('ESSENTIAL','EXPANSION')),
  ADD CHECK(coverage_kind<>'EXPANSION' OR funding_source='WORKING');
CREATE TABLE cooperative_expansion_demand (
  lease_id uuid PRIMARY KEY REFERENCES cooperative_renewal_runs(lease_id), session_id uuid NOT NULL UNIQUE REFERENCES sessions(id),
  consumer_party_id uuid NOT NULL REFERENCES economic_parties(id), affiliation_id uuid NOT NULL REFERENCES economic_affiliations(id),
  evidence jsonb NOT NULL, evidence_sha256 text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION revoke_private_attestation() RETURNS trigger LANGUAGE plpgsql SET search_path=nai,pg_temp AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN RAISE EXCEPTION 'revoked attestation is final'; END IF;
  IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN NEW.revoked_at=clock_timestamp(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER final_affiliation BEFORE UPDATE OF revoked_at ON economic_affiliations FOR EACH ROW EXECUTE FUNCTION revoke_private_attestation();
CREATE TRIGGER final_operating_support BEFORE UPDATE OF revoked_at ON cooperative_operating_support FOR EACH ROW EXECUTE FUNCTION revoke_private_attestation();
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['economic_parties','cooperative_expansion_demand'] LOOP
    EXECUTE format('CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation()',t);
  END LOOP;
END $$;
REVOKE ALL ON economic_parties,economic_affiliations,cooperative_operating_support,cooperative_expansion_demand FROM PUBLIC;
GRANT SELECT ON economic_parties,economic_affiliations,cooperative_operating_support,cooperative_expansion_demand TO network_ai_runtime;
GRANT INSERT(id,name,evidence_sha256,source_reference,created_by,idempotency_key,request_sha256) ON economic_parties TO network_ai_runtime;
GRANT INSERT(id,user_id,party_id,evidence_sha256,source_reference,created_by,expires_at,idempotency_key,request_sha256) ON economic_affiliations TO network_ai_runtime;
GRANT INSERT(id,pool_id,policy_sha256,created_by,scope,evidence_sha256,source_reference,expires_at,idempotency_key,request_sha256,terms,terms_sha256)
  ON cooperative_operating_support TO network_ai_runtime;
GRANT UPDATE(revoked_at) ON economic_affiliations,cooperative_operating_support TO network_ai_runtime;
GRANT INSERT(coverage_kind,operating_support_id) ON cooperative_renewal_authorizations TO network_ai_runtime;
GRANT INSERT(coverage_kind) ON cooperative_provider_mandates TO network_ai_runtime;
GRANT INSERT(lease_id,session_id,consumer_party_id,affiliation_id,evidence,evidence_sha256) ON cooperative_expansion_demand TO network_ai_runtime;
REVOKE ALL ON FUNCTION revoke_private_attestation() FROM PUBLIC;

CREATE FUNCTION match_coverage_kind() RETURNS trigger LANGUAGE plpgsql SET search_path=nai,pg_temp AS $$
DECLARE l route_availability_leases;
BEGIN
  SELECT * INTO l FROM route_availability_leases WHERE id=NEW.lease_id;
  IF NEW.coverage_kind IS DISTINCT FROM coalesce(l.terms->'cooperative'->>'coverage_kind','ESSENTIAL') THEN
    RAISE EXCEPTION 'coverage kind must match its immutable window';
  END IF;
  IF NEW.coverage_kind='EXPANSION' AND (NEW.funding_source<>'WORKING' OR l.terms->'cooperative'->'expansion' IS NULL) THEN
    RAISE EXCEPTION 'expansion requires working funds and recorded demand evidence';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER match_coverage_kind BEFORE INSERT ON cooperative_windows FOR EACH ROW EXECUTE FUNCTION match_coverage_kind();
CREATE FUNCTION match_authority_kind() RETURNS trigger LANGUAGE plpgsql SET search_path=nai,pg_temp AS $$
DECLARE a cooperative_renewal_authorizations; w cooperative_windows; l route_availability_leases;
BEGIN
  SELECT * INTO a FROM cooperative_renewal_authorizations WHERE id=NEW.authorization_id;
  SELECT * INTO w FROM cooperative_windows WHERE lease_id=NEW.lease_id;
  SELECT * INTO l FROM route_availability_leases WHERE id=NEW.lease_id;
  IF a.coverage_kind<>w.coverage_kind OR a.coverage_kind IS DISTINCT FROM coalesce(a.terms->>'coverage_kind','ESSENTIAL') THEN
    RAISE EXCEPTION 'fund authority cannot cross coverage kinds';
  END IF;
  IF w.coverage_kind='EXPANSION' AND NOT EXISTS(SELECT 1 FROM cooperative_operating_support os JOIN users u ON u.id=os.created_by
    WHERE os.id=a.operating_support_id AND os.pool_id=a.pool_id AND os.policy_sha256=a.policy_sha256 AND os.revoked_at IS NULL
    AND NOT u.disabled AND extract(epoch FROM os.expires_at)*1000>=l.ends_ms
    AND l.terms->'cooperative'->'expansion'->'support'->>'id'=os.id::text
    AND l.terms->'cooperative'->'expansion'->'support'->>'terms_sha256'=os.terms_sha256) THEN
    RAISE EXCEPTION 'expansion lacks its current operating support';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER match_authority_kind BEFORE INSERT ON cooperative_renewal_runs FOR EACH ROW EXECUTE FUNCTION match_authority_kind();
CREATE FUNCTION match_mandate_kind() RETURNS trigger LANGUAGE plpgsql SET search_path=nai,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM cooperative_provider_mandates m JOIN cooperative_windows w ON w.lease_id=NEW.lease_id
    WHERE m.id=NEW.mandate_id AND m.coverage_kind=w.coverage_kind
      AND m.coverage_kind=coalesce(m.terms->>'coverage_kind','ESSENTIAL')) THEN
    RAISE EXCEPTION 'provider mandate cannot cross coverage kinds';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER match_mandate_kind BEFORE INSERT ON cooperative_mandate_usages FOR EACH ROW EXECUTE FUNCTION match_mandate_kind();
CREATE FUNCTION validate_expansion_demand() RETURNS trigger LANGUAGE plpgsql SET search_path=nai,pg_temp AS $$
DECLARE l route_availability_leases; w cooperative_windows; s sessions; a economic_affiliations; p cooperative_pools;
BEGIN
  SELECT * INTO l FROM route_availability_leases WHERE id=NEW.lease_id;
  SELECT * INTO w FROM cooperative_windows WHERE lease_id=NEW.lease_id;
  SELECT * INTO s FROM sessions WHERE id=NEW.session_id FOR UPDATE;
  SELECT * INTO a FROM economic_affiliations WHERE id=NEW.affiliation_id FOR UPDATE;
  SELECT * INTO p FROM cooperative_pools WHERE id=w.pool_id;
  IF w.lease_id IS NULL OR s.id IS NULL OR a.id IS NULL OR p.id IS NULL
    OR w.coverage_kind<>'EXPANSION' OR l.state<>'ACTIVE' OR l.writer_xid<>pg_current_xact_id()
    OR s.state<>'QUEUED' OR s.billing_state<>'HELD' OR s.hold_microtu<=0 OR s.cooperative_pool_id<>w.pool_id
    OR s.model_id<>(SELECT model_id FROM cooperative_groups WHERE pool_id=w.pool_id AND group_key=w.group_key)
    OR s.created_at>clock_timestamp()-interval '10 seconds' OR s.queue_deadline<=clock_timestamp()+interval '10 seconds'
    OR a.user_id<>s.user_id OR a.party_id<>NEW.consumer_party_id OR a.revoked_at IS NOT NULL OR a.expires_at<=clock_timestamp()
    OR NEW.evidence IS DISTINCT FROM l.terms->'cooperative'->'expansion'
    OR NEW.evidence_sha256 IS DISTINCT FROM l.terms->'cooperative'->>'expansion_sha256'
    OR NEW.evidence->'selected_demand'->>'session_id' IS DISTINCT FROM s.id::text
    OR NEW.evidence->'selected_demand'->>'party_id' IS DISTINCT FROM a.party_id::text
    OR NEW.evidence->'selected_demand'->>'affiliation_id' IS DISTINCT FROM a.id::text
    OR NEW.evidence->'selected_demand'->>'hold_microtu' IS DISTINCT FROM s.hold_microtu::text
    OR NEW.evidence->>'approved' IS DISTINCT FROM 'true'
    OR NEW.evidence->>'qualification_scope' IS DISTINCT FROM 'PRIVATE_DECLARED_PARTIES'
    OR p.policy->>'expansion' IS DISTINCT FROM 'PRIVATE_DEMAND_BACKED_SEPARATE_AUTHORIZATION'
    OR s.cooperative_policy_sha256 IS DISTINCT FROM p.policy_sha256
    OR NOT EXISTS(SELECT 1 FROM models m JOIN users u ON u.id=s.user_id
      WHERE m.id=s.model_id AND m.manifest_sha256=s.manifest_sha256 AND m.state='LOCAL_PREVIEW' AND NOT u.disabled)
    OR EXISTS(SELECT 1 FROM (SELECT rm.provider_id AS id FROM cooperative_routes cr JOIN route_members rm ON rm.route_id=cr.route_id
      WHERE cr.pool_id=p.id AND cr.group_key=w.group_key UNION SELECT p.creator_id) actors
      LEFT JOIN economic_affiliations pa ON pa.user_id=actors.id AND pa.created_at<=clock_timestamp()
        AND pa.expires_at>clock_timestamp() AND pa.revoked_at IS NULL WHERE pa.id IS NULL OR pa.party_id=a.party_id)
    OR (SELECT balance FROM ledger_accounts WHERE id=p.reserve_account)<
      (SELECT sum(rate_microtu_per_second)*259200 FROM cooperative_groups WHERE pool_id=p.id)
    OR (SELECT balance FROM ledger_accounts WHERE id=p.working_account)<greatest(0,
      (SELECT sum(rate_microtu_per_second)*21600 FROM cooperative_groups WHERE pool_id=p.id)-
      (SELECT coalesce(sum(el.budget_microtu-el.paid_microtu),0) FROM cooperative_windows ew
        JOIN route_availability_leases el ON el.id=ew.lease_id WHERE ew.pool_id=p.id AND ew.coverage_kind='ESSENTIAL'
        AND el.state IN ('OFFERED','ACTIVE','DRAINING') AND (el.ends_ms>extract(epoch FROM now())*1000
          OR (el.state='OFFERED' AND el.offer_expires_at>now()))))
    OR p.paused OR p.healthy_since IS NULL OR p.healthy_since>clock_timestamp()-interval '24 hours'
    OR p.sample_at IS NULL OR p.sample_at<clock_timestamp()-interval '6 seconds'
    OR NOT EXISTS(SELECT 1 FROM journal j JOIN journal_lines jl ON jl.journal_id=j.id WHERE j.business_key='hold:'||s.id::text
      AND jl.account_id='user:'||s.user_id::text||':held' AND jl.amount=s.hold_microtu) THEN
    RAISE EXCEPTION 'expansion must atomically consume current funded demand and qualified private evidence';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_expansion_demand BEFORE INSERT ON cooperative_expansion_demand FOR EACH ROW EXECUTE FUNCTION validate_expansion_demand();
CREATE FUNCTION complete_expansion_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path=nai,pg_temp AS $$
BEGIN
  IF NEW.coverage_kind='EXPANSION' AND NOT EXISTS(SELECT 1 FROM cooperative_expansion_demand WHERE lease_id=NEW.lease_id) THEN
    RAISE EXCEPTION 'expansion cannot commit without one consumed demand record';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER complete_expansion_evidence AFTER INSERT ON cooperative_windows DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION complete_expansion_evidence();
REVOKE ALL ON FUNCTION match_coverage_kind(),match_authority_kind(),match_mandate_kind(),validate_expansion_demand(),complete_expansion_evidence() FROM PUBLIC;
