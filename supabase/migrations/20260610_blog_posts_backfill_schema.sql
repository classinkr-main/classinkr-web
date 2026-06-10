-- ─────────────────────────────────────────────────────────────
-- blog_posts 스키마 백필 (재구성)
-- 생성일: 2026-06-10
--
-- 배경: blog_posts 테이블은 운영 DB에 이미 존재하지만 CREATE TABLE
-- 마이그레이션이 저장소에 없었다 (20260402_blog_page_layout.sql 은
-- ALTER 만 수행). 새 환경 재현이 불가능했으므로
-- lib/supabase/database.types.ts 의 Row 타입을 기준으로 역추적해 작성.
-- 모든 구문은 멱등이라 기존 운영 DB에 적용해도 아무것도 바꾸지 않는다.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.blog_posts (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  slug              text not null unique,
  excerpt           text,
  content_markdown  text,
  content_html      text,
  category          text,
  tags              text[] not null default '{}',
  author_name       text,
  author_role       text,
  author_bio        text,
  author_avatar_url text,
  author_user_id    uuid,
  read_time         text,
  image_url         text,
  hero_image_url    text,
  featured          boolean not null default false,
  status            text not null default 'DRAFT'
                      check (status in ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED')),
  seo_title         text,
  seo_description   text,
  benefit_items     text[] not null default '{}',
  target_reader     text,
  cta_text          text,
  cta_url           text,
  cta_style         text not null default 'primary',
  -- TS 타입은 string[] — 코드가 항상 빈 배열만 넣으므로 text[]로 보수적으로 정의
  related_post_ids  text[] not null default '{}',
  page_layout       text not null default 'standard'
                      check (page_layout in ('standard', 'minimal')),
  published_at      timestamptz,
  published_by      uuid,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.blog_posts is '공개 사이트 /blog 글 — 어드민 CRUD는 service role, 공개 읽기는 PUBLISHED + deleted_at IS NULL';

-- 인덱스 (이미 존재하면 무시)
create index if not exists blog_posts_status_published_at_idx
  on public.blog_posts (status, published_at desc);
create index if not exists blog_posts_deleted_at_idx
  on public.blog_posts (deleted_at);
create index if not exists blog_posts_created_at_idx
  on public.blog_posts (created_at desc);

-- updated_at 자동 갱신
create or replace function public.blog_posts_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists blog_posts_updated_at on public.blog_posts;
create trigger blog_posts_updated_at
  before update on public.blog_posts
  for each row execute function public.blog_posts_touch_updated_at();

-- RLS는 의도적으로 건드리지 않는다.
-- 현재 코드(lib/repositories/blog.ts)는 어드민 목록 조회까지 server 클라이언트(anon key)로 수행하므로,
-- 운영 DB에서 RLS가 꺼져 있는 상태에서 여기서 켜면 어드민 블로그 대시보드(draft/휴지통)가 깨진다.
-- RLS를 도입하려면 먼저 어드민 경로를 admin 클라이언트로 전환한 뒤 별도 마이그레이션으로:
--   alter table public.blog_posts enable row level security;
--   create policy "Public can view published posts" on public.blog_posts
--     for select using (status = 'PUBLISHED' and deleted_at is null);
-- 운영 RLS 상태 확인: select relrowsecurity from pg_class where relname = 'blog_posts';
