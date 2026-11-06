-- 쇼룸 예약 확정을 Compass 「쇼룸 데모」 회차에서 받는다(2026-11-06).
--
-- 흐름: 공개 /showroom 신청(requested) → 리드 미러 → Compass 로 전달(crm.lead_refs home_lead)
--       → 매니저가 Compass 에서 「쇼룸 데모」 회차를 잡고 담당을 고른다(= 컨펌·담당 지정)
--       → 어드민 5분 크론(app/api/cron/showroom-confirm-sync)이 그 회차를 읽어 예약을 confirmed 로 올리고
--         확정 문자를 한 번 보낸다(lib/server/showroom-compass-confirm.ts).
--
-- 교차 쓰기 0건 그대로다 — 어드민은 crm 에 쓰지 않고(뷰로 읽기만), Compass 는 public 에 쓰지 않는다.
--
-- 1) showroom_bookings 확정 칸
--    * requested_visit_date/time: 고객이 처음 고른 일시. 확정 시각이 다르면 visit_date/time 을 확정 시각으로 바꾸기 전에
--      한 번만 옮겨 둔다(캘린더·가용성은 지금처럼 visit_* 만 읽는다). 확정 전·같은 시각 확정이면 NULL.
--    * compass_demo_id: 이 예약을 확정한 Compass 회차(crm.lead_demos.id). 한 회차가 두 예약을 확정하지 않게 부분 유니크.
--    * confirmation_sent_at: 확정 문자를 보낸(시도한) 시각. 조건부 UPDATE 로 선점해 크론·어드민이 겹쳐도 한 번만 보낸다.
--      결과(성공·실패·시뮬레이션)는 message_logs 에 남는다.
alter table public.showroom_bookings
  add column if not exists requested_visit_date date,
  add column if not exists requested_visit_time text
    check (requested_visit_time is null or requested_visit_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  add column if not exists compass_demo_id integer,
  add column if not exists confirmation_sent_at timestamptz;

create unique index if not exists showroom_bookings_compass_demo_uniq
  on public.showroom_bookings (compass_demo_id)
  where compass_demo_id is not null;

comment on column public.showroom_bookings.requested_visit_date is
  '고객이 처음 신청한 방문일. 확정 시각이 달라 visit_date 를 바꿀 때만 채운다(같으면 NULL).';
comment on column public.showroom_bookings.requested_visit_time is
  '고객이 처음 신청한 방문 시각(KST HH:mm). 확정 시각이 달라 visit_time 을 바꿀 때만 채운다.';
comment on column public.showroom_bookings.compass_demo_id is
  '이 예약을 확정한 Compass 「쇼룸 데모」 회차(crm.lead_demos.id). 어드민에서 직접 확정하면 NULL.';
comment on column public.showroom_bookings.confirmation_sent_at is
  '확정 문자 발송(시도) 시각 — 한 번만 보내는 선점 표식. 결과는 message_logs(source showroom_booking_confirmed).';

-- 2) compass_demos_v 에 회차 시각(at) — 확정 문자에 「몇 시」를 적으려면 날짜(day)만으로는 모자란다.
--    crm.lead_demos.at 은 Compass 가 2026-10-01 에 더한 칸(timestamptz). CREATE OR REPLACE VIEW 는 기존 칸의 이름·순서를
--    바꿀 수 없어 맨 뒤에만 붙인다. 권한은 20260828 과 같다(service_role 만 SELECT).
create or replace view public.compass_demos_v as
select ld.id, ld.lead_id, ld.day, ld.kind, ld.status, ld.owner, ld.source,
       ld.memo, ld.day_approx, ld.bd, ld.created_at, ld.at
from crm.lead_demos ld;

-- 20260914 D) 와 같은 규칙: service_role 도 SELECT 만(자동 갱신 가능한 뷰로 crm 에 쓰지 못하게).
revoke all on public.compass_demos_v from anon, authenticated, service_role;
grant select on public.compass_demos_v to service_role;

notify pgrst, 'reload schema';

-- 되돌리기(필요할 때만):
--   create or replace view 는 칸을 뺄 수 없다 → drop view public.compass_demos_v; 후 20260828 정의로 다시 만든다.
--   drop index if exists public.showroom_bookings_compass_demo_uniq;
--   alter table public.showroom_bookings drop column if exists confirmation_sent_at, drop column if exists compass_demo_id,
--     drop column if exists requested_visit_time, drop column if exists requested_visit_date;
