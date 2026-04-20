-- public_events: 공개 웹사이트 /events 탭에 표시되는 행사 정보
create table if not exists public.public_events (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text,
  category         text not null check (category in ('웨비나', '오프라인 행사', '프로모션', '얼리버드', '파트너십')),
  tag              text,
  starts_at        timestamptz not null,
  ends_at          timestamptz,
  location         text,
  cta_label        text not null default '자세히 보기',
  cta_href         text,
  image_path       text,
  highlight        boolean not null default false,
  status_override  text check (status_override in ('진행 중', '예정', '마감')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.public_events is '공개 웹사이트 /events 탭에 표시되는 행사 정보';
comment on column public.public_events.status_override is 'NULL이면 starts_at/ends_at 기준 자동 계산, 값이 있으면 우선 적용';
comment on column public.public_events.image_path is 'Supabase Storage event-images 버킷 내 경로';

-- RLS 활성화 (anon은 SELECT만, admin 작업은 service role 클라이언트 사용)
alter table public.public_events enable row level security;

create policy "Anyone can view public events"
  on public.public_events for select
  using (true);

-- updated_at 자동 갱신
create or replace function public.public_events_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger public_events_updated_at
  before update on public.public_events
  for each row execute function public.public_events_touch_updated_at();

-- 인덱스
create index if not exists public_events_starts_at_idx on public.public_events (starts_at desc);
create index if not exists public_events_category_idx on public.public_events (category);

-- Supabase Storage 버킷 (public read)
insert into storage.buckets (id, name, public)
values ('event-images', 'event-images', true)
on conflict (id) do nothing;

create policy "Public read event images"
  on storage.objects for select
  using (bucket_id = 'event-images');

create policy "Service role manage event images"
  on storage.objects for all
  to service_role
  using (bucket_id = 'event-images');
