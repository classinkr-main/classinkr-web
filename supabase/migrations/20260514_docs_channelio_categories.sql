-- channel.io 공식 가이드 36문서를 정적 docs로 옮기면서
-- docs_categories 체계를 6종(quick-start/guides/manual/help/troubleshooting/updates)에서
-- 5종(start/admin/teacher/student/board)으로 교체합니다.
--
-- USE_SUPABASE_DOCS=true 환경에서만 영향 있는 마이그레이션입니다.
-- 정적 lib/docs.ts는 이 SQL과 무관하게 이미 새 카테고리로 동작합니다.

-- 1) 새 카테고리 5종 upsert
INSERT INTO docs_categories (id, title, description, order_index, is_visible)
VALUES
  ('start',   '클래스인 시작하기',     '설치부터 회원가입까지, 수업을 진행하고 참여하기 위한 기초 안내입니다.', 1, true),
  ('admin',   '[관리자] 사용 가이드',   '기관(학원) 관리자를 위한 대시보드 전반의 사용 방법을 안내합니다.',        2, true),
  ('teacher', '[교사] 사용 가이드',     '수업을 진행하는 강사를 위한 클래스인 사용 가이드입니다.',                  3, true),
  ('student', '[학생] 사용 가이드',     '수업 참여부터 학습 활동 제출까지 학생을 위한 다양한 사용법을 모았습니다.', 4, true),
  ('board',   '[전자칠판] 배송/설치',   '전자칠판 배송 및 설치 관련 안내입니다.',                                     5, true)
ON CONFLICT (id) DO UPDATE
SET title        = EXCLUDED.title,
    description  = EXCLUDED.description,
    order_index  = EXCLUDED.order_index,
    is_visible   = EXCLUDED.is_visible;

-- 2) 옛 카테고리 가시성 끄기 (운영 데이터를 보존하기 위해 삭제는 하지 않습니다)
UPDATE docs_categories
SET    is_visible = false,
       order_index = 99
WHERE  id IN ('quick-start', 'guides', 'manual', 'help', 'troubleshooting', 'updates');

-- 3) 카테고리 페이지 단위 리다이렉트 (옛 → 가장 가까운 새 카테고리)
INSERT INTO docs_redirects (from_path, to_path, http_status)
VALUES
  ('/docs/quick-start',     '/docs/start',   301),
  ('/docs/guides',          '/docs/admin',   301),
  ('/docs/manual',          '/docs/teacher', 301),
  ('/docs/help',            '/docs/start',   301),
  ('/docs/troubleshooting', '/docs/start',   301),
  ('/docs/updates',         '/docs/start',   301)
ON CONFLICT (from_path) DO UPDATE
SET to_path     = EXCLUDED.to_path,
    http_status = EXCLUDED.http_status;

-- 4) 운영 메모
--
-- - docs_articles 중 category_id가 옛 6종에 속한 행은 그대로 두되,
--   getDocsContent 의 isDocCategoryId 필터가 옛 ID를 더 이상 인정하지 않기 때문에
--   공개 사이트에서는 노출되지 않습니다. 노출이 필요하면 category_id 를 새 5종 중
--   하나로 UPDATE 한 뒤 status='published' 를 유지하세요.
--
-- - 옛 슬러그 단위 리다이렉트(예: /docs/quick-start/first-class-setup → ...) 가
--   필요하면 별도 INSERT 로 docs_redirects 에 추가해 주세요. 이 마이그레이션에서는
--   카테고리 페이지만 가져갑니다.
