-- 수동 비상 롤백 전용. supabase/migrations 에 넣거나 평상시 실행하지 않는다.
-- 20261126_internal_team_contacts.sql 을 되돌린다 — 담당자 표 행이 모두 사라진다(되살릴 수 없다).
-- 지우기 전에 행을 남겨 두려면 먼저 내려받는다:
--   select org, area, role, name, deputy, channel, prep, admin_link, note, confirmed_at, confirmed_by, active, sort_order
--     from public.internal_team_contacts order by org, sort_order, area;
-- 코드는 표가 없어도 돈다 — 안내는 빈 표로(카드에 "담당자 표를 읽지 못했습니다"), 담당자 표 화면은 적용 안내, 쓰기는 503.

begin;

drop trigger if exists internal_team_contacts_updated_at on public.internal_team_contacts;
drop index if exists public.internal_team_contacts_org_sort_idx;
drop index if exists public.internal_team_contacts_active_area_uniq;
drop table if exists public.internal_team_contacts;

commit;
