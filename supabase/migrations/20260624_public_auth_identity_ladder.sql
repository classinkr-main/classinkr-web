-- Public auth identity ladder: link verified logins to CRM leads and audit every stitch.
--
-- Why this exists:
-- - Public (non-admin) login is the entitlement for login-gated lead magnets (D1).
-- - Post-login we deterministically associate ALL leads matching a verified email to the
--   Supabase auth user, so a logged-in visitor resumes gated downloads without re-gating (D5).
-- - leads.user_id is the join anchor; user_profiles.account_ref is reserved for a future
--   accounts spine (no FK yet — the accounts table does not exist).
-- - identity_stitch_logs is the best-effort audit trail for each stitch (mirrors consent_logs).
--
-- Runtime access is routed through server handlers using the service role (RLS deny-all by default).
-- This file is idempotent and safe to run against an existing environment.

create extension if not exists pgcrypto with schema extensions;

-- ─── leads.user_id (verified-login association anchor) ─────

alter table public.leads
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_leads_user_id
  on public.leads (user_id)
  where user_id is not null;

comment on column public.leads.user_id is 'Supabase auth user associated to this lead via verified-email identity stitching (null until a verified login matches).';

-- ─── user_profiles.account_ref (reserved for future accounts spine) ─────

alter table public.user_profiles
  add column if not exists account_ref uuid;

comment on column public.user_profiles.account_ref is 'Reserved forward reference to a future accounts spine. Nullable with NO FK — the accounts table does not exist yet.';

-- ─── identity_stitch_logs (best-effort audit trail) ─────

create table if not exists public.identity_stitch_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text,
  anonymous_id text,
  lead_ids uuid[],
  action text,
  email_verified boolean,
  created_at timestamptz not null default now()
);

create index if not exists identity_stitch_logs_user_created_idx
  on public.identity_stitch_logs (user_id, created_at desc)
  where user_id is not null;

alter table public.identity_stitch_logs enable row level security;

drop policy if exists "Service role manage identity stitch logs" on public.identity_stitch_logs;
create policy "Service role manage identity stitch logs"
  on public.identity_stitch_logs for all
  to service_role
  using (true)
  with check (true);

comment on table public.identity_stitch_logs is 'Best-effort audit trail of verified-email identity stitches: which leads were associated to which auth user, and whether the email was verified.';

notify pgrst, 'reload schema';
