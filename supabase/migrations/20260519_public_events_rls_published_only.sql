-- Ensure anon/public Supabase reads cannot see draft public_events rows.
-- Server-side admin clients use the service role and bypass RLS for editorial work.

DROP POLICY IF EXISTS "Anyone can view public events"
  ON public.public_events;

DROP POLICY IF EXISTS "Anyone can view published public events"
  ON public.public_events;

CREATE POLICY "Anyone can view published public events"
  ON public.public_events
  FOR SELECT
  USING (publication_status = 'published');
