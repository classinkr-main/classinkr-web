-- Korean CRM operational unblock bundle.
-- Manual SQL Editor apply helper for the CRM runbook. This is intentionally
-- kept outside supabase/migrations because the repo already has several
-- 20260610_* migration files and some deploy tools treat that prefix as a
-- duplicate migration version.
--
-- Source migrations, in order:
-- 1. supabase/migrations/20260610_external_crm_snapshots.sql
-- 2. supabase/migrations/20260610_external_crm_stale_tracking.sql
-- 3. supabase/migrations/20260610_crm_source_links.sql
-- 4. supabase/migrations/20260610_external_crm_write_request_guards.sql
-- 5. supabase/migrations/20260610_external_crm_write_request_retry_audit.sql
-- 6. supabase/migrations/20260610_rev_color_amounts.sql (conditional)

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF to_regprocedure('public.update_updated_at()') IS NULL THEN
    RAISE EXCEPTION 'Missing public.update_updated_at(). Apply the project base migrations before this CRM bundle.';
  END IF;

  IF to_regprocedure('public.is_active_admin()') IS NULL THEN
    RAISE EXCEPTION 'Missing public.is_active_admin(). Apply the project admin base schema before this CRM bundle.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_source_link_status') THEN
    CREATE TYPE public.crm_source_link_status AS ENUM ('candidate', 'confirmed', 'rejected', 'stale');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.crm_source_links (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system       TEXT NOT NULL,
  source_object       TEXT NOT NULL,
  source_record_key   TEXT NOT NULL,
  normalized_name     TEXT,
  target_type         TEXT NOT NULL CHECK (target_type IN (
    'lead',
    'legacy_partner',
    'partner_account',
    'customer',
    'deal',
    'quote',
    'contract',
    'receipt',
    'external_account',
    'external_contact',
    'external_opportunity'
  )),
  target_id           TEXT NOT NULL,
  confidence          NUMERIC(5,4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  status              public.crm_source_link_status NOT NULL DEFAULT 'candidate',
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  confirmed_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.crm_source_links'::regclass
      AND conname = 'crm_source_links_unique_candidate'
  ) THEN
    ALTER TABLE public.crm_source_links
      ADD CONSTRAINT crm_source_links_unique_candidate
        UNIQUE (source_system, source_object, source_record_key, target_type, target_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS crm_source_links_one_confirmed_source_idx
  ON public.crm_source_links (source_system, source_object, source_record_key)
  WHERE status = 'confirmed';

CREATE INDEX IF NOT EXISTS crm_source_links_source_idx
  ON public.crm_source_links (source_system, source_object, status);

CREATE INDEX IF NOT EXISTS crm_source_links_target_idx
  ON public.crm_source_links (target_type, target_id, status);

CREATE INDEX IF NOT EXISTS crm_source_links_normalized_name_idx
  ON public.crm_source_links (normalized_name);

DROP TRIGGER IF EXISTS crm_source_links_updated_at ON public.crm_source_links;
CREATE TRIGGER crm_source_links_updated_at
  BEFORE UPDATE ON public.crm_source_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.crm_source_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage crm source links" ON public.crm_source_links;
CREATE POLICY "Admins manage crm source links"
  ON public.crm_source_links
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

CREATE TABLE IF NOT EXISTS public.external_crm_sync_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system       TEXT NOT NULL DEFAULT 'xiaoshouyi',
  object_api_key      TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'skipped')),
  trigger             TEXT NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual', 'cron', 'import')),
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at         TIMESTAMPTZ,
  rows_scanned        INTEGER,
  rows_upserted       INTEGER,
  cursor_value        TEXT,
  error               TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS external_crm_sync_runs_recent_idx
  ON public.external_crm_sync_runs (source_system, object_api_key, started_at DESC);

CREATE INDEX IF NOT EXISTS external_crm_sync_runs_status_idx
  ON public.external_crm_sync_runs (status, started_at DESC);

