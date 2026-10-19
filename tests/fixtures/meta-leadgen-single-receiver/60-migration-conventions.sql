-- 어드민 저장소로 옮기며 더한 확인(합성 데이터) — 20260902 하드닝·20260818 RLS 감사 규칙을 카탈로그로 대조한다.
-- 새 DB 에서 00 → 20 → 10 → 20 ×2 → 40 → 50 뒤에 돈다(상태와 무관한 카탈로그·권한 확인만).
\set ON_ERROR_STOP 1
create or replace function pg_temp.eq(label text, got anyelement, want anyelement) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got % want %', label, got, want; end if;
  raise notice 'ok  %', label;
end $$;

-- ── C1 함수 10개: search_path='' 고정, definer 여부, PUBLIC·anon·authenticated 실행 불가, service_role 실행 가능 ──
create temp table fn(sig text primary key, definer boolean);
insert into fn values
  ('public.meta_leadgen_set_mode(text,text,text,timestamp with time zone)', true),
  ('public.meta_leadgen_set_options(jsonb,text,text)', true),
  ('public.meta_lead_mirror_eligible(public.meta_leadgen_cutover,timestamp with time zone)', false),
  ('public.meta_leadgen_record_receipts(jsonb,text)', true),
  ('public.meta_lead_mirror_adopt(timestamp with time zone)', true),
  ('public.meta_lead_mirror_apply(jsonb)', true),
  ('public.meta_lead_fallback_claim(integer)', true),
  ('public.meta_lead_fallback_finish(text,text,uuid,text)', true),
  ('public.meta_lead_mirror_mark_side_effects(text[])', true),
  ('public.meta_lead_mirror_health()', true);
select pg_temp.eq('C1 all 10 functions exist', (select count(*) from fn where to_regprocedure(sig) is not null), 10::bigint);
select pg_temp.eq('C1 search_path pinned to empty',
  (select count(*) from fn join pg_proc p on p.oid = to_regprocedure(fn.sig) where p.proconfig @> array['search_path=""']), 10::bigint);
select pg_temp.eq('C1 security definer exactly where expected',
  (select count(*) from fn join pg_proc p on p.oid = to_regprocedure(fn.sig) where p.prosecdef = fn.definer), 10::bigint);
select pg_temp.eq('C1 no PUBLIC execute (proacl has no grantee 0)',
  (select count(*) from fn join pg_proc p on p.oid = to_regprocedure(fn.sig), aclexplode(p.proacl) a where a.grantee = 0), 0::bigint);
select pg_temp.eq('C1 anon/authenticated cannot execute',
  (select count(*) from fn cross join (values ('anon'), ('authenticated')) r(role)
    where has_function_privilege(r.role, to_regprocedure(fn.sig), 'execute')), 0::bigint);
select pg_temp.eq('C1 service_role executes all',
  (select count(*) from fn where has_function_privilege('service_role', to_regprocedure(sig), 'execute')), 10::bigint);

-- ── C2 표 5개: RLS 켜짐·정책 없음(deny-all), PUBLIC·anon·authenticated 권한 없음, service_role 은 select(+state update)만 ──
create temp table tb(rel text primary key, service_privs text);
insert into tb values
  ('public.meta_leadgen_cutover', 'SELECT'),
  ('public.meta_leadgen_cutover_history', 'SELECT'),
  ('public.meta_lead_mirror_state', 'SELECT,UPDATE'),
  ('public.meta_lead_mirror_ledger', 'SELECT'),
  ('public.meta_leadgen_receipts', 'SELECT');
select pg_temp.eq('C2 RLS enabled on all 5 tables',
  (select count(*) from tb join pg_class c on c.oid = tb.rel::regclass where c.relrowsecurity), 5::bigint);
select pg_temp.eq('C2 no policies (deny-all)',
  (select count(*) from pg_policy where polrelid in (select rel::regclass from tb)), 0::bigint);
select pg_temp.eq('C2 service_role privileges exact',
  (select count(*) from tb where tb.service_privs =
     (select string_agg(a.privilege_type, ',' order by a.privilege_type)
        from pg_class c, aclexplode(c.relacl) a
       where c.oid = tb.rel::regclass and a.grantee = 'service_role'::regrole)), 5::bigint);

-- ── C3 표·뷰 9개: PUBLIC·anon·authenticated 에게 어떤 권한도 없다 ──
create temp table rels as
  select rel from tb
  union all select unnest(array['public.compass_meta_submissions_v', 'public.compass_meta_leadgen_failures_v',
                                'public.home_meta_leadgen_receipts_v', 'public.home_meta_receiver_health_v']);
select pg_temp.eq('C3 all 9 relations exist', (select count(*) from rels where to_regclass(rel) is not null), 9::bigint);
select pg_temp.eq('C3 no PUBLIC/anon/authenticated grants on tables and views',
  (select count(*) from rels join pg_class c on c.oid = rels.rel::regclass, aclexplode(c.relacl) a
    where a.grantee in (0, 'anon'::regrole, 'authenticated'::regrole)), 0::bigint);
select pg_temp.eq('C3 service_role selects all 4 views',
  (select count(*) from rels where rel like '%\_v' and has_table_privilege('service_role', rel, 'select')), 4::bigint);

-- ── C4 RLS 가 service_role 경로를 막지 않는다(Supabase service_role = BYPASSRLS, 00-stub 참고) ──
set role service_role;
select pg_temp.eq('C4 service_role reads the switch row under RLS', (select count(*) from public.meta_leadgen_cutover), 1::bigint);
select pg_temp.eq('C4 service_role reads health view', (select count(*) from public.home_meta_receiver_health_v where mode is not null), 1::bigint);
reset role;

-- ── C5 RLS 가 실제로 걸린다: select 권한만 있고 BYPASSRLS 가 없는 롤은 0행을 본다 ──
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'rls_probe') then create role rls_probe nologin; end if;
end $$;
grant select on public.meta_leadgen_cutover to rls_probe;
set role rls_probe;
select pg_temp.eq('C5 non-bypass role sees 0 rows (deny-all)', (select count(*) from public.meta_leadgen_cutover), 0::bigint);
reset role;
revoke select on public.meta_leadgen_cutover from rls_probe;
drop role rls_probe;
