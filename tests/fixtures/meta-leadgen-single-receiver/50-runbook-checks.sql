-- META-RECEIVER-FINAL 런북 SQL(읽기 전용, 건수만). 서울 프로젝트 SQL Editor 에서 블록 하나씩.
-- 규칙: Compass 배포 중에는 돌리지 않는다(C-db F4 — 열린 트랜잭션이 migrate ALTER 를 세운다). <…> 는 사람이 채운다.

-- V2 스위치·건강(P2 뒤, 매일)
begin transaction read only;
set local statement_timeout = '20s'; set local lock_timeout = '1s'; set local idle_in_transaction_session_timeout = '60s';
select mode, shadow_since, mirror_since, compass_started_at, compass_ended_at, fallback_after_minutes, side_effects, updated_by
  from public.meta_leadgen_cutover;
select public.meta_lead_mirror_health();
select * from public.home_meta_receiver_health_v;
rollback;

-- V3 그림자 게이트(P5 동안 매일) — admin_only·receipts_not_in_compass 가 0 이어야 한다
begin transaction read only;
set local statement_timeout = '20s'; set local lock_timeout = '1s'; set local idle_in_transaction_session_timeout = '60s';
with c as (select shadow_since from public.meta_leadgen_cutover),
adm as (
  select substring(p.message from '(?:^|\n)leadgen_id=([0-9]+)') as lg, count(*) as n
    from public.leads p, c
   where p.source = 'meta_lead_ads' and p.created_at >= c.shadow_since and p.created_at < now() - interval '2 hours'
   group by 1
),
cmp as (
  select leadgen_id as lg from public.compass_meta_submissions_v
  union
  select external_id from public.compass_lead_refs_v where system = 'meta_leadgen'
),
rc as (
  select r.leadgen_id as lg from public.meta_leadgen_receipts r, c
   where r.first_received_at >= c.shadow_since and r.first_received_at < now() - interval '2 hours'
),
sub as (
  select s.leadgen_id as lg from public.compass_meta_submissions_v s, c
   where s.received_at >= c.shadow_since and s.received_at < now() - interval '2 hours'
)
select
  (select count(*) from adm where lg is not null)                                                          as admin_leadgens,
  (select coalesce(sum(n - 1), 0) from adm where lg is not null)                                           as admin_retry_duplicate_rows,
  (select coalesce(sum(n), 0) from adm where lg is null)                                                   as admin_rows_without_leadgen,
  (select count(*) from adm a where a.lg is not null and not exists (select 1 from cmp where cmp.lg = a.lg)) as admin_only,               -- 목표 0
  (select count(*) from adm a join public.compass_meta_leadgen_failures_v f on f.leadgen_id = a.lg
    where not exists (select 1 from cmp where cmp.lg = a.lg))                                              as admin_only_in_compass_failures,
  (select count(*) from rc)                                                                                as receipts,
  (select count(*) from rc where not exists (select 1 from cmp where cmp.lg = rc.lg))                      as receipts_not_in_compass,  -- 목표 0
  (select count(*) from sub where not exists (select 1 from rc where rc.lg = sub.lg))                      as compass_not_in_receipts,  -- 증인이 못 본 것(설명 필요)
  (select count(*) from sub where not exists (select 1 from adm where adm.lg = sub.lg))                    as compass_not_in_admin;     -- 컷오버 뒤 미러가 채울 몫
rollback;

-- V4 컷오버 직후 테스트 리드 한 건 추적(P6)
begin transaction read only;
set local statement_timeout = '20s'; set local lock_timeout = '1s';
with t as (select '<테스트 leadgen_id>'::text as lg)
select
  (select mode_at_receipt || ' ×' || deliveries from public.meta_leadgen_receipts r, t where r.leadgen_id = t.lg)           as receipt,
  (select outcome || ' · lead ' || coalesce(lead_id::text, '-') || ' · ' || coalesce(via, '-') from public.compass_meta_submissions_v s, t where s.leadgen_id = t.lg) as compass_submission,
  (select origin || '/' || state from public.meta_lead_mirror_ledger l, t where l.leadgen_id = t.lg)                         as ledger,
  (select count(*) from public.leads p, t where p.source = 'meta_lead_ads' and p.message ~ ('(^|\n)leadgen_id=' || t.lg || '(\n|$)')) as admin_rows;
