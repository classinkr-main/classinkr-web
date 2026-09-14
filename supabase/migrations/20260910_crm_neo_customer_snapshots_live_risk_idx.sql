-- Overview os-summary 콜드 미스(8.2초, 2026-09-10 실측) 진단에서 나온 제안 인덱스.
-- 근거: lib/repositories/crm-neo-customer-snapshots.ts의 listCrmNeoCustomerSnapshots()가
-- (기본 옵션 호출 시) crm_neo_customer_snapshots를
--   .eq("source_system", ...).eq("is_stale", false)
--   .order("risk_level").order("expire_at", nullsFirst:false).order("source_synced_at", nullsFirst:false)
-- 로 최대 10,000행을 select("*", {count:"exact"})로 읽는다. 이 화면(Overview 리뉴얼 D-60 카드)이
-- 쓰는 값은 그중 숫자 하나(expiringSoonCount)뿐이라 원래도 과하지만, 쿼리 구조 자체를 고치는 건
-- CRM 코어 소유 파일이라 이 마이그레이션에서는 손대지 않는다(lib/admin/overview/os-summary.ts
-- 주석·보고서의 위임 요청 참고).
--
-- 기존 crm_neo_customer_snapshots_risk_due_idx(risk_level, expire_at, last_class_at)는
-- is_stale을 선두 컬럼에 두지 않는다 — refreshCrmNeoCustomerSnapshotsFromExternalRecords가
-- 매 실행마다 이전 세대를 삭제가 아니라 is_stale=true로만 표시하므로(같은 파일 693-709행),
-- 스냅샷 갱신 이력이 쌓일수록 이 인덱스가 스캔해야 하는 "죽은" 행 비율이 계속 늘어난다.
-- 아래는 is_stale=false만 담는 부분 인덱스 + source_system을 선두에 둔 버전으로, 쿼리가 실제
-- 읽는 "살아있는" 행만 인덱스에 남긴다.
--
-- 주의: 이 인덱스가 실제로 콜드 미스를 줄이는지는 EXPLAIN ANALYZE로 확인하지 않았다(이 작업은
-- DB 접근 없이 코드·마이그레이션 이력만으로 진행했다) — 정황 근거(누적 이력 행 증가 + 회귀 아닌
-- 데이터 증가형 지연)에 기반한 제안이다. 적용 전 프로덕션에서 먼저 EXPLAIN으로 확인 권장.
-- 롤백: drop index if exists public.crm_neo_customer_snapshots_live_risk_idx;

create index if not exists crm_neo_customer_snapshots_live_risk_idx
  on public.crm_neo_customer_snapshots (source_system, risk_level, expire_at, source_synced_at desc)
  where is_stale = false;
