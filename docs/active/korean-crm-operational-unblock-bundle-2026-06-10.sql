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
-- 6. supabase/migrations/20260610_crm_source_priority_aliases_catalog.sql
-- 7. supabase/migrations/20260610_rev_color_amounts.sql (conditional)

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
      FROM pg_constraint constraint_def
      WHERE conrelid = write_requests_reg
        AND conname = constraint_name
        AND contype = 'c'
        AND NOT EXISTS (
          SELECT 1
          FROM unnest(required_fragments) fragment
          WHERE pg_get_constraintdef(constraint_def.oid) NOT ILIKE '%' || fragment || '%'
        )
    ),
    CASE
      WHEN write_requests_reg IS NULL THEN 'crm_write_requests table missing'
      ELSE 'crm_write_requests guard constraint'
    END
  FROM (
    VALUES
      ('crm_write_requests_payload_object_chk'::TEXT, ARRAY['jsonb_typeof(payload)', '''object''']::TEXT[]),
      ('crm_write_requests_preview_object_chk'::TEXT, ARRAY['preview_payload IS NULL', 'jsonb_typeof(preview_payload)', '''object''']::TEXT[]),
      ('crm_write_requests_response_object_chk'::TEXT, ARRAY['response_payload IS NULL', 'jsonb_typeof(response_payload)', '''object''']::TEXT[]),
      ('crm_write_requests_external_id_required_chk'::TEXT, ARRAY['operation', '''create''', 'external_id']::TEXT[]),
      ('crm_write_requests_attempt_count_chk'::TEXT, ARRAY['attempt_count', '>= 0']::TEXT[])
  ) AS constraints(constraint_name, required_fragments);

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

CREATE TABLE IF NOT EXISTS public.crm_source_priorities (
  source_system          TEXT PRIMARY KEY,
  label                  TEXT NOT NULL,
  priority               INTEGER NOT NULL CHECK (priority > 0),
  trust_tier             TEXT NOT NULL CHECK (trust_tier IN ('authoritative', 'high', 'medium', 'supporting', 'legacy')),
  is_primary             BOOLEAN NOT NULL DEFAULT false,
  read_policy            TEXT NOT NULL DEFAULT 'read',
  write_policy           TEXT NOT NULL DEFAULT 'disabled',
  freshness_window_hours INTEGER CHECK (freshness_window_hours IS NULL OR freshness_window_hours > 0),
  notes                  TEXT,
  metadata               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_source_priorities_priority_idx
  ON public.crm_source_priorities (priority, source_system);

CREATE TABLE IF NOT EXISTS public.crm_match_aliases (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias                      TEXT NOT NULL,
  normalized_alias           TEXT NOT NULL,
  canonical_name             TEXT,
  normalized_canonical_name  TEXT,
  target_type                TEXT CHECK (target_type IS NULL OR target_type IN ('partner_account', 'customer', 'deal', 'lead')),
  target_id                  TEXT,
  source_system              TEXT,
  source_record_key          TEXT,
  manager_name               TEXT,
  normalized_manager_name    TEXT,
  confidence_boost           NUMERIC(5,4) NOT NULL DEFAULT 0.1000
    CHECK (confidence_boost >= 0 AND confidence_boost <= 0.5000),
  status                     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'rejected', 'stale')),
  metadata                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by                 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_match_aliases_normalized_alias_idx
  ON public.crm_match_aliases (normalized_alias);

CREATE INDEX IF NOT EXISTS crm_match_aliases_target_idx
  ON public.crm_match_aliases (target_type, target_id, status);

