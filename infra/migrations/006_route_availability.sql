-- Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
-- One funded readiness window for a complete route, with component obligations.
SET search_path TO nai, public;

CREATE TABLE route_availability_leases (
  id uuid PRIMARY KEY,
  sponsor_id uuid NOT NULL REFERENCES users(id),
  route_id uuid NOT NULL REFERENCES execution_routes(id),
  route_sha256 text NOT NULL,
  manifest_sha256 text NOT NULL,
  terms_sha256 text NOT NULL UNIQUE,
  terms jsonb NOT NULL,
  purpose text NOT NULL CHECK(purpose IN ('REQUESTED','SCHEDULED','EXPERIMENT')),
  reason text NOT NULL,
  idempotency_key uuid NOT NULL,
  request_sha256 text NOT NULL,
  escrow_account text NOT NULL UNIQUE REFERENCES ledger_accounts(id),
  state text NOT NULL DEFAULT 'OFFERED' CHECK(state IN ('OFFERED','ACTIVE','DRAINING','COMPLETED','CANCELLED','EXPIRED')),
  duration_seconds integer NOT NULL CHECK(duration_seconds BETWEEN 30 AND 3600),
  rate_microtu_per_second bigint NOT NULL CHECK(rate_microtu_per_second>0),
  budget_microtu bigint NOT NULL CHECK(budget_microtu>0),
  paid_microtu bigint NOT NULL DEFAULT 0 CHECK(paid_microtu>=0 AND paid_microtu<=budget_microtu),
  joint_ready_ms bigint NOT NULL DEFAULT 0 CHECK(joint_ready_ms>=0 AND joint_ready_ms<=duration_seconds*1000),
  sample_ms bigint,
  sample_ready boolean NOT NULL DEFAULT false,
  started_ms bigint,
  ends_ms bigint,
  offer_expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  writer_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),
  UNIQUE(sponsor_id,idempotency_key),
  CHECK(budget_microtu=rate_microtu_per_second*duration_seconds),
  CHECK((started_ms IS NULL AND ends_ms IS NULL) OR ends_ms=started_ms+duration_seconds*1000)
);
CREATE INDEX route_availability_reconcile ON route_availability_leases(state,created_at);
CREATE TABLE route_availability_members (
  lease_id uuid NOT NULL REFERENCES route_availability_leases(id),
  node_id uuid NOT NULL REFERENCES nodes(id),
  provider_id uuid NOT NULL REFERENCES users(id),
  resource_domain_id uuid NOT NULL REFERENCES resource_domains(id),
  ordinal integer NOT NULL,
  role text NOT NULL CHECK(role IN ('ROOT','STAGE')),
  share_bps integer NOT NULL CHECK(share_bps BETWEEN 1 AND 10000),
  maximum_microtu bigint NOT NULL CHECK(maximum_microtu>0),
  paid_microtu bigint NOT NULL DEFAULT 0 CHECK(paid_microtu>=0 AND paid_microtu<=maximum_microtu),
  credited_ms bigint NOT NULL DEFAULT 0 CHECK(credited_ms>=0),
  sample_ready boolean NOT NULL DEFAULT false,
  node_epoch bigint,
  withdrawn_at timestamptz,
  PRIMARY KEY(lease_id,node_id), UNIQUE(lease_id,ordinal)
);
CREATE TABLE route_availability_acceptances (
  lease_id uuid NOT NULL REFERENCES route_availability_leases(id),
  provider_id uuid NOT NULL REFERENCES users(id),
  terms_sha256 text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(lease_id,provider_id)
);
CREATE TABLE route_availability_events (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lease_id uuid NOT NULL REFERENCES route_availability_leases(id),
  kind text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_route_availability_acceptances BEFORE UPDATE OR DELETE ON route_availability_acceptances
  FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();
CREATE TRIGGER immutable_route_availability_events BEFORE UPDATE OR DELETE ON route_availability_events
  FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();
CREATE FUNCTION check_availability_member_insert() RETURNS trigger LANGUAGE plpgsql SET search_path=nai,pg_temp AS $$
BEGIN
  IF (SELECT writer_xid FROM route_availability_leases WHERE id=NEW.lease_id) IS DISTINCT FROM pg_current_xact_id() THEN
    RAISE EXCEPTION 'cannot append to committed availability terms';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER route_availability_member_insert BEFORE INSERT ON route_availability_members
  FOR EACH ROW EXECUTE FUNCTION check_availability_member_insert();
CREATE FUNCTION check_route_availability_terms() RETURNS trigger LANGUAGE plpgsql SET search_path=nai,pg_temp AS $$
BEGIN
  IF (SELECT sum(maximum_microtu) FROM route_availability_members WHERE lease_id=NEW.id) IS DISTINCT FROM NEW.budget_microtu::numeric
    OR (SELECT count(*) FROM route_availability_members WHERE lease_id=NEW.id)<>(SELECT count(*) FROM route_members WHERE route_id=NEW.route_id)
    OR EXISTS(SELECT 1 FROM route_availability_members am LEFT JOIN route_members rm ON rm.route_id=NEW.route_id AND rm.node_id=am.node_id
      WHERE am.lease_id=NEW.id AND (rm.node_id IS NULL OR rm.provider_id<>am.provider_id OR rm.resource_domain_id<>am.resource_domain_id
        OR rm.ordinal<>am.ordinal OR rm.share_bps<>am.share_bps OR rm.role<>am.role)) THEN
    RAISE EXCEPTION 'invalid complete availability terms';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER complete_availability_terms AFTER INSERT ON route_availability_leases DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_route_availability_terms();

-- Shared claim registry for both generations of readiness contracts. Inference
-- reservations remain separate: a readiness contract is not an exclusive job slot.
CREATE TABLE availability_domain_claims (
  resource_domain_id uuid PRIMARY KEY REFERENCES resource_domains(id),
  node_lease_id uuid UNIQUE REFERENCES availability_leases(id),
  route_lease_id uuid REFERENCES route_availability_leases(id),
  CHECK((node_lease_id IS NULL)<>(route_lease_id IS NULL))
);
INSERT INTO availability_domain_claims(resource_domain_id,node_lease_id)
  SELECT resource_domain_id,id FROM availability_leases WHERE state='ACTIVE';
CREATE FUNCTION maintain_availability_claims() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=nai,pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME='availability_leases' THEN
    IF NEW.state='ACTIVE' AND OLD.state<>'ACTIVE' THEN
      INSERT INTO availability_domain_claims(resource_domain_id,node_lease_id) VALUES(NEW.resource_domain_id,NEW.id);
    ELSIF NEW.state<>'ACTIVE' AND OLD.state='ACTIVE' THEN
      DELETE FROM availability_domain_claims WHERE node_lease_id=NEW.id;
    END IF;
  ELSE
    IF NEW.state IN ('ACTIVE','DRAINING') AND OLD.state NOT IN ('ACTIVE','DRAINING') THEN
      INSERT INTO availability_domain_claims(resource_domain_id,route_lease_id)
        SELECT DISTINCT resource_domain_id,NEW.id FROM route_availability_members WHERE lease_id=NEW.id;
    ELSIF NEW.state NOT IN ('ACTIVE','DRAINING') AND OLD.state IN ('ACTIVE','DRAINING') THEN
      DELETE FROM availability_domain_claims WHERE route_lease_id=NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER node_availability_claims AFTER UPDATE OF state ON availability_leases
  FOR EACH ROW EXECUTE FUNCTION maintain_availability_claims();
CREATE TRIGGER route_availability_claims AFTER UPDATE OF state ON route_availability_leases
  FOR EACH ROW EXECUTE FUNCTION maintain_availability_claims();

REVOKE ALL ON route_availability_leases,route_availability_members,route_availability_acceptances,route_availability_events,availability_domain_claims FROM PUBLIC;
REVOKE ALL ON FUNCTION check_availability_member_insert(),check_route_availability_terms(),maintain_availability_claims() FROM PUBLIC;
GRANT SELECT ON route_availability_leases,route_availability_members,route_availability_acceptances,route_availability_events,availability_domain_claims TO network_ai_runtime;
GRANT INSERT(id,sponsor_id,route_id,route_sha256,manifest_sha256,terms_sha256,terms,purpose,reason,idempotency_key,request_sha256,
  escrow_account,duration_seconds,rate_microtu_per_second,budget_microtu) ON route_availability_leases TO network_ai_runtime;
GRANT UPDATE(state,paid_microtu,joint_ready_ms,sample_ms,sample_ready,started_ms,ends_ms,finished_at) ON route_availability_leases TO network_ai_runtime;
GRANT INSERT(lease_id,node_id,provider_id,resource_domain_id,ordinal,role,share_bps,maximum_microtu) ON route_availability_members TO network_ai_runtime;
GRANT UPDATE(paid_microtu,credited_ms,sample_ready,node_epoch,withdrawn_at) ON route_availability_members TO network_ai_runtime;
GRANT INSERT ON route_availability_acceptances,route_availability_events TO network_ai_runtime;
GRANT USAGE,SELECT ON SEQUENCE route_availability_events_sequence_seq TO network_ai_runtime;
