-- 하드웨어 원장 표시 리스트 정렬 인덱스 (T5-A).
-- 근거: docs/active/supabase-optimization-execution-plan-2026-09-02.md §T5-A·§T8-B.
--
-- /api/admin/hardware 대시보드는 voided_at is null 인 이동을 occurred_at(없으면 created_at) 최신순으로
-- 정렬해 상위 2,000행을 표시하는데, 이 정렬을 받쳐 주는 인덱스가 없었다. 무효 행을 제외한 부분 인덱스로
-- 활성 원장만 정렬 순서대로 유지한다. 롤백: drop index if exists public.hardware_movements_active_date_idx;

create index if not exists hardware_movements_active_date_idx
  on public.hardware_movements (occurred_at desc nulls last, created_at desc)
  where voided_at is null;