CREATE INDEX IF NOT EXISTS crm_match_aliases_manager_idx
  ON public.crm_match_aliases (normalized_manager_name)
  WHERE normalized_manager_name IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crm_match_aliases_active_unique_idx
  ON public.crm_match_aliases (
    normalized_alias,
    COALESCE(target_type, ''),
    COALESCE(target_id, ''),
    COALESCE(source_system, ''),
    COALESCE(normalized_manager_name, '')
  )
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.crm_xiaoshouyi_query_catalog (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_api_key      TEXT NOT NULL UNIQUE,
  source_system       TEXT NOT NULL DEFAULT 'xiaoshouyi',
  fields              TEXT[] NOT NULL,
  where_clause        TEXT,
  order_by            TEXT NOT NULL DEFAULT 'updatedAt DESC',
  page_size           INTEGER NOT NULL DEFAULT 100 CHECK (page_size > 0 AND page_size <= 100),
  max_pages           INTEGER NOT NULL DEFAULT 20 CHECK (max_pages > 0),
  sync_priority       INTEGER NOT NULL DEFAULT 100 CHECK (sync_priority > 0),
  is_default_enabled  BOOLEAN NOT NULL DEFAULT true,
  is_write_allowed    BOOLEAN NOT NULL DEFAULT false,
  notes               TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_xiaoshouyi_query_catalog_enabled_idx
  ON public.crm_xiaoshouyi_query_catalog (is_default_enabled, sync_priority, object_api_key);

DROP TRIGGER IF EXISTS crm_source_priorities_updated_at ON public.crm_source_priorities;
CREATE TRIGGER crm_source_priorities_updated_at
  BEFORE UPDATE ON public.crm_source_priorities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS crm_match_aliases_updated_at ON public.crm_match_aliases;
CREATE TRIGGER crm_match_aliases_updated_at
  BEFORE UPDATE ON public.crm_match_aliases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS crm_xiaoshouyi_query_catalog_updated_at ON public.crm_xiaoshouyi_query_catalog;
CREATE TRIGGER crm_xiaoshouyi_query_catalog_updated_at
  BEFORE UPDATE ON public.crm_xiaoshouyi_query_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.crm_source_priorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_match_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_xiaoshouyi_query_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage crm source priorities" ON public.crm_source_priorities;
CREATE POLICY "Admins manage crm source priorities"
  ON public.crm_source_priorities
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Admins manage crm match aliases" ON public.crm_match_aliases;
CREATE POLICY "Admins manage crm match aliases"
  ON public.crm_match_aliases
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Admins manage crm xiaoshouyi query catalog" ON public.crm_xiaoshouyi_query_catalog;
CREATE POLICY "Admins manage crm xiaoshouyi query catalog"
  ON public.crm_xiaoshouyi_query_catalog
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

INSERT INTO public.crm_source_priorities (
  source_system,
  label,
  priority,
  trust_tier,
  is_primary,
  read_policy,
  write_policy,
  freshness_window_hours,
  notes,
  metadata
)
VALUES
  ('app_v2', 'ClassIn app CRM', 10, 'authoritative', true, 'read_write_internal', 'internal_app', null, 'Canonical admin CRM tables: partner_accounts, customers, deals, quotes, contracts, receipts.', '{"owner":"admin_crm"}'::jsonb),
  ('xiaoshouyi', 'Xiaoshouyi / eeoCRM', 20, 'high', true, 'read_snapshot', 'approval_queue_only', 24, 'External CRM snapshot is preferred over spreadsheet exports. Writes must pass crm_write_requests approval.', '{"mcp_policy":"inspect_only_for_personal_oauth","server_sync":"service_credential"}'::jsonb),
  ('lead', 'Inbound leads', 30, 'high', true, 'read_intake', 'convert_v2', 24, 'Lead intake is linked into CRM before spreadsheet reconciliation.', '{"matching":"name_org_owner_alias"}'::jsonb),
  ('branch_rev_sheet', 'Branch REV sheet', 80, 'supporting', false, 'read_compare_only', 'disabled', 48, 'Spreadsheet data is supporting comparison data and must not override CRM truth automatically.', '{"exclude_from_revenue_rollup":true}'::jsonb),
  ('legacy_partner', 'Legacy partner tables', 90, 'legacy', false, 'read_migration_reference', 'disabled', null, 'Legacy tables remain available for migration and duplicate preflight only.', '{"migration_only":true}'::jsonb)
ON CONFLICT (source_system) DO UPDATE SET
  label = EXCLUDED.label,
  priority = EXCLUDED.priority,
  trust_tier = EXCLUDED.trust_tier,
  is_primary = EXCLUDED.is_primary,
  read_policy = EXCLUDED.read_policy,
  write_policy = EXCLUDED.write_policy,
  freshness_window_hours = EXCLUDED.freshness_window_hours,
  notes = EXCLUDED.notes,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO public.crm_xiaoshouyi_query_catalog (
  object_api_key,
  fields,
  order_by,
  page_size,
  max_pages,
  sync_priority,
  notes,
  metadata
)
VALUES
  ('account', ARRAY['id', 'accountName', 'ownerId', 'entityType', 'phone', 'createdAt', 'updatedAt'], 'updatedAt DESC', 100, 20, 10, 'Account/company master data.', '{"displayNameFields":["accountName","name"],"ownerFields":["ownerName","ownerId-label","ownerId"],"statusFields":["status","entityType-label","entityType"],"occurredAtFields":["updatedAt","createdAt"]}'::jsonb),
  ('contact', ARRAY['id', 'contactName', 'mobile', 'accountId', 'ownerId', 'createdAt', 'updatedAt'], 'updatedAt DESC', 100, 20, 20, 'Contacts linked to account records.', '{"displayNameFields":["contactName","name"],"ownerFields":["ownerName","ownerId-label","ownerId"],"occurredAtFields":["updatedAt","createdAt"]}'::jsonb),
  ('opportunity', ARRAY['id', 'opportunityName', 'money', 'ownerId', 'accountId', 'saleStageId', 'closeDate', 'createdAt', 'updatedAt'], 'updatedAt DESC', 100, 20, 30, 'Opportunity/pipeline records.', '{"displayNameFields":["opportunityName","name"],"ownerFields":["ownerName","ownerId-label","ownerId"],"statusFields":["saleStageId-label","saleStageId","status"],"amountFields":["money","amount"],"occurredAtFields":["closeDate","updatedAt","createdAt"]}'::jsonb),
  ('ShroffAccount__c', ARRAY['id', 'name', 'uid__c', 'schoolName__c', 'Account__c', 'expireTime__c', 'currency__c', 'CurrencyAmount__c', 'PersonHourMargin__c', 'serviceState__c', 'ServiceStatus__c', 'LastClassDate__c', 'createdAt', 'updatedAt'], 'updatedAt DESC', 100, 20, 40, 'Service account/subscription object.', '{"displayNameFields":["schoolName__c","name","uid__c"],"statusFields":["ServiceStatus__c","serviceState__c"],"amountFields":["CurrencyAmount__c","currency__c"],"occurredAtFields":["expireTime__c","LastClassDate__c","updatedAt","createdAt"]}'::jsonb),
  ('Collection__c', ARRAY['id', 'name', 'ownerId', 'Amount__c', 'ActualTime__c', 'CollectionDate__c', 'approvalStatus', 'Contract__c', 'orderAccountId__c', 'createdAt', 'updatedAt'], 'updatedAt DESC', 100, 20, 50, 'Collection/payment records.', '{"displayNameFields":["name"],"ownerFields":["ownerName","ownerId-label","ownerId"],"statusFields":["approvalStatus-label","approvalStatus"],"amountFields":["Amount__c"],"occurredAtFields":["ActualTime__c","CollectionDate__c","updatedAt","createdAt"]}'::jsonb),
  ('SalesPerformance__c', ARRAY['id', 'name', 'amount_Collected__c', 'GetDate__c', 'type__c', 'product_famliy__c', 'new_or_addon__c', 'Account__c', 'ShroffAccount__c', 'IsCheckedOver__c', 'AccountGet__c', 'ownerId', 'createdAt', 'updatedAt'], 'updatedAt DESC', 100, 20, 60, 'Sales performance/payment attribution records.', '{"displayNameFields":["name","Account__c-label","ShroffAccount__c-label"],"ownerFields":["ownerName","ownerId-label","ownerId"],"statusFields":["type__c-label","type__c","new_or_addon__c-label","new_or_addon__c"],"amountFields":["amount_Collected__c"],"occurredAtFields":["GetDate__c","updatedAt","createdAt"]}'::jsonb),
  ('CollectionPlan__c', ARRAY['id', 'name', 'EstimatedTime__c', 'collectStatus__c', 'Amount__c', 'accountId', 'ownerId', 'createdAt', 'updatedAt'], 'updatedAt DESC', 100, 20, 70, 'Planned collection records.', '{"displayNameFields":["name","accountId-label"],"ownerFields":["ownerName","ownerId-label","ownerId"],"statusFields":["collectStatus__c-label","collectStatus__c"],"amountFields":["Amount__c"],"occurredAtFields":["EstimatedTime__c","updatedAt","createdAt"]}'::jsonb),
  ('FinancialInformation__c', ARRAY['id', 'ShroffAccInfor__c', 'currency__c', 'AmountReal__c', 'GetDate__c', 'orderType__c', 'PaymentType__c', 'orderId__c', 'ServiceVersion__c', 'newType__c', 'refunded__c', 'createdAt', 'updatedAt'], 'updatedAt DESC', 100, 20, 80, 'Financial transaction detail records.', '{"displayNameFields":["ShroffAccInfor__c-label","orderId__c"],"statusFields":["orderType__c-label","orderType__c","PaymentType__c-label","PaymentType__c"],"amountFields":["AmountReal__c","currency__c"],"occurredAtFields":["GetDate__c","updatedAt","createdAt"]}'::jsonb),
  ('ResourceInformation__c', ARRAY['id', 'ShroffAccount__c', 'ChangeType__c', 'ChangeCause__c', 'ChangeDetail__c', 'ChangeNumber__c', 'ChangeTime__c', 'Margin__c', 'ServiceType__c', 'Amount__c', 'createdAt', 'updatedAt'], 'updatedAt DESC', 100, 20, 90, 'Service/resource usage and change records.', '{"displayNameFields":["ShroffAccount__c-label","ChangeDetail__c"],"statusFields":["ChangeType__c-label","ChangeType__c","ServiceType__c-label"],"amountFields":["Amount__c","ChangeNumber__c"],"occurredAtFields":["ChangeTime__c","updatedAt","createdAt"]}'::jsonb)
ON CONFLICT (object_api_key) DO UPDATE SET
  fields = EXCLUDED.fields,
  order_by = EXCLUDED.order_by,
  page_size = EXCLUDED.page_size,
  max_pages = EXCLUDED.max_pages,
  sync_priority = EXCLUDED.sync_priority,
  notes = EXCLUDED.notes,
  metadata = EXCLUDED.metadata,
  updated_at = now();

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
