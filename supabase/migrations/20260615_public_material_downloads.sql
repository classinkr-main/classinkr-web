-- Public user profiles and gated material download audit trail.
-- Runtime access is routed through server handlers using the service role.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  name text,
  org text,
  role text,
  phone text,
  provider text,
  provider_id text,
  marketing_consent boolean not null default false,
  lead_id uuid references public.leads(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_profiles_provider_unique_idx
  on public.user_profiles (provider, provider_id)
  where provider is not null and provider_id is not null;

create index if not exists user_profiles_lead_id_idx
  on public.user_profiles (lead_id)
  where lead_id is not null;

drop trigger if exists user_profiles_updated_at on public.user_profiles;
create trigger user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.update_updated_at();

alter table public.user_profiles enable row level security;

drop policy if exists "Service role manage user profiles" on public.user_profiles;
create policy "Service role manage user profiles"
  on public.user_profiles for all
  to service_role
  using (true)
  with check (true);

comment on table public.user_profiles is 'Public visitor login profile linked to Supabase auth, provider identity, and the latest matching lead.';
comment on column public.user_profiles.lead_id is 'Latest CRM lead matched by email or explicit identity stitching.';

create table if not exists public.material_downloads (
  id uuid primary key default gen_random_uuid(),
  material_slug text not null,
  user_id uuid references auth.users(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  anonymous_id text,
  gate_type text not null check (gate_type in ('open', 'email', 'login')),
  source text,
  post_slug text,
  destination_url text,
  created_at timestamptz not null default now()
);

create index if not exists material_downloads_material_created_idx
  on public.material_downloads (material_slug, created_at desc);

create index if not exists material_downloads_user_created_idx
  on public.material_downloads (user_id, created_at desc)
  where user_id is not null;

create index if not exists material_downloads_lead_created_idx
  on public.material_downloads (lead_id, created_at desc)
  where lead_id is not null;

create index if not exists material_downloads_anonymous_created_idx
  on public.material_downloads (anonymous_id, created_at desc)
  where anonymous_id is not null;

alter table public.material_downloads enable row level security;

drop policy if exists "Service role manage material downloads" on public.material_downloads;
create policy "Service role manage material downloads"
  on public.material_downloads for all
  to service_role
  using (true)
  with check (true);

comment on table public.material_downloads is 'Audit trail for lead magnet and material downloads, including gate type and stitched visitor identifiers.';
comment on column public.material_downloads.destination_url is 'Signed storage URL or local resource fallback issued at download time.';

alter table public.client_events
  add column if not exists anonymous_id text,
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists session_id text;

create index if not exists client_events_anonymous_id_idx
  on public.client_events (anonymous_id, created_at desc)
  where anonymous_id is not null;

create index if not exists client_events_lead_id_idx
  on public.client_events (lead_id, created_at desc)
  where lead_id is not null;

create index if not exists client_events_user_id_idx
  on public.client_events (user_id, created_at desc)
  where user_id is not null;

create index if not exists client_events_session_id_idx
  on public.client_events (session_id, created_at desc)
  where session_id is not null;

insert into storage.buckets (id, name, public)
values ('materials', 'materials', false)
on conflict (id) do update set public = false;

comment on column public.client_events.anonymous_id is 'First-party anonymous visitor id from the consent-gated cln_aid cookie.';
comment on column public.client_events.lead_id is 'CRM lead connected after form submission or public login identity stitching.';
comment on column public.client_events.user_id is 'Supabase auth user id when the visitor is logged in.';
comment on column public.client_events.session_id is 'Optional product/session identifier for future event grouping.';

notify pgrst, 'reload schema';
