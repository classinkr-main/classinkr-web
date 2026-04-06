-- ─────────────────────────────────────────────────────────────
-- 블로그 페이지 레이아웃 템플릿 컬럼 추가
-- 생성일: 2026-04-02
-- ─────────────────────────────────────────────────────────────

ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS page_layout TEXT NOT NULL DEFAULT 'standard'
    CHECK (page_layout IN ('standard', 'minimal'));
