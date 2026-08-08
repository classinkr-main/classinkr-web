-- docs_articles.content_length — 어드민 문서 리스트의 본문 과다 페치 제거 (감사 2026-07-23 §후속 1).
--
-- ⚠️ 수동 적용 필요: 이 파일은 저장만으로 라이브에 반영되지 않는다.
--    Supabase SQL Editor 또는 `supabase db push`로 직접 적용해야 한다.
--    적용 전에도 코드는 안전하다 — lib/admin-docs.ts 리스트 쿼리가 컬럼 부재(42703)를
--    감지하면 기존 content_markdown 전체 select로 폴백한다(무음 실패 없음).
--
-- 배경: listAdminDocsContent()가 리스트 화면용으로 content_markdown 전체를 select하지만
--   실제로는 트림 길이(contentLength) 하나만 소비한다. PostgREST는 select 절에서
--   char_length() 인라인 계산을 지원하지 않으므로 생성 컬럼으로 스키마에 내려 저장한다.
--
-- 의미 동일성(중요): contentLength는 AI "본문 보강 필요" 플래그(admin-docs.ts, < 120자)를
--   좌우하므로 기존 JS 계산 `content_markdown?.trim().length ?? 0`과 값이 일치해야 한다.
--   - btrim 문자 집합 E' \t\n\r\f' — JS String.trim()처럼 앞뒤 공백·탭·개행·CR·폼피드를 제거한다.
--     (기본 btrim은 스페이스만 제거해, 마크다운 특성상 흔한 trailing 개행이 길이에 섞이는
--      드리프트가 생긴다 — 120자 경계 문서의 플래그가 뒤집힐 수 있어 집합을 명시한다)
--   - coalesce(..., 0) — content_markdown IS NULL이면 0 (JS의 `?? 0`과 동일).
--   - char_length는 문자 수 기준이라 JS .length(UTF-16 코드유닛)와는 BMP 밖 문자(이모지 등)에서만
--     1~2자 미세 차이가 날 수 있다. 임계 판정 용도로는 동등하다.
--
-- STORED 생성 컬럼은 추가 시 기존 행에 대해 즉시 계산·백필된다(별도 UPDATE 불필요).

alter table public.docs_articles
  add column if not exists content_length int
  generated always as (coalesce(char_length(btrim(content_markdown, E' \t\n\r\f')), 0)) stored;

comment on column public.docs_articles.content_length is
  '본문(content_markdown) 트림 길이 생성 컬럼 — 리스트 조회가 본문 전체 대신 이 값을 읽는다. AI 본문 보강 플래그(<120) 판정에 사용.';
