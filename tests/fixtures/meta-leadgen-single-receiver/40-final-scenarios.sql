-- META-RECEIVER-FINAL 이식분 검증(합성 데이터). 새 DB 에서: 00 → 20(Compass 전) → 10 → 20 ×2 → 이 파일.
\set ON_ERROR_STOP 1
create or replace function pg_temp.eq(label text, got anyelement, want anyelement) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got % want %', label, got, want; end if;
  raise notice 'ok  %', label;
end $$;

-- ── F1 제출 뷰: 허용 키만, 45일 창, null 유지 ─────────────────────────────
insert into crm.leads (id, name, phone, email) values (21, '가원장', '01000002001', 'a1@example.com'), (22, '나원장', '01000002002', null), (23, '다원장', '01000002003', null);
insert into crm.meta_leadgen_submissions (leadgen_id, lead_id, outcome, via, received_at, form_answers) values
 ('5001', 21, 'created', 'webhook', now() - interval '1 hour',
  '[{"name":"company_name","values":["가나학원"]},{"name":"원생수","values":["120"]},{"name":"Marketing_Consent","values":["yes"]},{"name":"주소","values":["서울 어딘가 1-2"]},{"name":"문의내용","values":["전화 010-0000-9888 로 주세요"]},{"name":"job_title","values":["원장"]}]'),
 ('5002', 22, 'created', 'webhook', now() - interval '1 hour', null),
 ('5003', 23, 'created', 'replay', now() - interval '50 days', '[{"name":"company_name","values":["옛학원"]}]');
insert into crm.meta_webhook_events (leadgen_id, received_at) values ('5001', now() - interval '1 hour'), ('5002', now() - interval '1 hour'), ('5003', now() - interval '50 days');
select pg_temp.eq('F1 allowlist keeps org/size/consent/role in order',
  (select string_agg(a.e->>'name', ',' order by a.ord) from public.compass_meta_submissions_v v, jsonb_array_elements(v.form_answers) with ordinality a(e, ord) where v.leadgen_id = '5001'),
  'company_name,원생수,Marketing_Consent,job_title');
select pg_temp.eq('F1 free text / address dropped', (select position('9888' in form_answers::text) + position('어딘가' in form_answers::text) from public.compass_meta_submissions_v where leadgen_id = '5001'), 0);
select pg_temp.eq('F1 null answers stay null', (select form_answers is null from public.compass_meta_submissions_v where leadgen_id = '5002'), true);
select pg_temp.eq('F1 older than 45d hidden', (select form_answers is null from public.compass_meta_submissions_v where leadgen_id = '5003'), true);
select pg_temp.eq('F1 no FK: submission without crm lead ok', (select count(*) from (select 1) x where exists (select 1)), 1::bigint);
insert into crm.meta_leadgen_submissions (leadgen_id, lead_id, outcome) values ('5099', 99999, 'created');
delete from crm.meta_leadgen_submissions where leadgen_id = '5099';

-- ── F2 증인 RPC ────────────────────────────────────────────────────────────
select pg_temp.eq('F2 record dedupes within payload', public.meta_leadgen_record_receipts('[{"leadgen_id":"6001","page_id":"1","form_id":"9"},{"leadgen_id":"6001"},{"leadgen_id":"6002"}]'::jsonb, 'shadow'), 2);
select pg_temp.eq('F2 redelivery counts', public.meta_leadgen_record_receipts('[{"leadgen_id":"6001"}]'::jsonb, 'compass'), 1);
select pg_temp.eq('F2 deliveries + first mode kept', (select deliveries || mode_at_receipt from public.meta_leadgen_receipts where leadgen_id = '6001'), '2shadow');
do $$ begin
  begin perform public.meta_leadgen_record_receipts('[{"leadgen_id":"abc"}]'::jsonb, 'compass'); raise exception 'FAIL F2 invalid id accepted';
  exception when check_violation then raise notice 'ok  F2 non-numeric id rejected (webhook falls back inline)'; end;
  begin perform public.meta_leadgen_record_receipts('[{"leadgen_id":"6003"}]'::jsonb, 'admin'); raise exception 'FAIL F2 admin mode accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok  F2 admin mode rejected'; end;
end $$;
set role service_role;
do $$ begin
  begin insert into public.meta_leadgen_receipts (leadgen_id, mode_at_receipt) values ('6004', 'compass'); raise exception 'FAIL F2 direct insert allowed';
  exception when insufficient_privilege then raise notice 'ok  F2 service_role direct insert denied'; end;
