-- Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
-- Private complete-route reservations. This is not an independent-work verifier.
SET search_path TO nai, public;
ALTER TABLE nodes ADD COLUMN node_kind text NOT NULL DEFAULT 'INFERENCE'
  CHECK(node_kind IN ('INFERENCE','ROUTE_ROOT','RPC_STAGE'));
-- An admitted identity cannot move to a different owner, device, model or role.
REVOKE UPDATE ON nodes FROM network_ai_runtime;
GRANT UPDATE(public_key,boot_id,epoch,state,desired_state,last_seen,inventory,loaded_backend_models)
  ON nodes TO network_ai_runtime;

CREATE TABLE execution_routes (
  id uuid PRIMARY KEY,
  publisher_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL,
  model_id text NOT NULL REFERENCES models(id),
  manifest_sha256 text NOT NULL,
  root_node_id uuid NOT NULL REFERENCES nodes(id),
  route_sha256 text NOT NULL UNIQUE,
  terms jsonb NOT NULL,
  idempotency_key uuid NOT NULL,
  request_sha256 text NOT NULL,
  state text NOT NULL DEFAULT 'CANDIDATE' CHECK(state IN ('CANDIDATE','LOCAL_PREVIEW','REVOKED')),
  qualification_note text NOT NULL DEFAULT '',
  writer_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(publisher_id,idempotency_key)
);
CREATE UNIQUE INDEX one_qualified_route_per_root ON execution_routes(root_node_id) WHERE state='LOCAL_PREVIEW';
CREATE TABLE route_members (
  route_id uuid NOT NULL REFERENCES execution_routes(id),
  node_id uuid NOT NULL REFERENCES nodes(id),
  provider_id uuid NOT NULL REFERENCES users(id),
  resource_domain_id uuid NOT NULL REFERENCES resource_domains(id),
  ordinal integer NOT NULL CHECK(ordinal BETWEEN 0 AND 15),
  role text NOT NULL CHECK(role IN ('ROOT','STAGE')),
  share_bps integer NOT NULL CHECK(share_bps BETWEEN 1 AND 10000),
  PRIMARY KEY(route_id,node_id), UNIQUE(route_id,ordinal),
  CHECK((ordinal=0 AND role='ROOT') OR (ordinal>0 AND role='STAGE'))
);
CREATE TABLE route_acceptances (
  route_id uuid NOT NULL REFERENCES execution_routes(id),
  provider_id uuid NOT NULL REFERENCES users(id),
  route_sha256 text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  PRIMARY KEY(route_id,provider_id)
);
CREATE FUNCTION check_route_member_insert() RETURNS trigger LANGUAGE plpgsql SET search_path=nai,pg_temp AS $$
BEGIN
  IF (SELECT writer_xid FROM execution_routes WHERE id=NEW.route_id) IS DISTINCT FROM pg_current_xact_id() THEN
    RAISE EXCEPTION 'cannot append to committed route';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER route_member_insert BEFORE INSERT ON route_members FOR EACH ROW EXECUTE FUNCTION check_route_member_insert();
CREATE FUNCTION check_complete_route() RETURNS trigger LANGUAGE plpgsql SET search_path=nai,pg_temp AS $$
DECLARE members integer;
BEGIN
  SELECT count(*) INTO members FROM route_members WHERE route_id=NEW.id;
  IF members NOT BETWEEN 2 AND 16 OR
     (SELECT sum(share_bps) FROM route_members WHERE route_id=NEW.id)<>10000 OR
     (SELECT max(ordinal) FROM route_members WHERE route_id=NEW.id)<>members-1 OR
     EXISTS(SELECT 1 FROM route_members rm JOIN nodes n ON n.id=rm.node_id WHERE rm.route_id=NEW.id AND
       (n.owner_id<>rm.provider_id OR n.resource_domain_id<>rm.resource_domain_id OR n.model_id<>NEW.model_id OR
        (rm.role='ROOT' AND (n.id<>NEW.root_node_id OR n.node_kind<>'ROUTE_ROOT')) OR
        (rm.role='STAGE' AND n.node_kind<>'RPC_STAGE'))) THEN
    RAISE EXCEPTION 'invalid complete route';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER complete_route AFTER INSERT ON execution_routes DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_complete_route();
CREATE TRIGGER immutable_route_members BEFORE UPDATE OR DELETE ON route_members FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();

