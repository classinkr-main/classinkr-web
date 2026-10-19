-- 로컬 검증용 스텁 — 실 DB 구조 중 이 설계가 닿는 부분만(합성). 운영 DB 와 연결하지 않는다.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;
-- Supabase 의 service_role 은 BYPASSRLS 다(어드민 앱 경로). 어드민 저장소 이식 때 추가 — 60-migration-conventions.sql C4 가 이 속성에 기대 RLS 켠 표를 읽는다.
alter role service_role bypassrls;
create schema crm;

create or replace function public.update_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- Compass crm (필요한 컬럼만)
create table crm.leads (
  id serial primary key,
  name text, phone text, email text, academy text, region text,
  stage text not null default 'new', meta_ad_id text, last_ad_id text, source_tab text, platform text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  last_inflow_at timestamptz,
  phone_key text generated always as (nullif(regexp_replace(regexp_replace(regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g'), '^0082', '82'), '^82', '0'), '')) stored
);
create table crm.meta_webhook_events (leadgen_id text primary key, received_at timestamptz not null default now());
create table crm.meta_leadgen_failures (
  leadgen_id text primary key, error_code int, error_subcode int, message text, page_id text, form_id text,
  lead_specific boolean not null default false, first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(), attempts int not null default 1);
create table crm.lead_refs (
  id bigserial primary key, lead_id integer not null references crm.leads(id) on delete cascade,
  system text not null, external_id text not null, matched_by text not null, created_by text,
  created_at timestamptz not null default now());
create unique index lead_refs_one_owner_uidx on crm.lead_refs(system, external_id) where system in ('home_lead','meta_leadgen','channel_conv');

-- 어드민 public.leads (20260614 기본 + 이후 추가 컬럼)
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  source text not null, name text, org text, role text, size text, email text, phone text, message text, branch text,
  status text not null default 'new' check (status in ('new','contacted','converted','closed')),
  notes text, source_detail text, lead_magnet text, follow_up_at timestamptz, assigned_to text,
  utm_source text, utm_medium text, utm_campaign text, utm_term text, utm_content text,
  gclid text, fbclid text, msclkid text, ttclid text, landing_page text, current_page text, referrer text,
  confirmed_at timestamptz, anonymous_id text, last_inflow_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create trigger leads_updated_at before update on public.leads for each row execute function public.update_updated_at();

-- 기존 브리지(20260828/20260902) 중 쓰는 컬럼만
create view public.compass_leads_v as
  select l.id, l.academy, l.name, l.phone_key, lower(nullif(trim(l.email), '')) as email_key, l.stage, l.region,
         l.platform, l.meta_ad_id, l.source_tab, l.created_at, l.updated_at, l.last_inflow_at
  from crm.leads l;
create view public.compass_lead_refs_v as
  select lead_id, system, external_id, matched_by, created_at from crm.lead_refs;
-- 20260828/20260914 와 같은 권한
revoke all on public.compass_leads_v, public.compass_lead_refs_v from anon, authenticated;
grant select on public.compass_leads_v, public.compass_lead_refs_v to service_role;
-- Supabase 기본: service_role 은 public 테이블 전권(기본 권한)
grant usage on schema public to service_role;
grant all on public.leads to service_role;

-- FINAL 추가: Compass 쪽 기존 테이블(sync_state) + Compass 접속 역할 흉내(운영은 postgres 롤)
create table crm.sync_state (key text primary key, hash text, updated_at timestamptz not null default now());
do $$ begin
  if not exists (select 1 from pg_roles where rolname='compass_app') then create role compass_app nologin; end if;
end $$;
grant usage on schema crm, public to compass_app;
grant select, insert, update, delete on all tables in schema crm to compass_app;
alter default privileges in schema crm grant select, insert, update, delete on tables to compass_app;
