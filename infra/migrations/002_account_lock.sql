-- Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
-- Row locks require UPDATE privilege in PostgreSQL. Expose a narrowly scoped
-- lock operation while keeping balance and history columns unmodifiable.
CREATE FUNCTION nai.lock_ledger_accounts(account_ids text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=nai,pg_temp AS $$
BEGIN
  PERFORM id FROM ledger_accounts WHERE id=ANY(account_ids) ORDER BY id FOR UPDATE;
END $$;
REVOKE ALL ON FUNCTION nai.lock_ledger_accounts(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nai.lock_ledger_accounts(text[]) TO network_ai_runtime;