end $$;
select pg_temp.eq('F2 service_role rpc ok', public.meta_leadgen_record_receipts('[{"leadgen_id":"6005"}]'::jsonb, 'shadow'), 1);
reset role;
set role anon;
do $$ begin
  begin perform public.meta_leadgen_record_receipts('[]'::jsonb, 'shadow'); raise exception 'FAIL F2 anon executes';
  exception when insufficient_privilege then raise notice 'ok  F2 anon denied'; end;
end $$;
reset role;

-- ── F3 스위치: 함수로만, actor·이력, 옵션 검증 ─────────────────────────────
set role service_role;
do $$ begin
  begin update public.meta_leadgen_cutover set mode = 'compass'; raise exception 'FAIL F3 direct update allowed';
  exception when insufficient_privilege then raise notice 'ok  F3 service_role direct update denied'; end;
end $$;
select (public.meta_leadgen_set_mode('shadow', 'svc', 'F3 서비스 역할로 전환')).mode;
reset role;
select public.meta_leadgen_set_options('{"side_effects":{"externalForwards":false},"fallback_after_minutes":60}'::jsonb, 'tester', 'F3 옵션');
select pg_temp.eq('F3 side_effects merged', (select (side_effects->>'externalForwards') || (side_effects->>'leadCreatedNotification') || fallback_after_minutes from public.meta_leadgen_cutover), 'falsetrue60');
do $$ begin
  begin perform public.meta_leadgen_set_options('{"oops":1}'::jsonb, 'tester'); raise exception 'FAIL F3 unknown key';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok  F3 unknown key rejected'; end;
  begin perform public.meta_leadgen_set_options('{"side_effects":{"externalForwards":"no"}}'::jsonb, 'tester'); raise exception 'FAIL F3 non-boolean';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok  F3 non-boolean toggle rejected'; end;
  begin perform public.meta_leadgen_set_options('{"fallback_after_minutes":10}'::jsonb, 'tester'); raise exception 'FAIL F3 fallback 10';
  exception when check_violation then raise notice 'ok  F3 fallback range enforced'; end;
  begin perform public.meta_leadgen_set_mode('admin', '  '); raise exception 'FAIL F3 blank actor';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok  F3 blank actor rejected'; end;
  begin perform public.meta_leadgen_set_mode('compass', 'tester', 'x', now() - interval '3 days'); raise exception 'FAIL F3 mirror_since 3d';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok  F3 mirror_since bound enforced'; end;
end $$;
select public.meta_leadgen_set_options('{"side_effects":{"externalForwards":true},"fallback_after_minutes":120}'::jsonb, 'tester', 'F3 되돌림');
select pg_temp.eq('F3 history kinds', (select string_agg(kind, ',' order by id) from public.meta_leadgen_cutover_history), 'mode,options,options');

-- ── F4 폴백: 선점 조건·미러와의 경합·결과 ─────────────────────────────────
select (public.meta_leadgen_set_mode('compass', 'tester', 'F4 컷오버')).mode;
insert into crm.meta_leadgen_submissions (leadgen_id, lead_id, outcome, via, received_at) values ('3002', 21, 'created', 'webhook', now() - interval '3 hours');
insert into crm.meta_webhook_events (leadgen_id, received_at) values ('3002', now() - interval '3 hours'), ('3004', now() - interval '3 hours');
insert into crm.lead_refs (lead_id, system, external_id, matched_by) values (21, 'meta_leadgen', '3004', 'webhook');
insert into public.meta_leadgen_receipts (leadgen_id, first_received_at, mode_at_receipt) values
  ('3001', now() - interval '3 hours', 'compass'),   -- Compass 흔적 없음 → 폴백
  ('3002', now() - interval '3 hours', 'compass'),   -- 제출 행 있음 → 아님
  ('3003', now() - interval '30 minutes', 'compass'),-- 기한 전 → 아님
  ('3004', now() - interval '3 hours', 'compass'),   -- 링크만 있음 → 아님
  ('3005', now() - interval '3 hours', 'shadow'),    -- shadow 수신(어드민이 이미 저장) → 아님
  ('3006', now() - interval '10 days', 'compass'),   -- 폴백 창(7일) 밖 → 아님, 그러나 유실 위험으로 센다
  ('3007', now() - interval '4 hours', 'compass'),   -- 실패 경로
  ('3008', now() - interval '5 hours', 'compass'),   -- 저장 뒤 마무리 전에 죽은 경로
  ('3009', now() - interval '6 hours', 'compass');   -- 멈춘 선점 재시도 → 60초 중복
