-- 하드웨어 샘플 유닛 — '전시·사내 사용'(showroom) 상태와 showcase·store 이벤트를 추가한다.
--
-- ── 왜 필요한가 (운영자 결정 2026-09-15) ─────────────────────────────────────────────
-- 클래스인 사무실·샘플 재고 풀을 유닛(관리번호) 기준으로 센다. 사무실 보관(office)이 가용이고,
-- 대여(loaned)가 나간 샘플이다. 시트는 샘플이 사무실에서 나갔는지 기록하지 않으므로 원장 수량은
-- 교차 확인용으로만 쓴다.
-- 그런데 쇼룸 전시·KC인증처럼 사무실에 있지만 쓰는 중인 유닛을 넣을 상태가 없었다. 기존 status
-- 값(office/loaned/repair/converted/retired)으로는 가용(office)에 넣거나 대여(loaned)로 둘 수밖에
-- 없어, 운영 유닛 33대가 전부 loaned 로 남았다(2026-09-14 실측 — "클래스인 쇼룸" 2대,
-- "클래스인 (KC인증)" 1대 포함).
--
-- ── 계약 ─────────────────────────────────────────────────────────────────────────────
--  1. hardware_sample_units.status 에 'showroom' 을 더한다 — 사무실이 보유하지만 가용이 아니다.
--  2. hardware_sample_events.event_type 에 두 값을 더한다.
--       showcase = 사무실 보관(office) → 전시·사내 사용(showroom)
--       store    = 전시·사내 사용(showroom)·수리(repair) → 사무실 보관(office)
--  3. 전이 규칙은 앱이 강제한다(lib/repositories/hardware-samples.ts SAMPLE_EVENT_TRANSITIONS).
--     DB 는 값 집합만 막는다. 전시 중인 유닛을 바로 대여(loan)하는 것은 앱이 막는다 — 먼저 store 로
--     사무실 보관으로 옮긴다.
--  4. 데이터는 바꾸지 않는다. 값 집합을 넓히기만 하므로 기존 행은 새 제약을 그대로 통과한다.
--
-- ── 제약 이름 ────────────────────────────────────────────────────────────────────────
-- 20260727_hardware_sample_tracking.sql 은 컬럼 인라인 check 라 이름이 자동으로 생성됐다.
-- 운영 카탈로그(pg_constraint, 2026-09-15 SELECT)의 실제 이름은 아래 두 개다.
--   hardware_sample_units_status_check      CHECK (status = ANY (ARRAY['office', 'loaned', 'repair', 'converted', 'retired']))
--   hardware_sample_events_event_type_check CHECK (event_type = ANY (ARRAY['assign', 'loan', 'return', 'repair', 'convert', 'adjust', 'memo', 'retire']))
-- 같은 이름으로 다시 만든다. 다음 마이그레이션도 이름으로 찾을 수 있다.
-- drop 과 add 를 한 ALTER TABLE 문에 넣는다. 문 하나가 원자적이라 제약이 없는 틈이 생기지 않는다.
-- 다시 실행해도 안전하다(drop if exists 후 재생성).
--
-- ── 롤백 ─────────────────────────────────────────────────────────────────────────────
-- showroom 유닛이나 showcase·store 이벤트가 하나라도 남아 있으면 옛 제약을 다시 걸 때 실패한다.
-- 먼저 데이터를 옛 값으로 되돌린 뒤 제약을 되돌린다. 이벤트는 이력이므로 지우지 않고 adjust 로 바꿔
-- 보존한다.
--
--   update public.hardware_sample_units set status = 'office' where status = 'showroom';
--   update public.hardware_sample_events
--      set memo = concat_ws(' · ', memo, '롤백 전 유형: ' || event_type),
--          event_type = 'adjust'
--    where event_type in ('showcase', 'store');
--   alter table public.hardware_sample_units
--     drop constraint if exists hardware_sample_units_status_check,
--     add constraint hardware_sample_units_status_check
--       check (status in ('office', 'loaned', 'repair', 'converted', 'retired'));
--   alter table public.hardware_sample_events
--     drop constraint if exists hardware_sample_events_event_type_check,
--     add constraint hardware_sample_events_event_type_check
--       check (event_type in ('assign', 'loan', 'return', 'repair', 'convert', 'adjust', 'memo', 'retire'));
--
-- 앱을 먼저 되돌리지 않으면 전시 액션은 "전시 상태는 DB 업데이트 적용 후 사용할 수 있습니다."로 실패한다
-- (저장소가 check 위반 23514 를 이 문구로 바꾼다). 그 밖의 샘플 기능은 영향이 없다.

alter table public.hardware_sample_units
  drop constraint if exists hardware_sample_units_status_check,
  add constraint hardware_sample_units_status_check
    check (status in ('office', 'showroom', 'loaned', 'repair', 'converted', 'retired'));

alter table public.hardware_sample_events
  drop constraint if exists hardware_sample_events_event_type_check,
  add constraint hardware_sample_events_event_type_check
    check (event_type in ('assign', 'loan', 'return', 'showcase', 'store', 'repair', 'convert', 'adjust', 'memo', 'retire'));

comment on column public.hardware_sample_units.status is
  'office=사무실 보관(가용) · showroom=전시·사내 사용(사무실 보유, 가용 아님) · loaned=대여(나간 샘플) · repair=수리 · converted=판매 전환 · retired=폐기';

comment on column public.hardware_sample_events.event_type is
  'assign=등록·배정 · loan=대여 · return=반환 · showcase=전시로(office→showroom) · store=사무실 보관으로(showroom·repair→office) · repair · convert · adjust=정정 · memo · retire';
