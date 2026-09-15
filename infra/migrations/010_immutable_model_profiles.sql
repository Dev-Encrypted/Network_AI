-- Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
-- An accepted model hash includes its exact artifact, rates and execution profile.
-- Qualification can change; its definition must use a new model ID and consent.
SET search_path TO nai, public;
REVOKE UPDATE, DELETE ON models FROM network_ai_runtime;
GRANT UPDATE(state,qualification_note) ON models TO network_ai_runtime;
CREATE FUNCTION immutable_model_definition() RETURNS trigger LANGUAGE plpgsql SET search_path=nai,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'model definitions are retained; revoke qualification instead'; END IF;
  IF ROW(NEW.id,NEW.manifest,NEW.manifest_sha256,NEW.publisher_id,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.manifest,OLD.manifest_sha256,OLD.publisher_id,OLD.created_at) THEN
    RAISE EXCEPTION 'model definition is immutable; publish a new model profile';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_model_profile BEFORE UPDATE OR DELETE ON models
FOR EACH ROW EXECUTE FUNCTION immutable_model_definition();
REVOKE ALL ON FUNCTION immutable_model_definition() FROM PUBLIC;