select pg_temp.eq('F4 claim set', (select string_agg(out_leadgen_id, ',' order by out_leadgen_id) from public.meta_lead_fallback_claim(20)), '3001,3007,3008,3009');
select pg_temp.eq('F4 claim again empty', (select count(*) from public.meta_lead_fallback_claim(20)), 0::bigint);
select pg_temp.eq('F4 at_risk counts nowhere-saved', (public.meta_lead_mirror_health()->>'at_risk')::int, 5);  -- 3001·3006·3007·3008·3009

-- Compass 가 늦게 3001 을 저장 → 폴백 진행 중에는 미러가 넣지 않는다
insert into crm.meta_leadgen_submissions (leadgen_id, lead_id, outcome, via, received_at) values ('3001', 22, 'created', 'replay', now() - interval '1 minute');
select pg_temp.eq('F4 mirror waits for pending fallback', (select out_action from public.meta_lead_mirror_apply(jsonb_build_array(
  jsonb_build_object('leadgen_id','3001','compass_lead_id',22,'received_at',now() - interval '1 minute','name','나원장','message',E'Meta Lead Ads\nleadgen_id=3001')))), 'exists_fallback_pending');
select pg_temp.eq('F4 no mirror row yet', (select count(*) from public.leads where message like '%leadgen_id=3001%'), 0::bigint);
-- 폴백이 submitLeadCapture 로 저장했다(흉내) → finish
insert into public.leads (source, name, message) values ('meta_lead_ads', '나원장', E'Meta Lead Ads\nleadgen_id=3001\npage_id=1');
select pg_temp.eq('F4 finish inserted', public.meta_lead_fallback_finish('3001', 'inserted', (select id from public.leads where message like '%leadgen_id=3001%'), null), 'inserted');
select pg_temp.eq('F4 mirror after fallback: exists', (select out_action from public.meta_lead_mirror_apply(jsonb_build_array(
  jsonb_build_object('leadgen_id','3001','compass_lead_id',22,'received_at',now() - interval '1 minute','name','나원장','message',E'Meta Lead Ads\nleadgen_id=3001')))), 'exists_inserted');
select pg_temp.eq('F4 one row, compass link filled', (select count(*)::text || ':' || max(l.compass_lead_id)::text from public.leads p join public.meta_lead_mirror_ledger l on l.leadgen_id = '3001' where p.message like '%leadgen_id=3001%'), '1:22');

-- 3007 실패 → 대기 → 재선점 → 또 실패 → Compass 저장 → 미러가 넘겨받음
select pg_temp.eq('F5 finish failed', public.meta_lead_fallback_finish('3007', 'failed', null, 'graph 190'), 'fallback_failed');
select pg_temp.eq('F5 backoff ~10m', (select next_attempt_at between now() + interval '9 minutes' and now() + interval '11 minutes' from public.meta_lead_mirror_ledger where leadgen_id = '3007'), true);
select pg_temp.eq('F5 not due yet', (select count(*) from public.meta_lead_fallback_claim(20)), 0::bigint);
update public.meta_lead_mirror_ledger set next_attempt_at = now() - interval '1 minute' where leadgen_id = '3007';
select pg_temp.eq('F5 due → reclaimed attempt 2', (select string_agg(out_leadgen_id || '#' || out_attempt, ',') from public.meta_lead_fallback_claim(20)), '3007#2');
select pg_temp.eq('F5 finish failed again', public.meta_lead_fallback_finish('3007', 'failed', null, 'graph 190'), 'fallback_failed');
select pg_temp.eq('F5 backoff ~20m', (select next_attempt_at between now() + interval '19 minutes' and now() + interval '21 minutes' from public.meta_lead_mirror_ledger where leadgen_id = '3007'), true);
insert into crm.meta_leadgen_submissions (leadgen_id, lead_id, outcome, via, received_at) values ('3007', 23, 'created', 'replay', now() - interval '1 minute');
select pg_temp.eq('F5 mirror takes over failed fallback', (select out_action from public.meta_lead_mirror_apply(jsonb_build_array(
  jsonb_build_object('leadgen_id','3007','compass_lead_id',23,'received_at',now() - interval '1 minute','name','다원장','message',E'Meta Lead Ads\nleadgen_id=3007')))), 'inserted');