rollback;

-- V5 무손실 증명(P6 뒤 매일) — MISSING = 0, compass+mirror_pending = 0 이어야 한다. admin_fallback_only 는 Compass 에 사람이 넣을 몫
begin transaction read only;
set local statement_timeout = '20s'; set local lock_timeout = '1s'; set local idle_in_transaction_session_timeout = '60s';
with c as (select fallback_after_minutes from public.meta_leadgen_cutover),
r as (
  select r.leadgen_id from public.meta_leadgen_receipts r, c
   where r.mode_at_receipt = 'compass'
     and r.first_received_at < now() - make_interval(mins => c.fallback_after_minutes + 15)
     and r.first_received_at >= now() - interval '30 days'
)
select case
         when exists (select 1 from public.compass_meta_submissions_v s where s.leadgen_id = r.leadgen_id)
           or exists (select 1 from public.compass_lead_refs_v f where f.system = 'meta_leadgen' and f.external_id = r.leadgen_id)
         then case when l.state in ('inserted','adopted') then 'compass+admin_row'
                   when l.state = 'skipped' then 'compass+skipped'
                   when l.state is null then 'compass+mirror_pending'
                   else 'compass+ledger_' || l.state end
         when l.state in ('inserted','adopted') then 'admin_fallback_only'
         when l.state = 'skipped' then 'closed(skipped)'
         else 'MISSING'
       end as outcome,
       count(*) as n
  from r left join public.meta_lead_mirror_ledger l on l.leadgen_id = r.leadgen_id
 group by 1 order by 1;
rollback;

-- V6 KST 일별 대조(P6 뒤) — 컷오버 뒤 날짜는 compass_submissions = mirrored + adopted + fallback + skipped + blocked
begin transaction read only;
set local statement_timeout = '20s'; set local lock_timeout = '1s'; set local idle_in_transaction_session_timeout = '60s';
with d as (select generate_series((now() at time zone 'Asia/Seoul')::date - 13, (now() at time zone 'Asia/Seoul')::date, interval '1 day')::date as day),
sub as (select (received_at at time zone 'Asia/Seoul')::date as day, count(*) n from public.compass_meta_submissions_v
         where received_at >= now() - interval '15 days' group by 1),
led as (select (received_at at time zone 'Asia/Seoul')::date as day,
               count(*) filter (where origin = 'compass_mirror' and state = 'inserted') ins,
               count(*) filter (where origin = 'admin_webhook') adopted,
               count(*) filter (where origin = 'admin_fallback' and state = 'inserted') fallback,
               count(*) filter (where state = 'skipped') skipped,
               count(*) filter (where state in ('blocked','fallback_pending','fallback_failed')) open_rows
          from public.meta_lead_mirror_ledger where received_at >= now() - interval '15 days' group by 1),
adm as (select (created_at at time zone 'Asia/Seoul')::date as day, count(*) rows,
               count(distinct substring(message from '(?:^|\n)leadgen_id=([0-9]+)')) leadgens
          from public.leads where source = 'meta_lead_ads' and created_at >= now() - interval '15 days' group by 1),
rc as (select (first_received_at at time zone 'Asia/Seoul')::date as day, count(*) n from public.meta_leadgen_receipts
        where first_received_at >= now() - interval '15 days' group by 1)
select d.day, coalesce(sub.n,0) compass_submissions, coalesce(led.ins,0) mirrored, coalesce(led.adopted,0) adopted,
       coalesce(led.fallback,0) fallback, coalesce(led.skipped,0) skipped, coalesce(led.open_rows,0) open_rows,
       coalesce(adm.rows,0) admin_meta_rows, coalesce(adm.leadgens,0) admin_meta_leadgens, coalesce(rc.n,0) receipts
  from d left join sub using (day) left join led using (day) left join adm using (day) left join rc using (day)
 order by d.day;
rollback;
