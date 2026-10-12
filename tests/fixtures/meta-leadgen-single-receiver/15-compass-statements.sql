-- [Compass 소유] lib/metaReceiverWitness.ts 의 SQL 상수(순수 문자열) 검증본. 쓰는 곳은 crm 만.
-- :lim 은 psql 변수(앱에서는 $1).

-- W0 뷰 확인 — 캐시하지 않는다(매시 한 번). 없음·권한 없음은 false(예외 없음)
prepare w0 as
select coalesce(has_table_privilege(to_regclass('public.home_meta_leadgen_receipts_v'), 'select'), false) as receipts,
       coalesce(has_table_privilege(to_regclass('public.home_meta_receiver_health_v'), 'select'), false) as health;

-- W1 건강 한 줄
prepare w1 as
select mode, stale_minutes, at_risk, admin_only_saved, mirror_backlog_30m from public.home_meta_receiver_health_v;

-- W2 기대 표식 읽기/쓰기 — 한 번이라도 shadow·compass 를 본 뒤에는 뷰를 못 읽는 것이 실패다
prepare w2_read as
select hash from crm.sync_state where key = 'meta_receiver_mode';
prepare w2_write(text) as
insert into crm.sync_state (key, hash, updated_at) values ('meta_receiver_mode', $1, now())
on conflict (key) do update set hash = excluded.hash, updated_at = now();

-- W3 증인 공백 가져오기 — compass 모드 수신 중 15분 지나도(89일 안) 표식·보관·이전 가져오기에 없는 leadgen → 실패 보관(lead_specific=false)
--     기존 매시 재처리(90일)·overdue(2시간) 경보가 그대로 처리한다. 한 leadgen 은 한 번만 가져온다(gap_imports).
prepare w3(int) as
with cand as (
  select r.leadgen_id, r.page_id, r.form_id
    from public.home_meta_leadgen_receipts_v r
   where r.mode_at_receipt = 'compass'
     and r.leadgen_id ~ '^[0-9]+$'
     and r.first_received_at <= now() - interval '15 minutes'
     and r.first_received_at >= now() - interval '89 days'
     and not exists (select 1 from crm.meta_webhook_events e where e.leadgen_id = r.leadgen_id)
     and not exists (select 1 from crm.meta_leadgen_failures f where f.leadgen_id = r.leadgen_id)
     and not exists (select 1 from crm.meta_leadgen_gap_imports g where g.leadgen_id = r.leadgen_id)
   order by r.first_received_at, r.leadgen_id
   limit $1
), mark as (
  insert into crm.meta_leadgen_gap_imports (leadgen_id, source)
  select leadgen_id, 'witness' from cand
  on conflict (leadgen_id) do nothing
  returning leadgen_id
)
insert into crm.meta_leadgen_failures (leadgen_id, message, page_id, form_id, lead_specific)
select c.leadgen_id, 'witness_gap — 어드민 수신 증인에만 있음(Compass 웹훅 미수신)', c.page_id, c.form_id, false
  from cand c join mark m on m.leadgen_id = c.leadgen_id
on conflict (leadgen_id) do nothing
returning leadgen_id;

-- W4 보존 — 45일 지난 제출 행의 폼 답변 사본을 비운다(같은 답변은 crm.activities '폼 답변' 에 영구 보관)
prepare w4 as
update crm.meta_leadgen_submissions set form_answers = null
 where form_answers is not null and received_at < now() - interval '45 days';