select pg_temp.eq('F5 ledger now compass_mirror/inserted', (select origin || '/' || state from public.meta_lead_mirror_ledger where leadgen_id = '3007'), 'compass_mirror/inserted');
select pg_temp.eq('F5 finish on taken-over row is not_pending', public.meta_lead_fallback_finish('3007', 'failed', null, 'late'), 'not_pending');

-- 3008 저장은 됐는데 finish 전에 죽음 → 다음 선점이 adopt 로 바로잡고 다시 잡지 않는다
insert into public.leads (source, name, message) values ('meta_lead_ads', '라원장', E'Meta Lead Ads\nleadgen_id=3008');
update public.meta_lead_mirror_ledger set updated_at = now() - interval '20 minutes' where leadgen_id in ('3008', '3009');
select pg_temp.eq('F6 stale pending: only 3009 reclaimed', (select string_agg(out_leadgen_id || '#' || out_attempt, ',') from public.meta_lead_fallback_claim(20)), '3009#2');
select pg_temp.eq('F6 3008 adopted as fallback insert', (select origin || '/' || state || '/' || (public_lead_id is not null)::text from public.meta_lead_mirror_ledger where leadgen_id = '3008'), 'admin_fallback/inserted/true');
select pg_temp.eq('F6 deduped → skipped', public.meta_lead_fallback_finish('3009', 'deduped'), 'skipped');
do $$ begin
  begin perform public.meta_lead_fallback_finish('3009', 'inserted', null); raise exception 'FAIL F6 inserted without id';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok  F6 inserted requires id'; end;
end $$;
select pg_temp.eq('F6 at_risk only 3006 left', (public.meta_lead_mirror_health()->>'at_risk')::int, 1);
select pg_temp.eq('F6 admin_only_saved = 3008', (public.meta_lead_mirror_health()->>'admin_only_saved')::int, 1);
select pg_temp.eq('F6 no duplicate leadgens', (public.meta_lead_mirror_health()->>'h4_duplicate_leadgens_with_mirror')::int, 0);
-- 사람이 풀 수 없다고 확인한 수신은 원장에 skipped 로 닫는다(SQL Editor)
insert into public.meta_lead_mirror_ledger (leadgen_id, origin, state, last_error, received_at)
values ('3006', 'admin_fallback', 'skipped', 'unrecoverable — Meta 리드 센터에서도 없음(사람 확인)', now() - interval '10 days');
select pg_temp.eq('F6 at_risk 0 after human close', (public.meta_lead_mirror_health()->>'at_risk')::int, 0);

-- ── F7 Compass 가 읽는 건강 뷰·권한(운영 Compass 롤 = postgres 소유자. 스텁은 별도 롤로 grant 규칙을 확인) ──
grant select on public.home_meta_receiver_health_v, public.home_meta_leadgen_receipts_v to compass_app;
set role compass_app;
-- 로컬 확인: 뷰가 부르는 함수의 execute 권한은 **뷰를 읽는 롤**에게 필요하다(count(*) 처럼 함수를 평가하지 않는 조회만 통과).
-- 운영 Compass 롤(postgres)은 함수 소유자라 해당 없음. 다른 롤로 붙는다면 grant execute 가 필요하다 — 런북 P2 확인 항목.
do $$ begin
  begin perform mode from public.home_meta_receiver_health_v; raise exception 'FAIL F7 function evaluated without execute';
  exception when insufficient_privilege then raise notice 'ok  F7 reader role needs execute on health function'; end;
