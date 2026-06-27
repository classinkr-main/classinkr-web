-- Premium content domain: content catalog, user entitlements, and access audit events.
-- Runtime access is routed through server handlers using the service role.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.premium_content_items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text,
  content_type text not null check (content_type in ('article', 'video', 'file', 'link')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  required_tier text not null default 'premium',
  storage_bucket text,
  storage_path text,
  external_url text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists premium_content_items_updated_at on public.premium_content_items;
create trigger premium_content_items_updated_at
  before update on public.premium_content_items
  for each row execute function public.update_updated_at();

create index if not exists premium_content_items_status_published_idx
  on public.premium_content_items (status, published_at desc);

create table if not exists public.premium_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tier text not null default 'premium',
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  source text not null default 'manual',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  granted_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists premium_entitlements_updated_at on public.premium_entitlements;
create trigger premium_entitlements_updated_at
  before update on public.premium_entitlements
  for each row execute function public.update_updated_at();

create index if not exists premium_entitlements_user_status_tier_idx
  on public.premium_entitlements (user_id, status, tier);

create index if not exists premium_entitlements_ends_at_idx
  on public.premium_entitlements (ends_at)
  where ends_at is not null;

create table if not exists public.premium_access_events (
  id uuid primary key default gen_random_uuid(),
  content_id uuid references public.premium_content_items(id) on delete set null,
  content_slug text,
  user_id uuid references auth.users(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  anonymous_id text,
  action text not null check (action in ('view_attempt', 'view_allowed', 'view_denied', 'download_issued', 'login_prompt')),
  reason text,
  provider text,
  page text,
  referrer text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists premium_access_events_slug_created_idx
  on public.premium_access_events (content_slug, created_at desc)
  where content_slug is not null;

create index if not exists premium_access_events_user_created_idx
  on public.premium_access_events (user_id, created_at desc)
  where user_id is not null;

create index if not exists premium_access_events_anonymous_created_idx
  on public.premium_access_events (anonymous_id, created_at desc)
  where anonymous_id is not null;

alter table public.premium_content_items enable row level security;
alter table public.premium_entitlements enable row level security;
alter table public.premium_access_events enable row level security;

drop policy if exists "Service role manage premium content items" on public.premium_content_items;
create policy "Service role manage premium content items"
  on public.premium_content_items for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role manage premium entitlements" on public.premium_entitlements;
create policy "Service role manage premium entitlements"
  on public.premium_entitlements for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role manage premium access events" on public.premium_access_events;
create policy "Service role manage premium access events"
  on public.premium_access_events for all
  to service_role
  using (true)
  with check (true);

comment on table public.premium_content_items is 'Separately managed premium content catalog.';
comment on table public.premium_entitlements is 'Premium access grants for public authenticated users.';
comment on table public.premium_access_events is 'Server-side audit trail for premium access decisions and download issuance.';

notify pgrst, 'reload schema';
