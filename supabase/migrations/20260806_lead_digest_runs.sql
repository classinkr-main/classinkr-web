-- Daily lead digest execution state.
--
-- Meta and homepage morning cards share one Vercel cron. Each card owns a
-- separate row so a partial failure can be retried without re-sending the
-- card that already succeeded.

CREATE TABLE IF NOT EXISTS public.lead_digest_runs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type           TEXT NOT NULL CHECK (report_type IN ('meta', 'homepage')),
  window_start          TIMESTAMPTZ NOT NULL,
  window_end            TIMESTAMPTZ NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'sent', 'failed')),
  attempt_count         INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  notification_event_id UUID REFERENCES public.notification_events(id) ON DELETE SET NULL,
  last_error            TEXT,
  claimed_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT lead_digest_runs_window_check CHECK (window_end > window_start),
  CONSTRAINT lead_digest_runs_unique_window UNIQUE (report_type, window_end)
);

CREATE INDEX IF NOT EXISTS lead_digest_runs_status_idx
  ON public.lead_digest_runs (status, window_end DESC);

DROP TRIGGER IF EXISTS lead_digest_runs_updated_at ON public.lead_digest_runs;
CREATE TRIGGER lead_digest_runs_updated_at
  BEFORE UPDATE ON public.lead_digest_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- No client policy: the service-role notification pipeline is the only writer.
ALTER TABLE public.lead_digest_runs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.lead_digest_runs IS
  'Meta/homepage 10:10 KST lead digest execution and deduplication state.';