end $$;
reset role;
grant execute on function public.meta_lead_mirror_health() to compass_app;
\i 15-compass-statements.sql
set role compass_app;
select coalesce(stale_minutes, -1) as stale, mode, at_risk from public.home_meta_receiver_health_v \gset h_
reset role;
select pg_temp.eq('F7 compass reads mode', :'h_mode'::text, 'compass'::text);
select pg_temp.eq('F7 no heartbeat yet', :'h_stale'::int, -1);
update public.meta_lead_mirror_state set last_run_at = now() - interval '40 minutes', last_run_status = 'ok';
set role compass_app;
select stale_minutes as stale2 from public.home_meta_receiver_health_v \gset h_
execute w2_write('compass');
reset role;
select pg_temp.eq('F7 stale minutes', :'h_stale2'::int, 40);
select pg_temp.eq('F7 sticky expectation stored in crm', (select hash from crm.sync_state where key = 'meta_receiver_mode'), 'compass');
revoke select on public.home_meta_receiver_health_v from compass_app;
set role compass_app;
select health as w0_health, receipts as w0_receipts from (select coalesce(has_table_privilege(to_regclass('public.home_meta_receiver_health_v'), 'select'), false) as health,
       coalesce(has_table_privilege(to_regclass('public.home_meta_leadgen_receipts_v'), 'select'), false) as receipts) x \gset
reset role;
select pg_temp.eq('F7 probe reports denied as false (no exception)', :'w0_health'::boolean, false);
select pg_temp.eq('F7 receipts probe true', :'w0_receipts'::boolean, true);

-- ── F8 Compass 증인 공백 가져오기(crm 만 쓴다, 한 번만) ────────────────────
insert into crm.meta_webhook_events (leadgen_id, received_at) values ('3001', now()), ('3007', now());
insert into crm.meta_webhook_events (leadgen_id, received_at) values ('4004', now() - interval '3 hours');
insert into crm.meta_leadgen_failures (leadgen_id, lead_specific, first_seen_at) values ('4005', true, now() - interval '3 hours');
insert into public.meta_leadgen_receipts (leadgen_id, first_received_at, mode_at_receipt) values
  ('4001', now() - interval '3 hours', 'compass'), ('4002', now() - interval '3 hours', 'shadow'),
  ('4003', now() - interval '10 minutes', 'compass'), ('4004', now() - interval '3 hours', 'compass'),
  ('4005', now() - interval '3 hours', 'compass'), ('4006', now() - interval '100 days', 'compass');
set role compass_app;
execute w3(50);
do $$ begin
  begin insert into public.meta_leadgen_receipts (leadgen_id, mode_at_receipt) values ('4999', 'compass'); raise exception 'FAIL F8 compass wrote public';
  exception when insufficient_privilege then raise notice 'ok  F8 compass role cannot write public'; end;
end $$;
reset role;
-- 기대: compass 모드 · 15분 지남 · 89일 안 · 표식/보관/이전 가져오기 없음 → 3003(30분)·3006(10일)·3008·3009·4001
select pg_temp.eq('F8 imported set', (select string_agg(leadgen_id, ',' order by leadgen_id) from crm.meta_leadgen_gap_imports), '3003,3006,3008,3009,4001');
select pg_temp.eq('F8 failures rows are replayable', (select count(*) from crm.meta_leadgen_failures where not lead_specific and message like 'witness_gap%'), 5::bigint);
set role compass_app;
execute w3(50);
reset role;
select pg_temp.eq('F8 rerun imports nothing', (select count(*) from crm.meta_leadgen_gap_imports), 5::bigint);
delete from crm.meta_leadgen_failures where leadgen_id = '4001';  -- 사람이 보관 행을 지움
set role compass_app;
execute w3(50);
reset role;
select pg_temp.eq('F8 human-deleted row not re-imported', (select count(*) from crm.meta_leadgen_failures where leadgen_id = '4001'), 0::bigint);

-- ── F9 롤백 뒤에도 compass 구간 증인은 폴백이 끝까지 ─────────────────────
select (public.meta_leadgen_set_mode('admin', 'tester', 'F9 롤백')).mode;
insert into public.meta_leadgen_receipts (leadgen_id, first_received_at, mode_at_receipt) values ('3010', now() - interval '3 hours', 'compass');
-- 3010 과 F8 에서 넣은 4001·4004·4005(어드민 뷰로 보면 Compass 제출·링크 없음)도 폴백 대상이다
select pg_temp.eq('F9 claim works in admin mode', (select string_agg(out_leadgen_id, ',' order by out_leadgen_id) from public.meta_lead_fallback_claim(20)), '3010,4001,4004,4005');
select pg_temp.eq('F9 at_risk visible in admin mode (pending counts)', (public.meta_lead_mirror_health()->>'mode') || ':' || (public.meta_lead_mirror_health()->>'h1_receipts_missing_in_compass_2h'), 'admin:7');
\echo 'ALL FINAL SCENARIOS PASSED'
