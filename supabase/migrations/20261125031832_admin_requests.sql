create table public.admin_requests (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null,
  reporter_name text not null,
  kind text not null check (kind in ('bug', 'idea', 'data', 'question')),
  title text not null check (char_length(title) between 1 and 120),
  description text not null check (char_length(description) between 1 and 4000),
  status text not null default 'open' check (status in ('open', 'in-progress', 'resolved', 'closed')),
  screen text check (char_length(screen) <= 240),
  test_version text check (char_length(test_version) <= 64),
  error_code text check (char_length(error_code) <= 80),
  logs text check (char_length(logs) <= 8000),
  capture_mime text check (capture_mime in ('image/png', 'image/jpeg', 'image/webp')),
  capture_data text,
  acknowledged_at timestamptz,
  acknowledged_by text,
  capture_expires_at timestamptz,
  replies jsonb not null default '[]'::jsonb check (jsonb_array_length(replies) <= 30),
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((capture_mime is null) = (capture_data is null)),
  check ((acknowledged_at is null) = (acknowledged_by is null)),
  check (capture_expires_at is null or (
    acknowledged_at is not null and capture_expires_at >= acknowledged_at + interval '168 hours'
  )),
  check (capture_data is null or octet_length(capture_data) between 1 and 2796204)
);

create index admin_requests_created_idx on public.admin_requests (created_at desc, id desc);
create index admin_requests_reporter_created_idx on public.admin_requests (reporter_id, created_at desc, id desc);
create index admin_requests_capture_expiry_idx on public.admin_requests (capture_expires_at)
  where capture_mime is not null and capture_expires_at is not null;

alter table public.admin_requests enable row level security;
revoke all on table public.admin_requests from public, anon, authenticated;
grant select, insert, update on table public.admin_requests to service_role;
