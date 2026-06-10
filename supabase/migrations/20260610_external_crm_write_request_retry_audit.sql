-- Add explicit retry state and durable audit events for external CRM write-back.
-- The app still requires an approved request before any Xiaoshouyi POST/PATCH;
-- these fields make failed execution recoverable and reviewable.

ALTER TABLE public.crm_write_requests
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_attempt_error TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.crm_write_requests'::regclass
      AND conname = 'crm_write_requests_attempt_count_chk'
  ) THEN
    ALTER TABLE public.crm_write_requests
      ADD CONSTRAINT crm_write_requests_attempt_count_chk CHECK (attempt_count >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS crm_write_requests_retry_idx
  ON public.crm_write_requests (status, next_retry_at, updated_at DESC)
  WHERE status = 'failed';

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

CREATE INDEX IF NOT EXISTS crm_write_request_events_request_idx
  ON public.crm_write_request_events (write_request_id, created_at DESC);

ALTER TABLE public.crm_write_request_events ENABLE ROW LEVEL SECURITY;

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
