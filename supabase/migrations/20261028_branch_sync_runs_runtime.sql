-- 시트 동기화 실행 기록에 출처를 남긴다 — 어느 환경·배포·커밋·리전이 이 런을 썼는가.
--
-- 왜(2026-10-28 읽기 전용 감사): 10/15~10/19 에 운영 크론(옛 캡처 코드)과 운영 밖 환경(로컬·Preview)의
-- 수동 동기화가 같은 운영 DB의 sales_ledger_active_sources 를 번갈아 전환했는데, branch_sync_runs 에는
-- 배포·환경 컬럼이 없어 어느 쪽이 썼는지 사후에 가려낼 수 없었다. 쓰기 가드는 코드(lib/branch/sync/write-guard.ts),
-- 출처 기록은 이 컬럼이다. startSyncRun(lib/repositories/branch-sync.ts)이 채운다:
--   { "env": "production", "deploymentId": "dpl_…", "sha": "<git sha>", "region": "icn1", "allowedBy": "production" }
--
-- 컬럼만 더한다(NULL 허용) — 기존 행·읽기 경로는 그대로다. 미적용 환경에서는 startSyncRun 이
-- 42703/PGRST204 를 보고 컬럼 없이 다시 기록하므로 동기화가 죽지 않는다. 멱등 — 재실행 무해.

ALTER TABLE public.branch_sync_runs
  ADD COLUMN IF NOT EXISTS runtime JSONB;

COMMENT ON COLUMN public.branch_sync_runs.runtime IS
  '이 런을 쓴 런타임 — env(VERCEL_ENV 또는 local)·deploymentId·sha·region·allowedBy(production|nonprod-flag). 마이그레이션 이전 런은 NULL.';
