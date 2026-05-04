-- Add draft/published control for public event pages.
-- Existing rows stay published; new rows default to draft unless the admin UI
-- explicitly publishes them.

ALTER TABLE public.public_events
  ADD COLUMN IF NOT EXISTS publication_status text;

UPDATE public.public_events
SET publication_status = 'published'
WHERE publication_status IS NULL;

ALTER TABLE public.public_events
  ALTER COLUMN publication_status SET DEFAULT 'draft',
  ALTER COLUMN publication_status SET NOT NULL;

ALTER TABLE public.public_events
  DROP CONSTRAINT IF EXISTS public_events_publication_status_check;

ALTER TABLE public.public_events
  ADD CONSTRAINT public_events_publication_status_check
  CHECK (publication_status IN ('draft', 'published'));

CREATE INDEX IF NOT EXISTS public_events_publication_status_starts_idx
  ON public.public_events (publication_status, starts_at DESC);
