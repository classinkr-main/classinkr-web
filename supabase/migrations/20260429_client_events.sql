-- client_events: 공개 사이트 클라이언트 이벤트 로깅
-- /api/track 엔드포인트에서 INSERT, /api/admin/event-counts 에서 service role 로 SELECT
-- 외부 픽셀(GA/Meta/Kakao)과 별개로 어드민에서 직접 카운트를 보기 위한 자체 로깅

create table if not exists public.client_events (
  id           uuid primary key default gen_random_uuid(),
  event_name   text not null,
  button       text,
  page         text,
  params       jsonb not null default '{}'::jsonb,
  referrer     text,
  user_agent   text,
  created_at   timestamptz not null default now()
);

comment on table public.client_events is '공개 사이트 클라이언트 이벤트 로깅 (click_cta, submit_*, begin_checkout, download_materials 등)';
comment on column public.client_events.button is 'click_cta 이벤트의 button param 을 별도 컬럼으로 분리해 인덱스 사용';
comment on column public.client_events.page is '이벤트 발생 페이지 경로 (예: /product/sw)';

-- RLS: anon INSERT 허용, SELECT/UPDATE/DELETE 차단
-- service role(createSupabaseAdminClient) 만 SELECT 가능
alter table public.client_events enable row level security;

create policy "Anon can insert client events"
  on public.client_events for insert
  to anon, authenticated
  with check (true);

-- 인덱스: 이벤트 이름·기간별 집계와 button 별 집계용
create index if not exists client_events_event_created_idx
  on public.client_events (event_name, created_at desc);

create index if not exists client_events_button_created_idx
  on public.client_events (button, created_at desc)
  where button is not null;

create index if not exists client_events_page_created_idx
  on public.client_events (page, created_at desc)
  where page is not null;