CREATE TABLE IF NOT EXISTS public.external_crm_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system       TEXT NOT NULL DEFAULT 'xiaoshouyi',
  object_api_key      TEXT NOT NULL,
  external_id         TEXT NOT NULL,
  normalized_name     TEXT,
  display_name        TEXT,
  owner_name          TEXT,
  status              TEXT,
  amount              NUMERIC(14,0),
  occurred_at         TIMESTAMPTZ,
  payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_hash        TEXT,
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.external_crm_records
  ADD COLUMN IF NOT EXISTS last_seen_run_id UUID REFERENCES public.external_crm_sync_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_stale BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stale_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.external_crm_records'::regclass
      AND conname = 'external_crm_records_unique_source'
  ) THEN
    ALTER TABLE public.external_crm_records
      ADD CONSTRAINT external_crm_records_unique_source
        UNIQUE (source_system, object_api_key, external_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS external_crm_records_object_idx
  ON public.external_crm_records (source_system, object_api_key, synced_at DESC);

CREATE INDEX IF NOT EXISTS external_crm_records_name_idx
  ON public.external_crm_records (normalized_name);

CREATE INDEX IF NOT EXISTS external_crm_records_amount_idx
  ON public.external_crm_records (object_api_key, occurred_at DESC)
  WHERE amount IS NOT NULL;

CREATE INDEX IF NOT EXISTS external_crm_records_stale_idx
  ON public.external_crm_records (source_system, object_api_key, is_stale, synced_at DESC);

CREATE INDEX IF NOT EXISTS external_crm_records_last_seen_run_idx
  ON public.external_crm_records (last_seen_run_id);

CREATE TABLE IF NOT EXISTS public.crm_write_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system       TEXT NOT NULL DEFAULT 'xiaoshouyi',
  object_api_key      TEXT NOT NULL,
  external_id         TEXT,
  operation           TEXT NOT NULL CHECK (operation IN ('create', 'update', 'transfer_owner')),
  payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
  preview_payload     JSONB,
  status              TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'sent', 'succeeded', 'failed', 'cancelled')),
  requested_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ,
  executed_at         TIMESTAMPTZ,
  response_payload    JSONB,
  error               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_write_requests
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_attempt_error TEXT;

CREATE INDEX IF NOT EXISTS crm_write_requests_status_idx
  ON public.crm_write_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS crm_write_requests_source_idx
  ON public.crm_write_requests (source_system, object_api_key, external_id);

