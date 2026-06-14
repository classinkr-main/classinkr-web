-- Alpha base schema reconstruction for admin auth, lead capture, and audit logs.
--
-- Why this exists:
-- - The original admin_profiles / leads / audit_logs base SQL lived in scripts/001-create-tables.sql.
-- - Later migrations and runtime code assume public.is_active_admin(), public.update_updated_at(),
--   admin_profiles, and leads already exist.
-- - blog_posts has its own reconstructed migration: 20260610_blog_posts_backfill_schema.sql.
--
-- This file is idempotent and safe to run against an existing environment.

create extension if not exists pgcrypto with schema extensions;

-- ─── Helpers ──────────────────────────────────────────────

create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_active_admin()
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.admin_profiles
    where user_id = auth.uid()
      and status = 'ACTIVE'
  );
$$;

-- ─── Admin profiles ───────────────────────────────────────

create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null
    check (role in ('SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VIEWER', 'BRANCH', 'PARTNER')),
  status text not null default 'INVITED'
    check (status in ('INVITED', 'ACTIVE', 'SUSPENDED')),
  invited_by uuid references auth.users(id) on delete set null,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.admin_profiles is 'Admin profiles used for role/status checks and public.is_active_admin().';

drop trigger if exists admin_profiles_updated_at on public.admin_profiles;
create trigger admin_profiles_updated_at
  before update on public.admin_profiles
  for each row execute function public.update_updated_at();

create index if not exists idx_admin_profiles_status
  on public.admin_profiles (status);
create index if not exists idx_admin_profiles_role
  on public.admin_profiles (role);

-- ─── Leads ────────────────────────────────────────────────

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  name text,
  org text,
  role text,
  size text,
  email text,
  phone text,
  message text,
  branch text,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'converted', 'closed')),
  notes text,
  source_detail text,
  lead_magnet text,
  follow_up_at timestamptz,
  assigned_to text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  gclid text,
  fbclid text,
  msclkid text,
  ttclid text,
  landing_page text,
  current_page text,
  referrer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.leads is 'Captured website leads with attribution, follow-up, and assignment fields.';

drop trigger if exists leads_updated_at on public.leads;
create trigger leads_updated_at
  before update on public.leads
  for each row execute function public.update_updated_at();

create index if not exists idx_leads_status
  on public.leads (status);
create index if not exists idx_leads_source
  on public.leads (source);
create index if not exists idx_leads_created_at
  on public.leads (created_at desc);
create index if not exists idx_leads_source_detail
  on public.leads (source_detail)
  where source_detail is not null;
create index if not exists idx_leads_lead_magnet
  on public.leads (lead_magnet)
  where lead_magnet is not null;
create index if not exists idx_leads_follow_up_at
  on public.leads (follow_up_at)
  where follow_up_at is not null;
create index if not exists idx_leads_assigned_to
  on public.leads (assigned_to)
  where assigned_to is not null;

-- ─── Audit logs ───────────────────────────────────────────

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  payload jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

comment on table public.audit_logs is 'Admin audit trail for important operational actions.';

create index if not exists idx_audit_logs_actor
  on public.audit_logs (actor_user_id);
create index if not exists idx_audit_logs_action
  on public.audit_logs (action);
create index if not exists idx_audit_logs_created_at
  on public.audit_logs (created_at desc);

-- ─── RLS ─────────────────────────────────────────────────

alter table public.admin_profiles enable row level security;
alter table public.leads enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "Admins can read profiles" on public.admin_profiles;
create policy "Admins can read profiles"
  on public.admin_profiles for select
  using (public.is_active_admin());

drop policy if exists "Users can read own profile" on public.admin_profiles;
create policy "Users can read own profile"
  on public.admin_profiles for select
  using (user_id = auth.uid());

drop policy if exists "Admins update profiles" on public.admin_profiles;
create policy "Admins update profiles"
  on public.admin_profiles for update
  using (public.is_active_admin())
  with check (public.is_active_admin());

drop policy if exists "Service role manage admin profiles" on public.admin_profiles;
create policy "Service role manage admin profiles"
  on public.admin_profiles for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Public can submit leads" on public.leads;
create policy "Public can submit leads"
  on public.leads for insert
  with check (true);

drop policy if exists "Admins read leads" on public.leads;
create policy "Admins read leads"
  on public.leads for select
  using (public.is_active_admin());

drop policy if exists "Admins update leads" on public.leads;
create policy "Admins update leads"
  on public.leads for update
  using (public.is_active_admin())
  with check (public.is_active_admin());

drop policy if exists "Admins delete leads" on public.leads;
create policy "Admins delete leads"
  on public.leads for delete
  using (public.is_active_admin());

drop policy if exists "Service role manage leads" on public.leads;
create policy "Service role manage leads"
  on public.leads for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Admins read audit logs" on public.audit_logs;
create policy "Admins read audit logs"
  on public.audit_logs for select
  using (public.is_active_admin());

drop policy if exists "Service role manage audit logs" on public.audit_logs;
create policy "Service role manage audit logs"
  on public.audit_logs for all
  to service_role
  using (true)
  with check (true);
