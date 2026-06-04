-- Lead response alert dedupe state.
-- Stores one row per alert condition so WeCom reminders do not repeat every scan.

CREATE TABLE IF NOT EXISTS public.lead_alert_states (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope           TEXT NOT NULL CHECK (scope IN ('lead', 'aggregate')),
  subject_id      TEXT NOT NULL,
  alert_key       TEXT NOT NULL,
  last_sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_count      INTEGER,
  metadata_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lead_alert_states_unique_key
    UNIQUE (scope, subject_id, alert_key)
);

CREATE INDEX IF NOT EXISTS idx_lead_alert_states_lookup
  ON public.lead_alert_states (scope, subject_id, alert_key);

CREATE INDEX IF NOT EXISTS idx_lead_alert_states_last_sent
  ON public.lead_alert_states (last_sent_at DESC);

DROP TRIGGER IF EXISTS lead_alert_states_updated_at ON public.lead_alert_states;
CREATE TRIGGER lead_alert_states_updated_at
  BEFORE UPDATE ON public.lead_alert_states
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.lead_alert_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage lead alert states"
  ON public.lead_alert_states
  FOR ALL
  USING (is_active_admin())
  WITH CHECK (is_active_admin());