CREATE INDEX IF NOT EXISTS crm_write_requests_retry_idx
  ON public.crm_write_requests (status, next_retry_at, updated_at DESC)
  WHERE status = 'failed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.crm_write_requests'::regclass
      AND conname = 'crm_write_requests_payload_object_chk'
  ) THEN
    ALTER TABLE public.crm_write_requests
      ADD CONSTRAINT crm_write_requests_payload_object_chk
        CHECK (jsonb_typeof(payload) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.crm_write_requests'::regclass
      AND conname = 'crm_write_requests_preview_object_chk'
  ) THEN
    ALTER TABLE public.crm_write_requests
      ADD CONSTRAINT crm_write_requests_preview_object_chk
        CHECK (preview_payload IS NULL OR jsonb_typeof(preview_payload) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.crm_write_requests'::regclass
      AND conname = 'crm_write_requests_response_object_chk'
  ) THEN
    ALTER TABLE public.crm_write_requests
      ADD CONSTRAINT crm_write_requests_response_object_chk
        CHECK (response_payload IS NULL OR jsonb_typeof(response_payload) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.crm_write_requests'::regclass
      AND conname = 'crm_write_requests_external_id_required_chk'
  ) THEN
    ALTER TABLE public.crm_write_requests
      ADD CONSTRAINT crm_write_requests_external_id_required_chk
        CHECK (
          operation = 'create'
          OR NULLIF(btrim(COALESCE(external_id, '')), '') IS NOT NULL
        );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.crm_write_requests'::regclass
      AND conname = 'crm_write_requests_attempt_count_chk'
  ) THEN
    ALTER TABLE public.crm_write_requests
      ADD CONSTRAINT crm_write_requests_attempt_count_chk CHECK (attempt_count >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.crm_write_request_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  write_request_id    UUID NOT NULL REFERENCES public.crm_write_requests(id) ON DELETE CASCADE,
  event_type          TEXT NOT NULL CHECK (
    event_type IN ('created', 'approved', 'cancelled', 'sent', 'failed', 'succeeded', 'retry_requested')
  ),
  actor_user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  from_status         TEXT,
  to_status           TEXT,
  message             TEXT,
  payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.crm_write_request_events'::regclass
      AND conname = 'crm_write_request_events_write_request_id_fkey'
  ) THEN
    ALTER TABLE public.crm_write_request_events
      ADD CONSTRAINT crm_write_request_events_write_request_id_fkey
        FOREIGN KEY (write_request_id) REFERENCES public.crm_write_requests(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.crm_write_request_events'::regclass
      AND conname = 'crm_write_request_events_event_type_check'
  ) THEN
    ALTER TABLE public.crm_write_request_events
      ADD CONSTRAINT crm_write_request_events_event_type_check
        CHECK (event_type IN ('created', 'approved', 'cancelled', 'sent', 'failed', 'succeeded', 'retry_requested'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS crm_write_request_events_request_idx
  ON public.crm_write_request_events (write_request_id, created_at DESC);

DROP TRIGGER IF EXISTS external_crm_sync_runs_updated_at ON public.external_crm_sync_runs;
CREATE TRIGGER external_crm_sync_runs_updated_at
  BEFORE UPDATE ON public.external_crm_sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS external_crm_records_updated_at ON public.external_crm_records;
CREATE TRIGGER external_crm_records_updated_at
  BEFORE UPDATE ON public.external_crm_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS crm_write_requests_updated_at ON public.crm_write_requests;
CREATE TRIGGER crm_write_requests_updated_at
  BEFORE UPDATE ON public.crm_write_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.external_crm_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_crm_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_write_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_write_request_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage external crm sync runs" ON public.external_crm_sync_runs;
CREATE POLICY "Admins manage external crm sync runs"
  ON public.external_crm_sync_runs
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Admins manage external crm records" ON public.external_crm_records;
CREATE POLICY "Admins manage external crm records"
  ON public.external_crm_records
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Admins manage crm write requests" ON public.crm_write_requests;
CREATE POLICY "Admins manage crm write requests"
  ON public.crm_write_requests
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Admins manage crm write request events" ON public.crm_write_request_events;
CREATE POLICY "Admins manage crm write request events"
  ON public.crm_write_request_events
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

CREATE OR REPLACE FUNCTION public.get_crm_schema_contract_status()
RETURNS TABLE (
  contract_key TEXT,
  ok BOOLEAN,
  detail TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  external_records_reg REGCLASS := to_regclass('public.external_crm_records');
  source_links_reg REGCLASS := to_regclass('public.crm_source_links');
  write_requests_reg REGCLASS := to_regclass('public.crm_write_requests');
  write_events_reg REGCLASS := to_regclass('public.crm_write_request_events');
  external_records_unique_key SMALLINT[];
  source_links_candidate_key SMALLINT[];
  source_links_confirmed_key SMALLINT[];
BEGIN
  IF external_records_reg IS NOT NULL THEN
    SELECT array_agg(attribute.attnum ORDER BY column_order.ordinality)::SMALLINT[]
    INTO external_records_unique_key
    FROM unnest(ARRAY['source_system', 'object_api_key', 'external_id']) WITH ORDINALITY AS column_order(attname, ordinality)
    JOIN pg_attribute attribute
      ON attribute.attrelid = external_records_reg
     AND attribute.attname = column_order.attname
     AND NOT attribute.attisdropped;
  END IF;

  IF source_links_reg IS NOT NULL THEN
    SELECT array_agg(attribute.attnum ORDER BY column_order.ordinality)::SMALLINT[]
    INTO source_links_candidate_key
    FROM unnest(ARRAY['source_system', 'source_object', 'source_record_key', 'target_type', 'target_id']) WITH ORDINALITY AS column_order(attname, ordinality)
    JOIN pg_attribute attribute
      ON attribute.attrelid = source_links_reg
     AND attribute.attname = column_order.attname
     AND NOT attribute.attisdropped;

    SELECT array_agg(attribute.attnum ORDER BY column_order.ordinality)::SMALLINT[]
    INTO source_links_confirmed_key
    FROM unnest(ARRAY['source_system', 'source_object', 'source_record_key']) WITH ORDINALITY AS column_order(attname, ordinality)
    JOIN pg_attribute attribute
      ON attribute.attrelid = source_links_reg
     AND attribute.attname = column_order.attname
     AND NOT attribute.attisdropped;
  END IF;

  RETURN QUERY
  SELECT
    'external_crm_records_unique_source',
    external_records_reg IS NOT NULL AND EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = external_records_reg
        AND conname = 'external_crm_records_unique_source'
        AND contype = 'u'
        AND conkey = external_records_unique_key
    ),
    CASE
      WHEN external_records_reg IS NULL THEN 'external_crm_records table missing'
      ELSE 'external_crm_records unique source upsert target'
    END;

  RETURN QUERY
  SELECT
    'crm_source_links_unique_candidate',
    source_links_reg IS NOT NULL AND EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = source_links_reg
        AND conname = 'crm_source_links_unique_candidate'
        AND contype = 'u'
        AND conkey = source_links_candidate_key
    ),
    CASE
      WHEN source_links_reg IS NULL THEN 'crm_source_links table missing'
      ELSE 'crm_source_links source/target upsert target'
    END;

  RETURN QUERY
  SELECT
    'crm_source_links_one_confirmed_source_idx',
    source_links_reg IS NOT NULL AND EXISTS (
      SELECT 1
      FROM pg_class index_class
      JOIN pg_index index_def ON index_def.indexrelid = index_class.oid
      WHERE index_def.indrelid = source_links_reg
        AND index_class.relname = 'crm_source_links_one_confirmed_source_idx'
        AND index_def.indisunique
        AND index_def.indpred IS NOT NULL
        AND pg_get_expr(index_def.indpred, index_def.indrelid) ILIKE '%status%'
        AND pg_get_expr(index_def.indpred, index_def.indrelid) ILIKE '%confirmed%'
        AND index_def.indkey::TEXT = array_to_string(source_links_confirmed_key, ' ')
    ),
    CASE
      WHEN source_links_reg IS NULL THEN 'crm_source_links table missing'
      ELSE 'crm_source_links one confirmed source unique index'
    END;

  RETURN QUERY
  SELECT
    constraint_name,
    write_requests_reg IS NOT NULL AND EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = write_requests_reg
        AND conname = constraint_name
        AND contype = 'c'
    ),
    CASE
      WHEN write_requests_reg IS NULL THEN 'crm_write_requests table missing'
      ELSE 'crm_write_requests guard constraint'
    END
  FROM (
    VALUES
      ('crm_write_requests_payload_object_chk'::TEXT),
      ('crm_write_requests_preview_object_chk'::TEXT),
      ('crm_write_requests_response_object_chk'::TEXT),
      ('crm_write_requests_external_id_required_chk'::TEXT),
      ('crm_write_requests_attempt_count_chk'::TEXT)
  ) AS constraints(constraint_name);

  RETURN QUERY
  SELECT
    'crm_write_request_events_write_request_id_fkey',
    write_events_reg IS NOT NULL AND write_requests_reg IS NOT NULL AND EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = write_events_reg
        AND confrelid = write_requests_reg
        AND conname = 'crm_write_request_events_write_request_id_fkey'
        AND contype = 'f'
    ),
    CASE
      WHEN write_events_reg IS NULL THEN 'crm_write_request_events table missing'
      WHEN write_requests_reg IS NULL THEN 'crm_write_requests table missing'
      ELSE 'write request event foreign key'
    END;

  RETURN QUERY
  SELECT
    'crm_write_request_events_event_type_check',
    write_events_reg IS NOT NULL AND EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = write_events_reg
        AND conname = 'crm_write_request_events_event_type_check'
        AND contype = 'c'
    ),
    CASE
      WHEN write_events_reg IS NULL THEN 'crm_write_request_events table missing'
      ELSE 'write request event type check'
    END;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_crm_schema_contract_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_crm_schema_contract_status() TO service_role;

