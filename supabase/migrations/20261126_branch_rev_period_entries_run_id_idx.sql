-- 매출 장부 REV 임포트 엔트리의 "실행 1회분을 id 순으로 페이지 읽기"에 맞는 색인을 더한다(2026-11-25 어드민·Compass 점검).
--
-- 왜: lib/repositories/sales-ledger-imports.ts 의 readRevDealsForImportRun 이 엔트리를
--   where import_run_id = $1 order by id  (range 로 1000행씩)
-- 로 읽는다. 지금 색인은 (import_run_id, period_month, confidence)·(rev_line_id, period_month)·pkey 뿐이라
-- 페이지마다 그 실행의 엔트리 전부(실행당 약 4,400~5,500행)를 비트맵으로 읽고 id 로 다시 정렬한다.
-- 운영 측정(2026-11-26, explain analyze, 읽기 전용): 5번째 페이지 1000행에 Bitmap Heap Scan 5,526행 + quicksort 5,000행, 78ms.
-- pg_stat_statements(2026-09-14 이후): 이 문장 5,701회, 평균 15.7ms, 최대 3.2초 — branch 화면 콜드 요청마다 5~6페이지를 돈다.
-- (import_run_id, id) 색인이면 정렬 없이 색인 순서로 읽어 뒤쪽 페이지도 앞에서부터 건너뛰기만 한다.
--
-- 크기·잠금: 표는 약 33만 행(pkey 색인 13MB)이라 새 색인도 10MB 안팎이다. 이 저장소의 마이그레이션은 트랜잭션 안에서 돌아
-- CREATE INDEX CONCURRENTLY 를 쓰지 않는다(20260914_leads_phone_key.sql 과 같음). 만드는 동안 이 표 쓰기(시트 임포트·주간 마감)가
-- 잠깐 막히므로 임포트가 돌지 않는 때 적용한다. 막을 수 없으면 SQL Editor 에서 같은 정의에 CONCURRENTLY 를 붙여 단독 문장으로
-- 먼저 만들면 아래는 건너뛴다.
--
-- 이 마이그레이션 전에도 코드는 그대로 돈다(성능만 다르다). 적용 뒤 코드 변경은 필요 없다.
-- 롤백: supabase/rollbacks/20261126_branch_rev_period_entries_run_id_idx.rollback.sql

create index if not exists branch_rev_period_entries_run_id_idx
  on public.branch_rev_period_entries (import_run_id, id);