ALTER TABLE sessions ADD COLUMN route_id uuid REFERENCES execution_routes(id);
ALTER TABLE sessions ADD COLUMN route_sha256 text;
CREATE TABLE session_domains (
  session_id uuid NOT NULL REFERENCES sessions(id),
  resource_domain_id uuid NOT NULL REFERENCES resource_domains(id),
  PRIMARY KEY(session_id,resource_domain_id)
);
CREATE TABLE session_participants (
  session_id uuid NOT NULL REFERENCES sessions(id),
  node_id uuid NOT NULL REFERENCES nodes(id),
  provider_id uuid NOT NULL REFERENCES users(id),
  resource_domain_id uuid NOT NULL REFERENCES resource_domains(id),
  ordinal integer NOT NULL,
  role text NOT NULL CHECK(role IN ('ROOT','STAGE')),
  share_bps integer NOT NULL CHECK(share_bps BETWEEN 1 AND 10000),
  node_epoch bigint NOT NULL,
  prepare_id text,
  claimed_at timestamptz,
  paid_microtu bigint NOT NULL DEFAULT 0 CHECK(paid_microtu>=0),
  PRIMARY KEY(session_id,node_id), UNIQUE(session_id,ordinal)
);
CREATE TABLE stage_receipts (
  session_id uuid NOT NULL,
  node_id uuid NOT NULL,
  digest text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(session_id,node_id),
  FOREIGN KEY(session_id,node_id) REFERENCES session_participants(session_id,node_id)
);
CREATE TRIGGER immutable_stage_receipts BEFORE UPDATE OR DELETE ON stage_receipts FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();
CREATE TRIGGER immutable_session_domains BEFORE UPDATE OR DELETE ON session_domains FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();

-- UNION retains reservations created by the previous version during an upgrade.
-- Multiple stages using one physical domain consume one whole-route slot there.
CREATE VIEW active_session_domains AS
  SELECT s.id AS session_id,s.resource_domain_id FROM sessions s
  WHERE s.resource_domain_id IS NOT NULL AND s.state IN ('PREPARING','AUTHORIZED','RUNNING','CANCELLING')
  UNION
  SELECT s.id,d.resource_domain_id FROM sessions s JOIN session_domains d ON d.session_id=s.id
  WHERE s.state IN ('PREPARING','AUTHORIZED','RUNNING','CANCELLING');

CREATE VIEW ready_execution_offers AS
  SELECT ('node:'||n.id)::text AS offer_key,NULL::uuid AS route_id,n.model_id,n.id AS root_node_id,
    ARRAY[n.resource_domain_id] AS domain_ids,ARRAY[n.id] AS node_ids,n.last_seen
  FROM nodes n JOIN models m ON m.id=n.model_id JOIN users u ON u.id=n.owner_id
  WHERE n.node_kind='INFERENCE' AND NOT u.disabled AND m.state='LOCAL_PREVIEW'
    AND n.state='READY' AND n.desired_state='READY' AND n.last_seen>now()-interval '15 seconds'
    AND n.loaded_backend_models ? (m.manifest->>'backend_model')
  UNION ALL
  SELECT ('route:'||r.id)::text,r.id,r.model_id,r.root_node_id,
    ARRAY(SELECT DISTINCT resource_domain_id FROM route_members WHERE route_id=r.id ORDER BY resource_domain_id),
    ARRAY(SELECT node_id FROM route_members WHERE route_id=r.id ORDER BY ordinal),n.last_seen
  FROM execution_routes r JOIN nodes n ON n.id=r.root_node_id JOIN models m ON m.id=r.model_id
  WHERE r.state='LOCAL_PREVIEW' AND m.state='LOCAL_PREVIEW' AND m.manifest_sha256=r.manifest_sha256
    AND NOT EXISTS (
      SELECT 1 FROM route_members rm JOIN nodes p ON p.id=rm.node_id JOIN users u ON u.id=rm.provider_id
      LEFT JOIN route_acceptances a ON a.route_id=rm.route_id AND a.provider_id=rm.provider_id
      WHERE rm.route_id=r.id AND (a.provider_id IS NULL OR a.withdrawn_at IS NOT NULL OR a.route_sha256<>r.route_sha256
        OR u.disabled OR p.owner_id<>rm.provider_id OR p.resource_domain_id<>rm.resource_domain_id OR p.model_id<>r.model_id
        OR p.state<>'READY' OR p.desired_state<>'READY' OR p.last_seen IS NULL OR p.last_seen<=now()-interval '15 seconds'
        OR NOT (p.loaded_backend_models ? (m.manifest->>'backend_model')))
    );

REVOKE ALL ON execution_routes,route_members,route_acceptances,session_domains,session_participants,stage_receipts FROM PUBLIC;
REVOKE ALL ON FUNCTION check_complete_route(),check_route_member_insert() FROM PUBLIC;
GRANT SELECT ON execution_routes,route_members,route_acceptances,session_domains,session_participants,stage_receipts,
  active_session_domains,ready_execution_offers TO network_ai_runtime;
GRANT INSERT(id,publisher_id,name,model_id,manifest_sha256,root_node_id,route_sha256,terms,idempotency_key,request_sha256)
  ON execution_routes TO network_ai_runtime;
GRANT UPDATE(state,qualification_note) ON execution_routes TO network_ai_runtime;
GRANT INSERT ON route_members,route_acceptances,session_domains,session_participants,stage_receipts TO network_ai_runtime;
GRANT UPDATE(withdrawn_at) ON route_acceptances TO network_ai_runtime;
GRANT UPDATE(prepare_id,claimed_at,paid_microtu) ON session_participants TO network_ai_runtime;
