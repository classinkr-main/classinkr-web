-- 설계 B-mirror 로컬 검증 시나리오(합성 데이터) — FINAL 마이그레이션에 대한 회귀. 실패하면 exception 으로 멈춘다.
\set ON_ERROR_STOP 1
create or replace function pg_temp.eq(label text, got anyelement, want anyelement) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got % want %', label, got, want; end if;
  raise notice 'ok  %', label;
end $$;

-- 행 빌더(앱이 만드는 payload 흉내 — 필드 매핑은 앱 몫)
create or replace function pg_temp.row(lg text, lead int, recv timestamptz, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('leadgen_id', lg, 'compass_lead_id', lead, 'received_at', recv,
    'name', '홍길동', 'org', '가나학원', 'size', '120', 'phone', '01000005777', 'email', 'a@example.com',
    'message', E'Meta Lead Ads\nleadgen_id=' || lg || E'\npage_id=1\nform_id=9', 'utm_source', 'meta', 'utm_medium', 'lead_ads') || extra
$$;

-- T1 admin 모드: 미러 창 없음 → 아무 것도 안 한다
select pg_temp.eq('T1 admin apply no-op', (select count(*) from public.meta_lead_mirror_apply(jsonb_build_array(pg_temp.row('9001', 1, now())))), 0::bigint);
select pg_temp.eq('T1 eligible false', public.meta_lead_mirror_eligible((select c from public.meta_leadgen_cutover c), now()), false);

-- T3 잘못된 전이
do $$ begin
  begin perform public.meta_leadgen_set_mode('compass', 'tester'); raise exception 'FAIL T3 admin→compass allowed';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok  T3 admin→compass rejected'; end;
end $$;

-- 전환 전 어드민 웹훅 행: 1001 재시도 중복 2행, 1002 Graph 실패 껍데기(연락처 없음)
insert into public.leads (source, name, phone, message, created_at) values
  ('meta_lead_ads', '김원장', '010-0000-1222', E'Meta Lead Ads\nleadgen_id=1001\npage_id=1\nform_id=9', now() - interval '61 minutes'),
  ('meta_lead_ads', '김원장', '010-0000-1222', E'Meta Lead Ads\nleadgen_id=1001\npage_id=1\nform_id=9', now() - interval '60 minutes'),
  ('meta_lead_ads', null, null, E'Meta Lead Ads\nleadgen_id=1002\npage_id=1\nform_id=9', now() - interval '50 minutes'),
  ('contact_page', '웹문의', '010-0000-3444', 'hello', now() - interval '20 minutes');

-- T2 shadow
select public.meta_leadgen_set_mode('shadow', 'tester', '콘솔 확인 완료');
select pg_temp.eq('T2 shadow apply no-op', (select count(*) from public.meta_lead_mirror_apply(jsonb_build_array(pg_temp.row('9001', 1, now())))), 0::bigint);
do $$ begin
  begin perform public.meta_leadgen_set_mode('shadow', 'tester'); raise exception 'FAIL T3b same mode allowed';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok  T3b same-mode rejected'; end;
end $$;

-- T4 컷오버(mirror_since = 2시간 전)
select public.meta_leadgen_set_mode('compass', 'tester', '컷오버', now() - interval '2 hours');
create temp table t4 as
select * from public.meta_lead_mirror_apply(jsonb_build_array(
  pg_temp.row('1001', 11, now() - interval '61 minutes'),
  pg_temp.row('1002', 12, now() - interval '50 minutes'),
  pg_temp.row('1003', 13, now() - interval '3 hours'),
  pg_temp.row('1004', 14, now() - interval '10 minutes'),
  pg_temp.row('1005', 14, now() - interval '5 minutes', '{"email": "b@example.com"}'),
  pg_temp.row('abc', 14, now())
));
select pg_temp.eq('T4 1001 adopted', (select out_action from t4 where out_leadgen_id = '1001'), 'exists_adopted');
select pg_temp.eq('T4 1001 adopted first row', (select public_lead_id from public.meta_lead_mirror_ledger where leadgen_id = '1001'),
                  (select id from public.leads where message like '%leadgen_id=1001%' order by created_at limit 1));
select pg_temp.eq('T4 1002 adopted shell', (select out_action from t4 where out_leadgen_id = '1002'), 'exists_adopted');
select pg_temp.eq('T4 1003 outside', (select out_action from t4 where out_leadgen_id = '1003'), 'outside_window');
select pg_temp.eq('T4 1004 inserted', (select out_action from t4 where out_leadgen_id = '1004'), 'inserted');
select pg_temp.eq('T4 1005 inserted', (select out_action from t4 where out_leadgen_id = '1005'), 'inserted');
select pg_temp.eq('T4 invalid', (select out_action from t4 where out_leadgen_id = 'abc'), 'invalid');
select pg_temp.eq('T4 rows 1004', (select count(*) from public.leads where message like '%leadgen_id=1004%'), 1::bigint);
select pg_temp.eq('T4 created_at=received_at',
  (select abs(extract(epoch from (p.created_at - l.received_at))) < 0.001 from public.leads p join public.meta_lead_mirror_ledger l on l.public_lead_id = p.id where l.leadgen_id = '1004'), true);
select pg_temp.eq('T4 status new / unconfirmed', (select status || coalesce(confirmed_at::text, '-') from public.leads p join public.meta_lead_mirror_ledger l on l.public_lead_id = p.id where l.leadgen_id = '1004'), 'new-');
select pg_temp.eq('T4 contact_page untouched', (select count(*) from public.meta_lead_mirror_ledger l join public.leads p on p.id = l.public_lead_id where p.source <> 'meta_lead_ads'), 0::bigint);

-- T5 같은 payload 재적용 → 멱등
select pg_temp.eq('T5 idempotent', (select string_agg(out_action, ',' order by out_leadgen_id) from public.meta_lead_mirror_apply(jsonb_build_array(
  pg_temp.row('1004', 14, now() - interval '10 minutes'), pg_temp.row('1005', 14, now() - interval '5 minutes')))), 'exists_inserted,exists_inserted');
select pg_temp.eq('T5 no new rows', (select count(*) from public.leads where source = 'meta_lead_ads'), 5::bigint);

-- T6 어드민에서 미러 행 삭제 → 되살리지 않는다
delete from public.leads where id = (select public_lead_id from public.meta_lead_mirror_ledger where leadgen_id = '1004');
-- FINAL: 원장에 FK 가 없으므로 public_lead_id 는 지워진 id 를 그대로 가리킨다. 되살리지 않는 것만 본다
select pg_temp.eq('T6 not resurrected', (select out_action from public.meta_lead_mirror_apply(jsonb_build_array(pg_temp.row('1004', 14, now() - interval '10 minutes')))), 'exists_inserted');
select pg_temp.eq('T6 no row for 1004', (select count(*) from public.leads where message like '%leadgen_id=1004%'), 0::bigint);

-- T7 20260910 연락처 유니크 인덱스가 적용된 상태 → blocked(원장 남김) → 인덱스 제거 뒤 재시도 성공
-- (합성 데이터의 기존 중복 행 때문에 실제 식 대신 같은 번호만 막는 부분 유니크 인덱스로 위반 경로를 흉내 낸다)
create unique index leads_phone_normalized_key on public.leads (regexp_replace(phone, '[^0-9]', '', 'g'))
  where phone = '01000005777';
select pg_temp.eq('T7 blocked', (select out_action from public.meta_lead_mirror_apply(jsonb_build_array(pg_temp.row('1006', 14, now() - interval '4 minutes')))), 'blocked');
select pg_temp.eq('T7 ledger blocked', (select state from public.meta_lead_mirror_ledger where leadgen_id = '1006'), 'blocked');
select pg_temp.eq('T7 health blocked', (public.meta_lead_mirror_health()->>'h3_blocked')::int, 1);
drop index leads_phone_normalized_key;
select pg_temp.eq('T7 retry inserted', (select out_action from public.meta_lead_mirror_apply(jsonb_build_array(pg_temp.row('1006', 14, now() - interval '4 minutes')))), 'inserted');
select pg_temp.eq('T7 attempts', (select attempts from public.meta_lead_mirror_ledger where leadgen_id = '1006'), 2);

-- T8 Compass 리드가 지워져 신원을 못 만드는 제출 → skipped(원장 남김)
select pg_temp.eq('T8 skipped', (select out_action from public.meta_lead_mirror_apply(jsonb_build_array(pg_temp.row('1011', null, now() - interval '3 minutes', '{"skip_reason": "compass_lead_deleted"}')))), 'skipped');

-- T10 경합으로 어드민 웹훅 행이 미러 뒤에 또 생김 → H4 가 잡는다
insert into public.leads (source, name, message, created_at) values ('meta_lead_ads', '홍길동', E'Meta Lead Ads\nleadgen_id=1005\npage_id=1', now());
select pg_temp.eq('T10 duplicate detected', (public.meta_lead_mirror_health()->>'h4_duplicate_leadgens_with_mirror')::int, 1);

-- T11 수신 증인 · T12 밀림 · T16 링크만 있음
insert into crm.leads (id, name, phone) values (14, '홍길동', '01000005777'), (15, '박원장', '01000006888');
insert into crm.meta_leadgen_submissions (leadgen_id, lead_id, outcome, received_at) values
  ('1004', 14, 'created', now() - interval '10 minutes'),
  ('1008', 15, 'created', now() - interval '40 minutes');
insert into crm.lead_refs (lead_id, system, external_id, matched_by) values (15, 'meta_leadgen', '1012', 'webhook');
insert into crm.meta_leadgen_failures (leadgen_id, lead_specific, first_seen_at) values ('2002', false, now() - interval '3 hours');
insert into public.meta_leadgen_receipts (leadgen_id, first_received_at, mode_at_receipt) values
  ('2001', now() - interval '3 hours', 'compass'),   -- Compass 어디에도 없음
  ('2002', now() - interval '3 hours', 'compass'),   -- Compass 실패 보관에 있음
  ('1004', now() - interval '3 hours', 'compass'),   -- 제출 있음
  ('1012', now() - interval '3 hours', 'compass'),   -- 링크만 있음
  ('2003', now() - interval '30 minutes', 'compass');-- 아직 2시간 안
select public.meta_lead_mirror_health();  -- 오류 없이 도는지(뷰 있는 상태에서 재확인은 아래)
select pg_temp.eq('T11 h1 missing in compass', (public.meta_lead_mirror_health()->>'h1_receipts_missing_in_compass_2h')::int, 2);
select pg_temp.eq('T11 h1b explained by failures', (public.meta_lead_mirror_health()->>'h1b_receipts_in_compass_failures_2h')::int, 1);
select pg_temp.eq('T12 h2 backlog', (public.meta_lead_mirror_health()->>'h2_mirror_backlog_30m')::int, 1);
select pg_temp.eq('T16 h5 refs without submission', (public.meta_lead_mirror_health()->>'h5_refs_without_submission')::int, 1);

-- T13 롤백: compass → admin. 끝나기 전·끝난 뒤 10분 안 제출은 잔여분으로 계속 미러, 그 뒤는 창 밖(어드민 웹훅이 다시 받음)
select public.meta_leadgen_set_mode('admin', 'tester', '롤백');
select pg_temp.eq('T13 ended set', (select compass_ended_at is not null and mode = 'admin' from public.meta_leadgen_cutover), true);
select pg_temp.eq('T13 drain before end', (select out_action from public.meta_lead_mirror_apply(jsonb_build_array(pg_temp.row('1009', 15, now() - interval '1 minute')))), 'inserted');
select pg_temp.eq('T13 drain within 10m', (select out_action from public.meta_lead_mirror_apply(jsonb_build_array(pg_temp.row('1013', 15, now() + interval '5 minutes')))), 'inserted');
select pg_temp.eq('T13 after drain window', (select out_action from public.meta_lead_mirror_apply(jsonb_build_array(pg_temp.row('1010', 15, now() + interval '20 minutes')))), 'outside_window');

-- T14 다시 shadow → compass(새 mirror_since, 이전 원장은 유지)
select public.meta_leadgen_set_mode('shadow', 'tester');
select public.meta_leadgen_set_mode('compass', 'tester', '재컷오버');
select pg_temp.eq('T14 history rows', (select count(*) from public.meta_leadgen_cutover_history where kind = 'mode'), 5::bigint);
select pg_temp.eq('T14 re-cutover keeps ledger', (select out_action from public.meta_lead_mirror_apply(jsonb_build_array(pg_temp.row('1009', 15, now() - interval '1 minute')))), 'exists_inserted');

-- T15 권한
set role anon;
do $$ begin
  begin perform public.meta_lead_mirror_apply('[]'::jsonb); raise exception 'FAIL T15 anon can execute';
  exception when insufficient_privilege then raise notice 'ok  T15 anon denied'; end;
  begin perform 1 from public.meta_lead_mirror_ledger; raise exception 'FAIL T15 anon can read ledger';
  exception when insufficient_privilege then raise notice 'ok  T15 anon ledger denied'; end;
end $$;
reset role;
set role service_role;
select pg_temp.eq('T15 service_role health', (public.meta_lead_mirror_health()->>'mode'), 'compass');
reset role;
\echo 'ALL SCENARIOS PASSED'
