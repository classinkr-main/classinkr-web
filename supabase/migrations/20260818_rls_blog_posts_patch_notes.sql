-- RLS 공백 마감(2026-08-18): blog_posts · patch_notes
--
-- 배경: 스키마 드리프트 감사에서 149개 테이블 중 이 둘만 RLS가 꺼져 있었다.
-- 둘 다 anon 키로 직접 읽기·쓰기가 열려 있고 `revoke ... from anon` 도 없다.
--
-- 이 마이그레이션은 멱등이다. service role(createSupabaseAdminClient)은 RLS를 우회하므로
-- 어드민 CRUD 경로는 어느 쪽도 영향을 받지 않는다.

-- ─── 1. blog_posts ───────────────────────────────────────────
-- 20260610_blog_posts_backfill_schema.sql 이 RLS를 의도적으로 유예하며 남긴 계획을 그대로 실행한다.
-- 유예 사유는 "어드민 목록 조회까지 server 클라이언트(anon key)로 수행한다"였는데, 현재
-- lib/repositories/blog.ts 의 모든 blog_posts 접근(createSupabaseBlogReadClient 포함)이
-- createSupabaseAdminClient 를 쓴다 — 차단 사유가 해소됐다.
--
-- 지금 상태에서는 DRAFT·IN_REVIEW·휴지통(deleted_at) 글이 anon 키로 읽히고 쓰기까지 열려 있다.
-- 공개 SELECT 정책은 테이블 코멘트가 이미 선언한 계약과 같다:
--   '어드민 CRUD는 service role, 공개 읽기는 PUBLISHED + deleted_at IS NULL'
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view published posts" ON public.blog_posts;
CREATE POLICY "Public can view published posts" ON public.blog_posts
  FOR SELECT
  USING (status = 'PUBLISHED' AND deleted_at IS NULL);

-- ─── 2. patch_notes ──────────────────────────────────────────
-- 20260519_classin_607_update_doc.sql 이 만든 뒤 RLS·정책·revoke 가 전부 없었다.
-- 접근 경로는 lib/repositories/patch-notes.ts 의 admin 클라이언트 단독이라
-- 20260423_rls_admin_only_tables.sql 과 같은 deny-all(정책 0개)로 둔다.
ALTER TABLE public.patch_notes ENABLE ROW LEVEL SECURITY;

-- 적용 확인:
--   select relname, relrowsecurity from pg_class
--   where relname in ('blog_posts', 'patch_notes');
-- 또는 npm run check:db (anon 키가 있으면 실제 노출 여부까지 검증한다)
