-- Admin Partners Ops Schema
-- 기준 시점: 2026-04-03
-- 용도: /admin/partners MVP를 Supabase/Postgres 위에 올리기 위한 초안

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

do $$
begin
  create type public.partner_status as enum ('lead', 'active', 'paused', 'churn_risk');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.partner_channel as enum ('reseller', 'referral', 'branch', 'direct');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.deal_stage as enum ('discovery', 'quoted', 'contract_sent', 'active', 'closed_won', 'closed_lost');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.document_kind as enum ('quote', 'contract', 'receipt');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.document_status as enum ('draft', 'sent', 'signed', 'paid', 'overdue', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.document_delivery_channel as enum ('pdf', 'kakao', 'link');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.document_access_scope as enum ('internal', 'partner', 'public_link');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.document_delivery_status as enum ('draft', 'ready', 'sent', 'opened', 'expired', 'revoked', 'failed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.document_access_event_type as enum (
    'created',
    'sent',
    'opened',
    'downloaded',
    'password_failed',
    'expired',
    'revoked',
    'kakao_sent',
    'kakao_failed'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.partner_activity_log_category as enum (
    'customer_touchpoint',
    'quote_commercial',
    'contract',
    'installation',
    'settlement_revenue',
    'operations_internal'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.partner_activity_log_status as enum (
    'recorded',
    'follow_up_needed',
    'waiting_partner',
    'waiting_internal',
    'blocked',
    'resolved',
    'canceled'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.partner_ops_todo_status as enum (
    'open',
    'waiting_partner',
    'waiting_internal',
    'blocked',
    'done',
    'canceled'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.partner_install_status as enum (
    'planned',
    'ordered',
    'delivered',
    'installed',
    'verified',
    'issue'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.partner_issue_status as enum (
    'open',
    'waiting_confirmation',
    'blocked',
    'resolved',
    'dropped'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.partner_issue_severity as enum (
    'low',
    'medium',
    'high',
    'critical'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.partner_schedule_kind as enum ('meeting', 'follow_up', 'deadline', 'renewal');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.partner_schedule_status as enum ('planned', 'completed', 'canceled');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.automation_status as enum ('active', 'paused');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  status public.partner_status not null default 'lead',
  channel public.partner_channel not null default 'direct',
  region text,
  owner_name text,
  owner_email text,
  owner_phone text,
  account_manager_id uuid,
  account_manager_name text,
  portal_enabled boolean not null default false,
  portal_slug text,
  tags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz
);

create unique index if not exists partners_code_key on public.partners (code);
create unique index if not exists partners_portal_slug_key on public.partners (portal_slug) where portal_slug is not null;
create index if not exists partners_status_idx on public.partners (status);
create index if not exists partners_account_manager_idx on public.partners (account_manager_id);

create table if not exists public.partner_contacts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  name text not null,
  role text,
  email text,
  phone text,
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists partner_contacts_partner_idx on public.partner_contacts (partner_id);

create table if not exists public.partner_deals (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  title text not null,
  stage public.deal_stage not null default 'discovery',
  quote_amount numeric(14, 2) not null default 0,
  currency text not null default 'KRW',
  expected_close_at date,
  contract_signed_at date,
  contract_start_at date,
  contract_end_at date,
  sales_units integer not null default 0,
  payment_terms text,
  owner_id uuid,
  owner_name text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  closed_at timestamptz
);

create index if not exists partner_deals_partner_idx on public.partner_deals (partner_id);
create index if not exists partner_deals_stage_idx on public.partner_deals (stage);
create index if not exists partner_deals_expected_close_idx on public.partner_deals (expected_close_at);

create table if not exists public.partner_documents (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  deal_id uuid references public.partner_deals(id) on delete set null,
  kind public.document_kind not null,
  status public.document_status not null default 'draft',
  title text not null,
  document_number text,
  source_file_name text,
  file_path text,
  external_url text,
  storage_bucket text,
  storage_object_path text,
  file_mime_type text,
  file_size_bytes bigint,
  page_count integer,
  amount numeric(14, 2),
  currency text not null default 'KRW',
  version integer not null default 1,
  issued_at date,
  due_at date,
  signed_at date,
  paid_at date,
  settlement_period_start date,
  settlement_period_end date,
  external_view_enabled boolean not null default false,
  default_delivery_channel public.document_delivery_channel not null default 'link',
  default_access_scope public.document_access_scope not null default 'partner',
  default_expires_at timestamptz,
  default_password_enabled boolean not null default false,
  default_password_hint text,
  allow_download boolean not null default true,
  allow_print boolean not null default true,
  watermark_text text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz
);

create index if not exists partner_documents_partner_idx on public.partner_documents (partner_id);
create index if not exists partner_documents_deal_idx on public.partner_documents (deal_id);
create index if not exists partner_documents_kind_idx on public.partner_documents (kind);
create index if not exists partner_documents_status_idx on public.partner_documents (status);
create index if not exists partner_documents_due_idx on public.partner_documents (due_at);
create index if not exists partner_documents_document_number_idx on public.partner_documents (document_number);
create index if not exists partner_documents_external_view_idx on public.partner_documents (external_view_enabled);

create table if not exists public.partner_document_deliveries (
  id uuid primary key default gen_random_uuid(),
  partner_document_id uuid not null references public.partner_documents(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete cascade,
  deal_id uuid references public.partner_deals(id) on delete set null,
  recipient_contact_id uuid references public.partner_contacts(id) on delete set null,
  delivery_channel public.document_delivery_channel not null default 'link',
  access_scope public.document_access_scope not null default 'partner',
  status public.document_delivery_status not null default 'draft',
  recipient_name text,
  recipient_email text,
  recipient_phone text,
  kakao_template_code text,
  kakao_message_id text,
  share_token uuid not null default gen_random_uuid(),
  share_slug text,
  short_url text,
  expires_at timestamptz,
  password_enabled boolean not null default false,
  password_hash text,
  password_hint text,
  max_view_count integer,
  allow_download boolean not null default true,
  allow_print boolean not null default true,
  watermark_text text,
  sent_at timestamptz,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer not null default 0,
  download_count integer not null default 0,
  revoked_at timestamptz,
  revoke_reason text,
  created_by_id uuid,
  created_by_name text,
  created_by_role text,
  channel_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists partner_document_deliveries_share_token_key
  on public.partner_document_deliveries (share_token);
create unique index if not exists partner_document_deliveries_share_slug_key
  on public.partner_document_deliveries (share_slug) where share_slug is not null;
create index if not exists partner_document_deliveries_document_idx on public.partner_document_deliveries (partner_document_id);
create index if not exists partner_document_deliveries_partner_idx on public.partner_document_deliveries (partner_id);
create index if not exists partner_document_deliveries_status_idx on public.partner_document_deliveries (status);
create index if not exists partner_document_deliveries_expires_idx on public.partner_document_deliveries (expires_at);
create index if not exists partner_document_deliveries_channel_idx on public.partner_document_deliveries (delivery_channel);

create table if not exists public.partner_document_access_logs (
  id uuid primary key default gen_random_uuid(),
  partner_document_id uuid not null references public.partner_documents(id) on delete cascade,
  delivery_id uuid references public.partner_document_deliveries(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete cascade,
  deal_id uuid references public.partner_deals(id) on delete set null,
  event_type public.document_access_event_type not null,
  actor_type text not null,
  actor_id uuid,
  actor_name text,
  actor_role text,
  ip_address inet,
  user_agent text,
  referrer text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists partner_document_access_logs_document_idx
  on public.partner_document_access_logs (partner_document_id, created_at desc);
create index if not exists partner_document_access_logs_delivery_idx
  on public.partner_document_access_logs (delivery_id, created_at desc);
create index if not exists partner_document_access_logs_partner_idx
  on public.partner_document_access_logs (partner_id, created_at desc);

create table if not exists public.partner_schedule_items (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  deal_id uuid references public.partner_deals(id) on delete set null,
  kind public.partner_schedule_kind not null,
  status public.partner_schedule_status not null default 'planned',
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  owner_id uuid,
  owner_name text,
  sync_to_admin_calendar boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create index if not exists partner_schedule_partner_idx on public.partner_schedule_items (partner_id);
create index if not exists partner_schedule_deal_idx on public.partner_schedule_items (deal_id);
create index if not exists partner_schedule_starts_at_idx on public.partner_schedule_items (starts_at);
create index if not exists partner_schedule_status_idx on public.partner_schedule_items (status);

create table if not exists public.partner_ops_checklist_items (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  deal_id uuid references public.partner_deals(id) on delete set null,
  parent_item_id uuid references public.partner_ops_checklist_items(id) on delete cascade,
  checklist_group text not null,
  template_key text,
  title text not null,
  item_category text,
  item_code text,
  item_name text,
  planned_quantity integer,
  confirmed_quantity integer,
  todo_status public.partner_ops_todo_status not null default 'open',
  install_status public.partner_install_status not null default 'planned',
  owner_id uuid,
  owner_name text,
  due_at timestamptz,
  confirmed_at timestamptz,
  completed_at timestamptz,
  sort_order integer not null default 0,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists partner_ops_checklist_partner_idx
  on public.partner_ops_checklist_items (partner_id, todo_status);
create index if not exists partner_ops_checklist_deal_idx
  on public.partner_ops_checklist_items (deal_id, install_status);
create index if not exists partner_ops_checklist_due_idx
  on public.partner_ops_checklist_items (due_at);
create index if not exists partner_ops_checklist_group_idx
  on public.partner_ops_checklist_items (partner_id, checklist_group);

create table if not exists public.partner_sales_records (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  deal_id uuid references public.partner_deals(id) on delete set null,
  sales_month date not null,
  units_sold integer not null default 0,
  gross_amount numeric(14, 2) not null default 0,
  net_amount numeric(14, 2) not null default 0,
  source text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists partner_sales_month_unique
  on public.partner_sales_records (partner_id, deal_id, sales_month);
create index if not exists partner_sales_partner_idx on public.partner_sales_records (partner_id);
create index if not exists partner_sales_month_idx on public.partner_sales_records (sales_month);

create table if not exists public.partner_document_sales_links (
  id uuid primary key default gen_random_uuid(),
  partner_document_id uuid not null references public.partner_documents(id) on delete cascade,
  partner_sales_record_id uuid not null references public.partner_sales_records(id) on delete cascade,
  allocated_units integer,
  allocated_gross_amount numeric(14, 2),
  allocated_net_amount numeric(14, 2),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists partner_document_sales_link_unique
  on public.partner_document_sales_links (partner_document_id, partner_sales_record_id);
create index if not exists partner_document_sales_links_document_idx
  on public.partner_document_sales_links (partner_document_id);
create index if not exists partner_document_sales_links_sales_idx
  on public.partner_document_sales_links (partner_sales_record_id);

create table if not exists public.partner_automations (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  deal_id uuid references public.partner_deals(id) on delete set null,
  name text not null,
  status public.automation_status not null default 'active',
  trigger_type text not null,
  action_type text not null,
  destination text,
  config jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists partner_automations_partner_idx on public.partner_automations (partner_id);
create index if not exists partner_automations_status_idx on public.partner_automations (status);
create index if not exists partner_automations_next_run_idx on public.partner_automations (next_run_at);

create table if not exists public.partner_ops_issues (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  deal_id uuid references public.partner_deals(id) on delete set null,
  related_document_id uuid references public.partner_documents(id) on delete set null,
  related_checklist_item_id uuid references public.partner_ops_checklist_items(id) on delete set null,
  title text not null,
  category text not null,
  severity public.partner_issue_severity not null default 'medium',
  status public.partner_issue_status not null default 'open',
  facts text,
  unresolved_points text,
  current_assumption text,
  verify_with text,
  owner_id uuid,
  owner_name text,
  next_check_at timestamptz,
  due_at timestamptz,
  resolved_at timestamptz,
  resolution_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists partner_ops_issues_partner_idx
  on public.partner_ops_issues (partner_id, status, severity);
create index if not exists partner_ops_issues_deal_idx
  on public.partner_ops_issues (deal_id, status);
create index if not exists partner_ops_issues_next_check_idx
  on public.partner_ops_issues (next_check_at);

create table if not exists public.partner_activity_logs (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  deal_id uuid references public.partner_deals(id) on delete set null,
  document_id uuid references public.partner_documents(id) on delete set null,
  schedule_item_id uuid references public.partner_schedule_items(id) on delete set null,
  sales_record_id uuid references public.partner_sales_records(id) on delete set null,
  checklist_item_id uuid references public.partner_ops_checklist_items(id) on delete set null,
  issue_id uuid references public.partner_ops_issues(id) on delete set null,
  subject_type text not null default 'partner',
  subject_id uuid,
  log_category public.partner_activity_log_category not null default 'operations_internal',
  status public.partner_activity_log_status not null default 'recorded',
  actor_id uuid,
  actor_name text,
  actor_role text,
  action text not null,
  summary text not null,
  details text,
  next_action text,
  due_at timestamptz,
  occurred_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists partner_activity_partner_idx on public.partner_activity_logs (partner_id);
create index if not exists partner_activity_created_at_idx on public.partner_activity_logs (created_at desc);
create index if not exists partner_activity_occurred_at_idx on public.partner_activity_logs (occurred_at desc);
create index if not exists partner_activity_issue_idx on public.partner_activity_logs (issue_id, occurred_at desc);
create index if not exists partner_activity_document_idx on public.partner_activity_logs (document_id, occurred_at desc);
create index if not exists partner_activity_checklist_idx on public.partner_activity_logs (checklist_item_id, occurred_at desc);

drop trigger if exists partners_set_updated_at on public.partners;
create trigger partners_set_updated_at
before update on public.partners
for each row execute function public.set_updated_at();

drop trigger if exists partner_contacts_set_updated_at on public.partner_contacts;
create trigger partner_contacts_set_updated_at
before update on public.partner_contacts
for each row execute function public.set_updated_at();

drop trigger if exists partner_deals_set_updated_at on public.partner_deals;
create trigger partner_deals_set_updated_at
before update on public.partner_deals
for each row execute function public.set_updated_at();

drop trigger if exists partner_documents_set_updated_at on public.partner_documents;
create trigger partner_documents_set_updated_at
before update on public.partner_documents
for each row execute function public.set_updated_at();

drop trigger if exists partner_document_deliveries_set_updated_at on public.partner_document_deliveries;
create trigger partner_document_deliveries_set_updated_at
before update on public.partner_document_deliveries
for each row execute function public.set_updated_at();

drop trigger if exists partner_schedule_items_set_updated_at on public.partner_schedule_items;
create trigger partner_schedule_items_set_updated_at
before update on public.partner_schedule_items
for each row execute function public.set_updated_at();

drop trigger if exists partner_ops_checklist_items_set_updated_at on public.partner_ops_checklist_items;
create trigger partner_ops_checklist_items_set_updated_at
before update on public.partner_ops_checklist_items
for each row execute function public.set_updated_at();

drop trigger if exists partner_sales_records_set_updated_at on public.partner_sales_records;
create trigger partner_sales_records_set_updated_at
before update on public.partner_sales_records
for each row execute function public.set_updated_at();

drop trigger if exists partner_automations_set_updated_at on public.partner_automations;
create trigger partner_automations_set_updated_at
before update on public.partner_automations
for each row execute function public.set_updated_at();

drop trigger if exists partner_ops_issues_set_updated_at on public.partner_ops_issues;
create trigger partner_ops_issues_set_updated_at
before update on public.partner_ops_issues
for each row execute function public.set_updated_at();
