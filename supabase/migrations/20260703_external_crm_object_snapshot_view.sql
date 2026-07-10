-- External CRM 스냅샷 팬아웃 축소 — object별 COUNT head 쿼리 2N+1을 단일 뷰로 대체.
--
-- getExternalCrmSnapshotQuery(lib/admin-crm-revenue.ts)는 object마다 active count head
-- 쿼리 + 전체 stale count 쿼리를 개별 실행했다. 이 뷰는 (source_system, object_api_key)
-- 단위로 active_count / latest_synced_at / stale_count를 한 번에 집계한다.
-- 애플리케이션은 이 뷰가 없거나 권한 오류가 나면 기존 per-object 팬아웃으로 폴백한다.

create or replace view public.external_crm_object_snapshot as
  select
    source_system,
    object_api_key,
    count(*) filter (where not is_stale) as active_count,
    max(synced_at) filter (where not is_stale) as latest_synced_at,
    count(*) filter (where is_stale) as stale_count
  from public.external_crm_records
  group by source_system, object_api_key;

-- Grants — admin 경로는 service role 클라이언트를 쓴다.
grant select on public.external_crm_object_snapshot to service_role;
