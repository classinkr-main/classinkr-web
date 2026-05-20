-- Route client event writes through /api/track/event so rate limits and
-- payload sanitization cannot be bypassed with the public Supabase key.

do $$
begin
  if to_regclass('public.client_events') is not null then
    drop policy if exists "Anon can insert client events" on public.client_events;
    revoke insert on public.client_events from anon, authenticated;
  end if;
end $$;
