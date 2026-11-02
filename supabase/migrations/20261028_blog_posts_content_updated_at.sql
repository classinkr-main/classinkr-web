-- ─────────────────────────────────────────────────────────────
-- blog_posts.content_updated_at — 글 내용이 실제로 바뀐 시각 (2026-10-28)
--
-- 배경: 20260610_blog_posts_backfill_schema.sql 의 트리거 blog_posts_updated_at
-- (blog_posts_touch_updated_at)는 모든 UPDATE 에 updated_at = now() 를 쓴다.
-- 그래서 어드민에서 대표 글(featured) 토글·공개/초안 토글·휴지통 복원만 해도
-- 사이트맵 lastmod, 블로그 상세 JSON-LD dateModified, RSS lastBuildDate 가 바뀌었다.
-- 검색엔진에는 "내용이 바뀌었다"는 거짓 신호다.
--
-- 결정(운영자, 옵션 A): 본문·제목·요약·SEO 필드·대표 이미지가 실제로 바뀔 때만
-- 갱신되는 content_updated_at 을 따로 두고, 공개 표면(사이트맵·dateModified·RSS)은
-- 이 값을 쓴다. updated_at 과 기존 트리거는 내부용으로 그대로 둔다.
--
-- 코드: lib/repositories/blog.ts 가 content_updated_at 을 읽고, 날짜 우선순위는
-- lib/blog-types.ts resolveBlogContentModifiedAt 이 정한다. 이 파일이 적용되기 전에
-- 코드가 먼저 배포돼도 사이트맵·RSS 조회는 컬럼 없음(42703)을 감지해 updated_at 으로
-- 폴백하고, 상세(select *)는 값이 없으면 updated_at 을 쓴다 — 지금 동작과 같다.
--
-- 적용: Supabase SQL Editor(서울 프로젝트)에서 이 파일 전체를 실행한다.
-- 전부 멱등(ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS /
-- WHERE content_updated_at IS NULL) — 재실행은 무해하다.
--
-- 적용 확인:
--   select column_name, data_type, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'blog_posts'
--      and column_name = 'content_updated_at';
--   select tgname from pg_trigger
--    where tgrelid = 'public.blog_posts'::regclass and not tgisinternal;
--     -- blog_posts_updated_at, blog_posts_content_updated_at 둘 다 보여야 한다
--   select count(*) from public.blog_posts where content_updated_at is null;  -- 0
-- 그 밖에는 npm run check:db 의 blog_posts.content_updated_at 프로브가 본다.
-- ─────────────────────────────────────────────────────────────

-- 1) 컬럼. 기본값은 백필 뒤에 건다 — 처음부터 default now() 로 추가하면 기존 행이 전부
--    적용 시각으로 채워져 아래 백필(where content_updated_at is null)이 아무것도 하지 않는다.
alter table public.blog_posts
  add column if not exists content_updated_at timestamptz;

comment on column public.blog_posts.content_updated_at is
  '글 내용(제목·슬러그·요약·본문·카테고리·대표 이미지·SEO·이 글에서 다루는 것)이 실제로 바뀐 시각. 사이트맵 lastmod·JSON-LD dateModified·RSS 기준. 상태·대표 글·발행일·휴지통 변경으로는 바뀌지 않는다.';

-- 2) 백필. 지금 공개 표면에 나가는 값(updated_at 우선)과 같은 값으로 채운다.
--    - 2026-10-26 에 실제로 본문을 고친 글은 updated_at 이 그날이라 10-26 이 맞다.
--    - 그 밖의 글은 updated_at 이 토글 때문에 밀려 있었을 수 있지만, 지금 노출되는 값과
--      같으므로 적용 전보다 나빠지지 않는다. 더 이른 "진짜" 수정 시각은 기록이 없어
--      되살릴 수 없다 — 지어내지 않는다.
--    - updated_at 은 NOT NULL 이라 사실상 updated_at 이 들어간다. coalesce 는 방어용이다.
update public.blog_posts
   set content_updated_at = coalesce(updated_at, published_at, created_at)
 where content_updated_at is null;

-- 3) 새 글(INSERT)은 작성 시각에서 시작한다. 어드민·스크립트 insert 는 이 컬럼을 싣지 않는다.
alter table public.blog_posts
  alter column content_updated_at set default now();

-- 4) 내용 컬럼이 하나라도 실제로 바뀐 UPDATE 에서만 now() 로 올린다.
--    IS DISTINCT FROM 이라 NULL ↔ 값 변경도 잡고, 같은 값을 다시 저장한 경우(어드민 편집기의
--    전체 저장, 스크립트 재실행)는 올리지 않는다.
--
--    포함: title, slug, excerpt, content_markdown, content_html, category,
--          image_url, hero_image_url, seo_title, seo_description,
--          benefit_items, target_reader(본문 머리의 "이 글에서 다루는 것" 블록)
--    제외(메타·운영): status, featured, published_at, published_by, deleted_at,
--          created_at, updated_at, author_user_id, related_post_ids, page_layout,
--          lead_magnet_slug, cta_text, cta_url, cta_style, tags, read_time,
--          author_name, author_role, author_bio, author_avatar_url
--    포함 목록을 바꾸면 tests/db/blog-posts-content-updated-at-migration.test.ts 도 함께 고친다.
--
--    값이 바뀌지 않았으면 new.content_updated_at 을 건드리지 않는다(어드민은 이 컬럼을 쓰지 않는다).
create or replace function public.blog_posts_touch_content_updated_at()
returns trigger language plpgsql as $$
begin
  if new.title            is distinct from old.title
  or new.slug             is distinct from old.slug
  or new.excerpt          is distinct from old.excerpt
  or new.content_markdown is distinct from old.content_markdown
  or new.content_html     is distinct from old.content_html
  or new.category         is distinct from old.category
  or new.image_url        is distinct from old.image_url
  or new.hero_image_url   is distinct from old.hero_image_url
  or new.seo_title        is distinct from old.seo_title
  or new.seo_description  is distinct from old.seo_description
  or new.benefit_items    is distinct from old.benefit_items
  or new.target_reader    is distinct from old.target_reader
  then
    new.content_updated_at = now();
  end if;
  return new;
end;
$$;

-- 기존 blog_posts_updated_at 트리거는 그대로 둔다(내부용 updated_at 유지).
drop trigger if exists blog_posts_content_updated_at on public.blog_posts;
create trigger blog_posts_content_updated_at
  before update on public.blog_posts
  for each row execute function public.blog_posts_touch_content_updated_at();
