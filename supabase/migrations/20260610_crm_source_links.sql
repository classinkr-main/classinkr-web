-- CRM identity/link layer.
-- Connects source records from leads, REV sheet rows, legacy CRM, and external CRM
-- snapshots to canonical app records without mixing unverified revenue.

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
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_source_links_unique_candidate
    UNIQUE (source_system, source_object, source_record_key, target_type, target_id)
);

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
