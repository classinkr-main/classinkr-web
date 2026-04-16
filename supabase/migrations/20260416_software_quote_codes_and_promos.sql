-- Software checkout 코드 기반 결제 지원
-- 1) software_quote_codes: 어드민이 SW 견적에 대해 발급하는 1회용 결제 코드
-- 2) promo_codes: 마케팅/할인 프로모션 코드 (N회 재사용 가능)
-- 3) promo_code_redemptions: 프로모션 코드 사용 이력 (usage_limit 차감/감사용)
-- 4) software_checkout_orders 에 quote_code / promo_code 연결 컬럼 추가

-- ─── software_quote_codes ────────────────────────────────
create table if not exists public.software_quote_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  kind text not null default 'business_recharge'
    check (kind in ('business_recharge', 'subscription')),

  -- 견적 대상 고객사 정보 (아직 어드민에서 파트너로 묶지 않는 경우 대비)
  organization_name text,
  buyer_name text,
  buyer_email text,
  partner_id uuid, -- nullable. 향후 partners 테이블과 FK 연결 여지

  -- 결제 금액 (kind = business_recharge 인 경우 amount_cny 사용)
  amount_cny numeric(12, 2),
  amount_usd numeric(12, 2),

  notes text,

  -- 만료/사용 관리
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_order_id text,

  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.software_quote_codes is 'Admin-issued software quote codes for self-serve checkout.';
comment on column public.software_quote_codes.code is 'User-visible redemption code (QC-YYYY-XXXX or similar).';
comment on column public.software_quote_codes.amount_cny is 'For business_recharge kind. Must match 10,000 + 2,000*N rules.';

create index if not exists software_quote_codes_kind_idx on public.software_quote_codes (kind);
create index if not exists software_quote_codes_redeemed_idx on public.software_quote_codes (redeemed_at);

-- updated_at 자동 갱신
create or replace function public.software_quote_codes_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists software_quote_codes_touch_updated_at on public.software_quote_codes;
create trigger software_quote_codes_touch_updated_at
  before update on public.software_quote_codes
  for each row execute function public.software_quote_codes_touch_updated_at();

-- ─── promo_codes ─────────────────────────────────────────
create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text,
  target_product text not null
    check (target_product in ('business_recharge', 'subscription', 'any')),
  discount_type text not null
    check (discount_type in ('percent', 'flat_cny', 'flat_usd', 'flat_krw')),
  discount_value numeric(12, 2) not null check (discount_value >= 0),
  currency text, -- flat_* 유형일 때만 의미

  usage_limit integer, -- null = 무제한
  used_count integer not null default 0,

  starts_at timestamptz,
  expires_at timestamptz,

  is_active boolean not null default true,
  notes text,

  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.promo_codes is 'Marketing promotional codes applied at checkout.';
comment on column public.promo_codes.discount_type is 'percent: 0-100. flat_*: absolute amount in specified currency.';

create index if not exists promo_codes_target_idx on public.promo_codes (target_product);
create index if not exists promo_codes_is_active_idx on public.promo_codes (is_active);

create or replace function public.promo_codes_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists promo_codes_touch_updated_at on public.promo_codes;
create trigger promo_codes_touch_updated_at
  before update on public.promo_codes
  for each row execute function public.promo_codes_touch_updated_at();

-- ─── promo_codes.used_count 원자적 증가 RPC ───────────────
-- 단일 UPDATE 는 row-level lock 으로 동시성 안전.
create or replace function public.increment_promo_code_used_count(p_promo_code_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.promo_codes
  set used_count = used_count + 1
  where id = p_promo_code_id;
$$;

-- ─── promo_code_redemptions ──────────────────────────────
create table if not exists public.promo_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references public.promo_codes(id) on delete cascade,
  order_id text not null,
  amount_before numeric(12, 2) not null,
  amount_after numeric(12, 2) not null,
  currency text not null,
  redeemed_at timestamptz not null default now()
);

create index if not exists promo_code_redemptions_promo_idx
  on public.promo_code_redemptions (promo_code_id);
create index if not exists promo_code_redemptions_order_idx
  on public.promo_code_redemptions (order_id);

-- ─── software_checkout_orders 확장 ───────────────────────
alter table public.software_checkout_orders
  add column if not exists mode text not null default 'subscription'
    check (mode in ('subscription', 'business'));

alter table public.software_checkout_orders
  add column if not exists quote_code_id uuid references public.software_quote_codes(id);

alter table public.software_checkout_orders
  add column if not exists applied_promo_code_id uuid references public.promo_codes(id);

-- plan_id 는 subscription 에서만 필수. business 에서는 null 허용.
-- 이미 plan_id 가 NOT NULL 로 잡혀있다면 제약 완화.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'software_checkout_orders'
      and column_name = 'plan_id'
      and is_nullable = 'NO'
  ) then
    alter table public.software_checkout_orders alter column plan_id drop not null;
  end if;
end$$;

-- billing_cycle 도 business 주문에서는 null 허용
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'software_checkout_orders'
      and column_name = 'billing_cycle'
      and is_nullable = 'NO'
  ) then
    alter table public.software_checkout_orders alter column billing_cycle drop not null;
  end if;
end$$;
