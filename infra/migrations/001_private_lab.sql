-- Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
CREATE SCHEMA IF NOT EXISTS nai;
SET search_path = nai, public;

CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE users (
  id uuid PRIMARY KEY, login text NOT NULL UNIQUE, name text NOT NULL, password_hash text NOT NULL,
  role text NOT NULL CHECK(role IN ('admin','member')), disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), last_admitted_at timestamptz NOT NULL DEFAULT '-infinity'
);
CREATE TABLE auth_sessions (
  token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE api_keys (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), token_hash text NOT NULL UNIQUE,
  prefix text NOT NULL, label text NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE resource_domains (
  id uuid PRIMARY KEY, name text NOT NULL, slots integer NOT NULL CHECK(slots BETWEEN 1 AND 16),
  owner_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE models (
  id text PRIMARY KEY, manifest jsonb NOT NULL, manifest_sha256 text NOT NULL UNIQUE,
  state text NOT NULL CHECK(state IN ('CANDIDATE','LOCAL_PREVIEW','REVOKED')),
  publisher_id uuid NOT NULL REFERENCES users(id), qualification_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE nodes (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), name text NOT NULL,
  public_key text UNIQUE, resource_domain_id uuid NOT NULL REFERENCES resource_domains(id),
  model_id text NOT NULL REFERENCES models(id), base_url text NOT NULL,
  epoch bigint NOT NULL DEFAULT 0 CHECK(epoch >= 0), boot_id uuid,
  state text NOT NULL DEFAULT 'OFFLINE' CHECK(state IN ('OFFLINE','VALIDATING','READY','PAUSED','DRAINING','FAULTED','REVOKED')),
  desired_state text NOT NULL DEFAULT 'READY' CHECK(desired_state IN ('READY','PAUSED','REVOKED')),
  last_seen timestamptz, inventory jsonb NOT NULL DEFAULT '{}',
  loaded_backend_models jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE node_invites (
  token_hash text PRIMARY KEY, node_id uuid NOT NULL REFERENCES nodes(id), expires_at timestamptz NOT NULL, consumed_at timestamptz
);
CREATE TABLE node_nonces (
  node_id uuid NOT NULL REFERENCES nodes(id), nonce text NOT NULL, seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(node_id,nonce)
);
CREATE TABLE ledger_accounts (
  id text PRIMARY KEY, owner_id uuid REFERENCES users(id), kind text NOT NULL,
  unit text NOT NULL DEFAULT 'LAB_TU' CHECK(unit='LAB_TU'), balance bigint NOT NULL DEFAULT 0,
  CHECK(balance >= 0 OR kind='LAB_ISSUER')
);
CREATE TABLE journal (
  id uuid PRIMARY KEY, business_key text NOT NULL UNIQUE, kind text NOT NULL,
  unit text NOT NULL DEFAULT 'LAB_TU' CHECK(unit='LAB_TU'), metadata jsonb NOT NULL DEFAULT '{}',
  writer_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE journal_lines (
  journal_id uuid NOT NULL REFERENCES journal(id), account_id text NOT NULL REFERENCES ledger_accounts(id),
  amount bigint NOT NULL CHECK(amount <> 0), PRIMARY KEY(journal_id,account_id)
);
CREATE FUNCTION apply_journal_line() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=nai,pg_temp AS $$
BEGIN
  IF (SELECT writer_xid FROM journal WHERE id=NEW.journal_id) IS DISTINCT FROM pg_current_xact_id() THEN
    RAISE EXCEPTION 'cannot append to committed journal';
  END IF;
  UPDATE ledger_accounts SET balance=balance+NEW.amount WHERE id=NEW.account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ledger account missing'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER apply_line AFTER INSERT ON journal_lines FOR EACH ROW EXECUTE FUNCTION apply_journal_line();
CREATE FUNCTION require_balanced_journal() RETURNS trigger LANGUAGE plpgsql SET search_path=nai,pg_temp AS $$
BEGIN
  IF (SELECT count(*) FROM journal_lines WHERE journal_id=NEW.id) < 2 OR
     (SELECT coalesce(sum(amount),0) FROM journal_lines WHERE journal_id=NEW.id) <> 0 THEN
    RAISE EXCEPTION 'unbalanced journal';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER balanced_journal AFTER INSERT ON journal DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION require_balanced_journal();
CREATE FUNCTION forbid_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable history'; END $$;
CREATE TRIGGER immutable_journal BEFORE UPDATE OR DELETE ON journal FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();
CREATE TRIGGER immutable_lines BEFORE UPDATE OR DELETE ON journal_lines FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();

CREATE TABLE quotes (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), model_id text NOT NULL REFERENCES models(id),
  manifest jsonb NOT NULL, manifest_sha256 text NOT NULL, max_output_tokens integer NOT NULL,
  maximum_microtu bigint NOT NULL CHECK(maximum_microtu>=0), expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), quote_id uuid NOT NULL REFERENCES quotes(id),
  model_id text NOT NULL REFERENCES models(id), manifest_sha256 text NOT NULL,
  idempotency_key text NOT NULL, request_sha256 text NOT NULL, request_bytes integer NOT NULL CHECK(request_bytes>0),
  state text NOT NULL CHECK(state IN ('QUEUED','PREPARING','AUTHORIZED','RUNNING','CANCELLING','COMPLETED','FAILED','CANCELLED','INTERRUPTED')),
  billing_state text NOT NULL DEFAULT 'HELD' CHECK(billing_state IN ('HELD','SETTLED','REFUNDED','DISPUTED')),
  hold_microtu bigint NOT NULL CHECK(hold_microtu>=0), charged_microtu bigint NOT NULL DEFAULT 0 CHECK(charged_microtu>=0),
  node_id uuid REFERENCES nodes(id), resource_domain_id uuid REFERENCES resource_domains(id),
  attempt_id uuid, node_epoch bigint, prepare_id text,
  queue_deadline timestamptz NOT NULL, execution_deadline timestamptz,
  error_code text, prompt_tokens integer, completion_tokens integer, elapsed_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, finished_at timestamptz,
  UNIQUE(user_id,idempotency_key), CHECK(charged_microtu<=hold_microtu)
);
CREATE INDEX sessions_owner_time ON sessions(user_id,created_at DESC);
CREATE INDEX sessions_active_domain ON sessions(resource_domain_id,state);
CREATE INDEX sessions_queue ON sessions(state,created_at);
CREATE TABLE receipts (
  session_id uuid PRIMARY KEY REFERENCES sessions(id), attempt_id uuid NOT NULL,
  node_id uuid NOT NULL REFERENCES nodes(id), digest text NOT NULL, payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_receipts BEFORE UPDATE OR DELETE ON receipts FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();
CREATE TABLE events (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, session_id uuid REFERENCES sessions(id),
  actor_id uuid, kind text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_session_sequence ON events(session_id,sequence);
CREATE TRIGGER immutable_events BEFORE UPDATE OR DELETE ON events FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();

INSERT INTO ledger_accounts(id,kind) VALUES ('lab:issuer','LAB_ISSUER'),('lab:working','WORKING') ON CONFLICT DO NOTHING;

REVOKE ALL ON SCHEMA nai FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA nai FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA nai FROM PUBLIC;
GRANT USAGE ON SCHEMA nai TO network_ai_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA nai TO network_ai_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA nai TO network_ai_runtime;
REVOKE UPDATE, DELETE ON journal,journal_lines,receipts,events FROM network_ai_runtime;
REVOKE INSERT, UPDATE, DELETE ON ledger_accounts FROM network_ai_runtime;
GRANT INSERT(id,owner_id,kind,unit) ON ledger_accounts TO network_ai_runtime;
REVOKE INSERT ON journal FROM network_ai_runtime;
GRANT INSERT(id,business_key,kind,unit,metadata) ON journal TO network_ai_runtime;
REVOKE INSERT, UPDATE, DELETE ON schema_migrations FROM network_ai_runtime;
