-- 리드 → 고객 자동 연결 켜기 (2026-10-22 운영자 결정).
--
-- docs/active/hardware-order-revenue-link-plan-2026-10-22.md §4-1: 리드가 들어오면 같은 학교·학원인
-- 기존 고객에 자동으로 붙인다. 20260611_crm_auto_confirm_policy.sql 은 "리드 전환이 확정 링크를 직접
-- 만든다"는 이유로 lead 를 수동으로 남겼는데, 이제 전환 없이도 기존 고객에 붙는 것이 목표다.
--
-- 자동 확정 규칙은 그대로다: 고객(customer) 대상만, 신뢰도 0.92 이상이고 2위와 0.15 이상 차이 날 때만.
-- 애매하면 /admin/crm/matching 후보로 남는다. 자동 확정 행은 confirmed_by 가 NULL 이고
-- metadata.auto_confirmed = true 라서 구분·되돌리기가 된다.
--
-- 되돌리기: UPDATE public.crm_source_priorities SET auto_confirm_enabled = false WHERE source_system = 'lead';

UPDATE public.crm_source_priorities
SET auto_confirm_enabled = true
WHERE source_system = 'lead';
