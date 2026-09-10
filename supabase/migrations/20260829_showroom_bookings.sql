-- 목동 쇼룸 상담 예약 접수 저장소.
--
-- 지금까지 쇼룸 예약의 정본(SoR)은 구글 캘린더였고 우리 쪽은 ICS 읽기 전용이었다
-- (lib/showroom-ics-calendar.ts). 공개 예약 화면이 생기면서 "요청"을 담을 곳이 필요하다.
--
-- 1차는 요청형이다: 고객이 날짜·시각을 고르면 requested 로 남고, 담당자가 확인해
-- confirmed 로 올린다. ICS 가 읽기 전용 5분 캐시라 실시간 확정을 약속하면 더블부킹이
-- 난다 — 확정 권한은 사람에게 둔다. 그래서 슬롯 배타 제약(EXCLUDE USING gist)도
-- 걸지 않는다. 같은 슬롯에 요청이 둘 들어오면 담당자가 조정한다.
--
-- checkout_requests 와 같은 규약을 따른다:
--   * 공개(무인증) 엔드포인트가 쓰므로 RLS enable + 정책 0개(deny-all), service_role 전용
--   * 같은 접수를 leads 로 미러링해 어드민 리드 큐에서 발견되게 한다(lead_id)
--   * 상태는 결제가 아니라 영업 응대 축이다
--
-- 날짜·시각 표기는 admin_calendar_events 관례를 따른다: visit_date 는 DATE,
-- visit_time 은 KST 벽시계 'HH:mm' TEXT 다. timestamptz 로 두면 서버 TZ 와 표시
-- TZ 가 어긋날 때 한 시간씩 밀린다.

create table if not exists public.showroom_bookings (
  id uuid primary key default gen_random_uuid(),

  -- 예약 슬롯
  visit_date date not null,
  visit_time text not null check (visit_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 480),

  -- 방문자
  org text not null,
  name text not null,
  phone text not null,
  email text,
  role text,
  visitor_count integer not null default 1 check (visitor_count between 1 and 20),

  -- 상담 맥락 — 리드 스코어와 사전 준비에 쓴다
  academy_size text,
  interests text[] not null default '{}',
  memo text,

  -- 운영
  status text not null default 'requested' check (
    status in ('requested', 'confirmed', 'completed', 'no_show', 'canceled')
  ),
  assigned_to text,
  confirmed_at timestamptz,
  -- 확정 시 구글 쇼룸 캘린더에 만든 일정(2차). 1차에서는 항상 null 이다.
  google_calendar_event_id text,

  lead_id uuid references public.leads(id) on delete set null,
  source_page text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 이전에 일부만 적용된 환경에서도 재실행이 안전하도록 컬럼 단위 가드.
alter table public.showroom_bookings
  add column if not exists email text,
  add column if not exists role text,
  add column if not exists academy_size text,
  add column if not exists interests text[] not null default '{}',
  add column if not exists memo text,
  add column if not exists assigned_to text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists google_calendar_event_id text,
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists source_page text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

comment on table public.showroom_bookings is
  '목동 쇼룸 상담 예약 접수 — 요청형(담당자 확정). 리드 큐 미러(lead_id).';
comment on column public.showroom_bookings.visit_time is
  'KST 벽시계 HH:mm. timestamptz 아님 — admin_calendar_events 와 같은 규약.';
comment on column public.showroom_bookings.status is
  '영업 응대 축. requested→confirmed→completed, 이탈은 no_show/canceled.';
comment on column public.showroom_bookings.google_calendar_event_id is
  '확정 시 구글 쇼룸 캘린더에 만든 일정 id. 1차(요청형)에서는 항상 null.';

-- 담당자가 "다가오는 예약"을 보는 축.
create index if not exists showroom_bookings_visit_idx
  on public.showroom_bookings (visit_date, visit_time);
-- 접수 큐(최신순)와 상태별 필터.
create index if not exists showroom_bookings_status_idx
  on public.showroom_bookings (status, visit_date);
create index if not exists showroom_bookings_created_at_idx
  on public.showroom_bookings (created_at desc);

drop trigger if exists showroom_bookings_updated_at on public.showroom_bookings;
create trigger showroom_bookings_updated_at
  before update on public.showroom_bookings
  for each row execute function public.update_updated_at();

-- RLS deny-all: 정책을 만들지 않아 anon/authenticated 는 어떤 행도 볼 수 없다.
alter table public.showroom_bookings enable row level security;

revoke all on table public.showroom_bookings from anon, authenticated;
grant all on table public.showroom_bookings to service_role;