DO $$
BEGIN
  IF to_regclass('public.branch_rev_deals') IS NOT NULL THEN
    ALTER TABLE public.branch_rev_deals
      ADD COLUMN IF NOT EXISTS monthly_confirmed JSONB NOT NULL DEFAULT '{}';
    ALTER TABLE public.branch_rev_deals
      ADD COLUMN IF NOT EXISTS monthly_high_conf JSONB NOT NULL DEFAULT '{}';
    ALTER TABLE public.branch_rev_deals DROP COLUMN IF EXISTS monthly_blue;

    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.replace_branch_rev_deals(rows JSONB)
      RETURNS VOID
      LANGUAGE plpgsql
      AS $function$
      BEGIN
        TRUNCATE branch_rev_deals;
        INSERT INTO branch_rev_deals (
          sheet_row, customer_name, branch_contact, team, manager, deal_type, status,
          first_payment, product_version, region, importance, note, contract_target,
          monthly_payments, monthly_red, monthly_confirmed, monthly_high_conf, raw)
        SELECT (r->>'sheet_row')::int, r->>'customer_name', r->>'branch_contact',
               r->>'team', r->>'manager', r->>'deal_type', r->>'status',
               nullif(r->>'first_payment','')::date,
               r->>'product_version', r->>'region', r->>'importance', r->>'note',
               nullif(r->>'contract_target','')::numeric,
               coalesce(r->'monthly_payments','{}'::jsonb),
               coalesce(r->'monthly_red','{}'::jsonb),
               coalesce(r->'monthly_confirmed','{}'::jsonb),
               coalesce(r->'monthly_high_conf','{}'::jsonb),
               coalesce(r->'raw','{}'::jsonb)
        FROM jsonb_array_elements(rows) AS r;
      END
      $function$;
    $sql$;

    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.replace_branch_rev_deals(JSONB) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.replace_branch_rev_deals(JSONB) TO service_role';
  END IF;
END $$;

COMMIT;
