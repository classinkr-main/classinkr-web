-- CRM 리드 보드 감사(2026-09-07) §7 — 리드 등록의 조회-후-삽입 레이스 방지.
--
-- app/api/admin/leads/route.ts POST 는 findLeadsByContacts(조회) → Promise.allSettled(saveLead)
-- (삽입) 순서로 중복을 막는다. 두 단계 사이에 원자성이 없어, 같은 전화/이메일을 담은 두 요청이
-- 거의 동시에 들어오면(같은 시트를 두 창에서 붙여넣기, 더블클릭, 재시도) 조회 시점엔 둘 다
-- "기존 리드 없음"으로 보여 양쪽 다 삽입을 시도한다 — DB 제약이 없어 실제로 중복 행이 생긴다.
-- lib/repositories/leads.ts 의 saveLead()는 이 마이그레이션 적용을 전제로 unique_violation
-- (Postgres 23505)을 LeadDuplicateError 로 구분해 던지도록 이미 수정돼 있다(서버 측 방어).
-- 이 마이그레이션은 그 방어가 실제로 발동할 마지막 안전망(DB 유니크 제약)을 추가한다.
--
-- 원문 컬럼이 아니라 정규화 표현식에 유니크를 건다 — 앱의 중복 판정 자체가 정규화 기준이라
-- (findLeadsByContacts 주석: "010-1234-5678"과 "01012345678"을 같은 번호로 본다), 원문
-- 컬럼에 그대로 유니크를 걸면 하이픈 유무만 다른 진짜 중복을 통과시켜 버려 이 마이그레이션의
-- 목적(앱이 이미 "중복"이라 판정하는 것을 DB도 같은 기준으로 막는다)을 놓친다.
-- 정규화 규칙은 이 저장소의 다른 곳(Compass 브리지, supabase/migrations/
-- 20260902_compass_leads_v_phone_key_column.sql)이 쓰는 것과 같은 형태(숫자만 남김)를 쓴다.
--
-- CREATE INDEX CONCURRENTLY 는 쓰지 않는다 — 이 저장소의 마이그레이션은 트랜잭션 안에서
-- 실행되는 SQL Editor/CLI로 적용되고, CONCURRENTLY는 트랜잭션 내부에서 금지된다
-- (20260902_leads_dedupe_and_admin_hot_path_indexes.sql 의 같은 결정 참고).
--
-- ⚠️ 적용 전 필수 — 이 저장소 운영 규칙상 이 파일은 작성만 하고 적용은 별도 승인을 받는다.
-- 운영자가 적용하기 전에 반드시 아래 조회로 기존 위반 행이 있는지 확인해야 한다. 지금까지
-- DB 제약이 없었으므로 실제 프로덕션에 이미 정규화 기준 중복이 쌓여 있을 가능성이 높고,
-- 그 상태에서 그대로 적용하면 "could not create unique index ... duplicate key" 로 실패한다.
--
--   -- 정규화된 전화가 겹치는 행 찾기(2건 이상인 그룹만)
--   select regexp_replace(phone, '[^0-9]', '', 'g') as phone_key, array_agg(id) as lead_ids, count(*)
--   from public.leads
--   where phone is not null and regexp_replace(phone, '[^0-9]', '', 'g') <> ''
--   group by 1 having count(*) > 1;
--
--   -- 정규화된 이메일이 겹치는 행 찾기(2건 이상인 그룹만)
--   select lower(trim(email)) as email_key, array_agg(id) as lead_ids, count(*)
--   from public.leads
--   where email is not null and trim(email) <> ''
--   group by 1 having count(*) > 1;
--
-- 위 조회에서 행이 나오면, 이 마이그레이션을 적용하기 전에 운영자가 직접 병합/정리해야 한다
-- (어느 쪽을 정본으로 남길지는 담당자·활동 이력이 있는 쪽을 남기는 등 사람의 판단이 필요하다 —
-- 이 마이그레이션이 자동으로 정리하지 않는다).

create unique index if not exists leads_phone_normalized_key
  on public.leads (regexp_replace(phone, '[^0-9]', '', 'g'))
  where phone is not null and regexp_replace(phone, '[^0-9]', '', 'g') <> '';

create unique index if not exists leads_email_normalized_key
  on public.leads (lower(trim(email)))
  where email is not null and trim(email) <> '';
