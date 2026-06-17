-- Hardening pass for public material download identity tables.
--
-- Safe to run after 20260615_public_material_downloads.sql even when that
-- migration was already applied before these policies/indexes/comments existed.

create unique index if not exists user_profiles_provider_unique_idx
  on public.user_profiles (provider, provider_id)
  where provider is not null and provider_id is not null;

create index if not exists client_events_session_id_idx
  on public.client_events (session_id, created_at desc)
  where session_id is not null;

alter table public.user_profiles enable row level security;
alter table public.material_downloads enable row level security;

drop policy if exists "Service role manage user profiles" on public.user_profiles;
create policy "Service role manage user profiles"
  on public.user_profiles for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role manage material downloads" on public.material_downloads;
create policy "Service role manage material downloads"
  on public.material_downloads for all
  to service_role
  using (true)
  with check (true);

comment on table public.user_profiles is 'Public visitor login profile linked to Supabase auth, provider identity, and the latest matching lead.';
comment on column public.user_profiles.lead_id is 'Latest CRM lead matched by email or explicit identity stitching.';
comment on table public.material_downloads is 'Audit trail for lead magnet and material downloads, including gate type and stitched visitor identifiers.';
comment on column public.material_downloads.destination_url is 'Signed storage URL or local resource fallback issued at download time.';
comment on column public.client_events.anonymous_id is 'First-party anonymous visitor id from the consent-gated cln_aid cookie.';
comment on column public.client_events.lead_id is 'CRM lead connected after form submission or public login identity stitching.';
comment on column public.client_events.user_id is 'Supabase auth user id when the visitor is logged in.';
comment on column public.client_events.session_id is 'Optional product/session identifier for future event grouping.';

notify pgrst, 'reload schema';
