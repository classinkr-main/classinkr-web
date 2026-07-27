-- 결제창 "무결제 신청(도입 신청)" 구조화 저장소.
-- SW(/checkout)·HW 결제창에서 결제 대신 "도입 신청"을 누르면 여기에 한 행이 남고,
-- 같은 신청이 leads 로도 미러링돼 어드민 리드 큐(기존 동선)에서 발견된다(lead_id).
--
-- software_checkout_orders 와는 다른 테이블이다: 결제 상태 기계(pending→paid)가 없고
-- 영업 응대 상태(new→contacted→scheduled→done|canceled)만 가진다.
-- items/total_amount 는 신청 시점 스냅샷 — 이후 가격이 바뀌어도 신청 당시 조건을 보존한다.
-- 혼합 통화 신청은 total_amount/currency 를 소계가 가장 큰 통화 기준으로 두고,
-- 전체 내역(통화 포함)은 items jsonb 에 손실 없이 남긴다.
--
-- 공개(무인증) 엔드포인트가 쓰는 테이블이므로 RLS 는 enable + 정책 0개(deny-all).
-- 접근은 service role(createSupabaseAdminClient)로만 한다.

create table if not exists public.checkout_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('hardware', 'software')),
  items jsonb not null,
  total_amount numeric not null default 0,
  currency text not null default 'KRW',
  org text not null,
  name text not null,
  phone text not null,
  email text,
  desired_date date not null,
  memo text,
  source_page text,
  lead_id uuid references public.leads(id) on delete set null,
  status text not null default 'new' check (
    status in ('new', 'contacted', 'scheduled', 'done', 'canceled')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 이전에 일부만 적용된 환경에서도 재실행이 안전하도록 컬럼 단위 가드.
alter table public.checkout_requests
  add column if not exists items jsonb,
  add column if not exists total_amount numeric not null default 0,
  add column if not exists currency text not null default 'KRW',
  add column if not exists email text,
  add column if not exists memo text,
  add column if not exists source_page text,
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

comment on table public.checkout_requests is
  '결제창 무결제 도입 신청 — 품목/금액 스냅샷 + 희망 날짜 + 리드 큐 미러(lead_id).';
comment on column public.checkout_requests.total_amount is
  '신청 시점 합계. 혼합 통화면 currency 통화의 소계이며 전체 내역은 items 참조.';

create index if not exists checkout_requests_created_at_idx
  on public.checkout_requests (created_at desc);
create index if not exists checkout_requests_status_idx
  on public.checkout_requests (status, created_at desc);
create index if not exists checkout_requests_desired_date_idx
  on public.checkout_requests (desired_date);

drop trigger if exists checkout_requests_updated_at on public.checkout_requests;
create trigger checkout_requests_updated_at
  before update on public.checkout_requests
  for each row execute function public.update_updated_at();

-- RLS deny-all: 정책을 만들지 않아 anon/authenticated 는 어떤 행도 볼 수 없다.
alter table public.checkout_requests enable row level security;

revoke all on table public.checkout_requests from anon, authenticated;
grant all on table public.checkout_requests to service_role;
