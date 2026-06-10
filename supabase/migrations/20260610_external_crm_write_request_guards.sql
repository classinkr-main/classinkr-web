-- Guard external CRM write requests at the database boundary too. The admin API
-- performs the detailed Xiaoshouyi object/field allowlist checks; these generic
-- checks keep persisted requests structurally safe if another backend path is
-- added later.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.crm_write_requests'::regclass
      AND conname = 'crm_write_requests_payload_object_chk'
  ) THEN
    ALTER TABLE public.crm_write_requests
      ADD CONSTRAINT crm_write_requests_payload_object_chk
        CHECK (jsonb_typeof(payload) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.crm_write_requests'::regclass
      AND conname = 'crm_write_requests_preview_object_chk'
  ) THEN
    ALTER TABLE public.crm_write_requests
      ADD CONSTRAINT crm_write_requests_preview_object_chk
        CHECK (preview_payload IS NULL OR jsonb_typeof(preview_payload) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.crm_write_requests'::regclass
      AND conname = 'crm_write_requests_response_object_chk'
  ) THEN
    ALTER TABLE public.crm_write_requests
      ADD CONSTRAINT crm_write_requests_response_object_chk
        CHECK (response_payload IS NULL OR jsonb_typeof(response_payload) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
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
END $$;
