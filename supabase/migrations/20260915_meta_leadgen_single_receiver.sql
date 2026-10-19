-- 2026-09-15 Meta 리드애즈 단일 수신(Compass) — 전환 스위치·미러 원장·수신 증인·폴백·건강 지표.
-- 설계 정본: META-RECEIVER-FINAL(설계 B-mirror + 이식 G1–G9) §3·§5. 식은 로컬 PG 17 검증본 그대로다.
--
-- ⚠ 이 파일은 작성만 했고 아직 어느 DB 에도 적용하지 않았다(2026-09-15).
--
-- 적용 순서(반드시 이 순서):
--   0) 전제: 20260914_compass_integration_bridge.sql 적용(compass_lead_refs_v — 폴백·건강 H5 가 읽는다).
--   1) Compass(classinkr-main/crm) 배포 — scripts/schema.sql 이 crm.meta_leadgen_submissions·
--      crm.meta_leadgen_gap_imports 를 만든다. crm DDL 은 Compass 소유라 이 파일은 만들지 않는다.
--   2) 서울 프로젝트 SQL Editor 에서 이 파일 실행. NOTICE 두 줄이 `…: created` 인지 본다.
--   3) Compass 배포 전에 먼저 적용했다면 배포 뒤 이 파일을 한 번 더 실행한다(멱등). crm 객체가
--      없을 때 compass_meta_submissions_v·compass_meta_leadgen_failures_v 는 NOTICE 만 남기고 건너뛴다
--      (to_regclass 가드). 나머지(표·함수·home_* 뷰)는 public 객체만 읽어 항상 만들어진다.
--   Compass 배포가 진행 중일 때는 실행하지 않는다(열린 트랜잭션이 migrate ALTER 를 세운다).
--
-- 무엇이 바뀌나:
--  * 적용해도 동작은 바뀌지 않는다: 모드 기본값 'admin' = 지금 경로. 전환은 meta_leadgen_set_mode() 한 줄(사람이 실행).
--  * public.leads 는 컬럼·인덱스·제약·FK 를 하나도 바꾸지 않는다(원장도 FK 없음 — hot 테이블 RI 트리거·잠금 회피).
--  * crm 스키마에는 쓰지 않는다. crm 객체는 뷰로만 읽고, 없으면 NOTICE 후 건너뛴다(20260914 와 같은 가드).
--  * 상태를 바꾸는 함수는 security definer + search_path '' — service_role 은 표를 직접 insert/update 하지 못하고 함수로만 바꾼다.
--
-- 권한 규칙(20260902_security_definer_access_hardening.sql 과 대조):
--  * 함수 10개 전부 search_path = '' 고정, PUBLIC·anon·authenticated EXECUTE 회수 → service_role 만 EXECUTE.
--  * 새 표 5개는 RLS deny-all(정책 없음) + anon·authenticated 전권 회수. service_role(BYPASSRLS)은 select 만
--    (meta_lead_mirror_state 는 심장박동용 update 추가). 표·뷰에는 PUBLIC 기본 권한이 없어 PUBLIC 회수는 함수에만 둔다.
--  * 뷰 4개는 20260828·20260914 브리지와 같이 definer(소유자 postgres) 뷰 — crm 을 읽어야 해서 invoker 로 두지 않는다.
--    Supabase 린터의 security-definer-view 경고는 의도된 설계. home_meta_receiver_health_v 는
--    meta_lead_mirror_health() 를 부르므로 **뷰를 읽는 롤에게 그 함수의 EXECUTE 가 필요**하다(Compass 운영 롤 postgres 는 소유자).
--
-- 되돌리기(필요 시, 어드민 웹훅 분기 코드를 먼저 되돌린 뒤): drop view public.home_meta_receiver_health_v,
--   public.home_meta_leadgen_receipts_v, public.compass_meta_leadgen_failures_v, public.compass_meta_submissions_v;
--   → drop function(10개) → drop table public.meta_leadgen_receipts, public.meta_lead_mirror_ledger(CSV 로 먼저 보관),
--   public.meta_lead_mirror_state, public.meta_leadgen_cutover_history, public.meta_leadgen_cutover.
--   미러·폴백으로 만든 public.leads 행은 지우지 않는다(보고서 데이터).
--
-- 로컬 검증: tests/fixtures/meta-leadgen-single-receiver/README.md (일회용 PG 에서 이 파일을 그대로 적용해 시나리오를 돌린다).

-- ─── A) 전환 스위치(단일 행) + 이력 + 미러 실행 상태 ─────────────────────────
create table if not exists public.meta_leadgen_cutover (
  id                     text primary key default 'default' check (id = 'default'),
  mode                   text not null default 'admin' check (mode in ('admin','shadow','compass')),
  shadow_since           timestamptz,
  mirror_since           timestamptz,
  compass_started_at     timestamptz,
  compass_ended_at       timestamptz,
  side_effects           jsonb not null default
    '{"leadCreatedNotification": true, "subscriberUpsert": true, "automationOnSubmit": true, "externalForwards": true}'::jsonb,
  fallback_after_minutes integer not null default 120 check (fallback_after_minutes between 30 and 1440),
  updated_at             timestamptz not null default now(),
  updated_by             text,
  note                   text
);
insert into public.meta_leadgen_cutover (id) values ('default') on conflict (id) do nothing;

create table if not exists public.meta_leadgen_cutover_history (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  kind      text not null check (kind in ('mode','options')),
  from_mode text not null,
  to_mode   text not null,
  actor     text not null,
  note      text,
  snapshot  jsonb not null
);

-- 미러 크론 심장박동·경보 스로틀(감사 대상 아님). Compass hourly-sync 가 건강 뷰로 last_run_at 을 본다.
create table if not exists public.meta_lead_mirror_state (
  id              text primary key default 'default' check (id = 'default'),
  last_run_at     timestamptz,
  last_run_status text,
  last_summary    jsonb not null default '{}'::jsonb,
  alert_state     jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now()
);
insert into public.meta_lead_mirror_state (id) values ('default') on conflict (id) do nothing;

-- 모드 전환은 이 함수로만. 전이: admin↔shadow, shadow→compass, compass→admin(롤백). 시각 컬럼은 함수만 now() 로 찍는다.
create or replace function public.meta_leadgen_set_mode(
  p_mode text, p_actor text, p_note text default null, p_mirror_since timestamptz default null
) returns public.meta_leadgen_cutover
language plpgsql security definer
set search_path = ''
as $$
declare
  s public.meta_leadgen_cutover;
  n public.meta_leadgen_cutover;
begin
  if p_mode is null or p_mode not in ('admin','shadow','compass') then
    raise exception 'meta_leadgen_set_mode: 알 수 없는 모드 %', p_mode;
  end if;
  if nullif(trim(p_actor), '') is null then
    raise exception 'meta_leadgen_set_mode: actor 가 필요하다';
  end if;
  select * into s from public.meta_leadgen_cutover where id = 'default' for update;
  if s.mode = p_mode then
    raise exception 'meta_leadgen_set_mode: 이미 % 모드다', p_mode;
  end if;
  if p_mode = 'compass' and s.mode <> 'shadow' then
    raise exception 'meta_leadgen_set_mode: compass 는 shadow 에서만 켠다(지금 %)', s.mode;
  end if;
  if p_mode = 'shadow' and s.mode = 'compass' then
    raise exception 'meta_leadgen_set_mode: compass → shadow 는 없다. 롤백은 admin 으로';
  end if;
  if p_mode = 'compass' and p_mirror_since is not null and (p_mirror_since > now() or p_mirror_since < now() - interval '2 days') then
    raise exception 'meta_leadgen_set_mode: mirror_since 는 지금부터 2일 전 사이여야 한다';
  end if;

  update public.meta_leadgen_cutover c set
    mode               = p_mode,
    shadow_since       = case when p_mode = 'shadow' then now() else c.shadow_since end,
    mirror_since       = case when p_mode = 'compass' then coalesce(p_mirror_since, now() - interval '2 hours') else c.mirror_since end,
    compass_started_at = case when p_mode = 'compass' then now() else c.compass_started_at end,
    compass_ended_at   = case when p_mode = 'compass' then null when s.mode = 'compass' then now() else c.compass_ended_at end,
    updated_at         = now(),
    updated_by         = p_actor,
    note               = p_note
  where c.id = 'default'
  returning * into n;

  insert into public.meta_leadgen_cutover_history (kind, from_mode, to_mode, actor, note, snapshot)
  values ('mode', s.mode, p_mode, p_actor, p_note, to_jsonb(n));
  return n;
end $$;

-- 부수효과 토글·폴백 기한 — 모드와 같은 절차(actor·이력). 모르는 키는 거절한다.
create or replace function public.meta_leadgen_set_options(p_options jsonb, p_actor text, p_note text default null)
returns public.meta_leadgen_cutover
language plpgsql security definer
set search_path = ''
as $$
declare
  s public.meta_leadgen_cutover;
  n public.meta_leadgen_cutover;
  k text;
begin
  if nullif(trim(p_actor), '') is null then
    raise exception 'meta_leadgen_set_options: actor 가 필요하다';
  end if;
  if p_options is null or jsonb_typeof(p_options) <> 'object' then
    raise exception 'meta_leadgen_set_options: 객체가 필요하다';
  end if;
  for k in select jsonb_object_keys(p_options) loop
    if k not in ('side_effects','fallback_after_minutes') then
      raise exception 'meta_leadgen_set_options: 모르는 키 %', k;
    end if;
  end loop;
  if p_options ? 'side_effects' then
    for k in select jsonb_object_keys(p_options->'side_effects') loop
      if k not in ('leadCreatedNotification','subscriberUpsert','automationOnSubmit','externalForwards')
         or jsonb_typeof(p_options->'side_effects'->k) <> 'boolean' then
        raise exception 'meta_leadgen_set_options: side_effects.% 는 알려진 boolean 키여야 한다', k;
      end if;
    end loop;
  end if;
  select * into s from public.meta_leadgen_cutover where id = 'default' for update;
  update public.meta_leadgen_cutover c set
    side_effects = c.side_effects || coalesce(p_options->'side_effects', '{}'::jsonb),
    fallback_after_minutes = coalesce((p_options->>'fallback_after_minutes')::integer, c.fallback_after_minutes),
    updated_at = now(), updated_by = p_actor, note = p_note
  where c.id = 'default'
  returning * into n;
  insert into public.meta_leadgen_cutover_history (kind, from_mode, to_mode, actor, note, snapshot)
  values ('options', s.mode, n.mode, p_actor, p_note, to_jsonb(n));
  return n;
end $$;

-- 미러 대상 창 — compass 모드이거나, 롤백한 compass 구간의 잔여분(끝난 뒤 10분까지 받은 제출)
create or replace function public.meta_lead_mirror_eligible(s public.meta_leadgen_cutover, p_received_at timestamptz)
returns boolean
language sql stable
set search_path = ''
as $$
  select s.mirror_since is not null
     and p_received_at is not null
     and p_received_at >= s.mirror_since
     and (s.mode = 'compass'
          or (s.compass_ended_at is not null and p_received_at < s.compass_ended_at + interval '10 minutes'))
$$;

-- ─── B) 원장·수신 증인 ──────────────────────────────────────────────────────
-- leadgen 1건이 public.leads 에 최대 1행만 생기게 하는 원장.
--   origin: admin_webhook(경계 전 어드민 웹훅 행을 들임) · compass_mirror(Compass 제출을 미러) · admin_fallback(Compass 에 흔적이 없어 어드민 토큰으로 저장)
--   state : adopted · inserted · blocked(insert 막힘/미러 선점 중) · skipped · fallback_pending(폴백 진행 중) · fallback_failed(대기 후 재시도)
create table if not exists public.meta_lead_mirror_ledger (
  leadgen_id           text primary key check (leadgen_id ~ '^[0-9]+$'),
  origin               text not null check (origin in ('admin_webhook','compass_mirror','admin_fallback')),
  state                text not null check (state in ('adopted','inserted','blocked','skipped','fallback_pending','fallback_failed')),
  public_lead_id       uuid,     -- FK 없음(public.leads 에 RI 트리거·잠금을 더하지 않는다). 어드민에서 행을 지워도 원장은 남아 되살리지 않는다
  compass_lead_id      integer,  -- FK 없음(crm 소유)
  received_at          timestamptz,
  attempts             integer not null default 1,
  last_error           text,
  next_attempt_at      timestamptz,
  side_effects_done_at timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists meta_lead_mirror_ledger_public_lead_idx on public.meta_lead_mirror_ledger (public_lead_id);
create index if not exists meta_lead_mirror_ledger_received_idx on public.meta_lead_mirror_ledger (received_at);
create index if not exists meta_lead_mirror_ledger_open_idx on public.meta_lead_mirror_ledger (state) where state in ('blocked','fallback_pending','fallback_failed');

-- 어드민 앱 웹훅이 받은 leadgen id(shadow·compass 모드). Graph 조회 없음, PII 없음. Compass 가 자기가 못 받은 것을 찾는 독립 증인.
create table if not exists public.meta_leadgen_receipts (
  leadgen_id        text primary key check (leadgen_id ~ '^[0-9]+$'),
  page_id           text,
  form_id           text,
  ad_id             text,
  first_received_at timestamptz not null default now(),
  last_received_at  timestamptz not null default now(),
  deliveries        integer not null default 1,
  mode_at_receipt   text not null check (mode_at_receipt in ('shadow','compass'))
);
create index if not exists meta_leadgen_receipts_received_idx on public.meta_leadgen_receipts (first_received_at);

-- 웹훅이 한 번 부른다. 재전송은 deliveries 만 올린다(모드는 처음 값 유지). 숫자가 아닌 id 가 섞이면 통째로 실패 → 웹훅이 옛 경로로 저장.
create or replace function public.meta_leadgen_record_receipts(p_rows jsonb, p_mode text)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare n integer;
begin
  if p_mode is null or p_mode not in ('shadow','compass') then
    raise exception 'meta_leadgen_record_receipts: 모드는 shadow·compass 만(지금 %)', p_mode;
  end if;
  insert into public.meta_leadgen_receipts as r (leadgen_id, page_id, form_id, ad_id, mode_at_receipt)
  select distinct on (x->>'leadgen_id') x->>'leadgen_id', nullif(x->>'page_id', ''), nullif(x->>'form_id', ''), nullif(x->>'ad_id', ''), p_mode
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as x
  on conflict (leadgen_id) do update
    set deliveries = r.deliveries + 1, last_received_at = now();
  get diagnostics n = row_count;
  return n;
end $$;

-- 어드민이 만든 행(경계 전 웹훅·롤백 뒤 웹훅·폴백 저장)을 원장에 들인다 — message 의 leadgen_id= 줄. 재시도 중복 행은 첫 행만.
-- 이미 원장에 있어도 행이 비어 있는(막힘·폴백 중·폴백 실패) leadgen 이면 그 행을 가리키게 고친다 → 중복 insert 를 막는다.
create or replace function public.meta_lead_mirror_adopt(p_since timestamptz)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare n integer;
begin
  insert into public.meta_lead_mirror_ledger as l (leadgen_id, origin, state, public_lead_id, received_at)
  select distinct on (s.lg) s.lg, 'admin_webhook', 'adopted', s.id, s.created_at
  from (
    select substring(p.message from '(?:^|\n)leadgen_id=([0-9]+)') as lg, p.id, p.created_at
    from public.leads p
    where p.source = 'meta_lead_ads' and p.created_at >= p_since
  ) s
  where s.lg is not null
  order by s.lg, s.created_at, s.id
  on conflict (leadgen_id) do update
    set state = case when l.origin = 'admin_fallback' then 'inserted' else 'adopted' end,
        public_lead_id = excluded.public_lead_id, last_error = null, next_attempt_at = null, updated_at = now()
    where l.public_lead_id is null and l.state in ('blocked','fallback_pending','fallback_failed');
  get diagnostics n = row_count;
  return n;
end $$;

-- 미러 적용 — 한 호출 = 한 트랜잭션. 행 조립은 앱이 어드민 웹훅과 같은 빌더로 하고, 여기서는 멱등·창·원자성만.
create or replace function public.meta_lead_mirror_apply(p_rows jsonb)
returns table (out_leadgen_id text, out_action text, out_public_lead_id uuid)
language plpgsql security definer
set search_path = ''
as $$
declare
  s public.meta_leadgen_cutover;
  r jsonb;
  v_lg text;
  v_recv timestamptz;
  v_claim text;
  v_id uuid;
  v_existing public.meta_lead_mirror_ledger;
begin
  perform pg_advisory_xact_lock(hashtext('public.meta_lead_mirror'));
  select * into s from public.meta_leadgen_cutover where id = 'default';
  if s.mirror_since is null then
    return;
  end if;
  perform public.meta_lead_mirror_adopt(s.mirror_since - interval '2 days');

  for r in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_lg := r->>'leadgen_id';
    v_recv := (r->>'received_at')::timestamptz;
    out_leadgen_id := v_lg;
    out_public_lead_id := null;

    if v_lg is null or v_lg !~ '^[0-9]+$' then
      out_action := 'invalid';
      return next;
      continue;
    end if;
    if not public.meta_lead_mirror_eligible(s, v_recv) then
      out_action := 'outside_window';
      return next;
      continue;
    end if;

    -- 선점: 처음이면 claim. 막힘·폴백 실패·15분 넘게 멈춘 폴백은 미러가 넘겨받는다(Compass 가 저장했으니 미러가 정본).
    v_claim := null;
    insert into public.meta_lead_mirror_ledger as l (leadgen_id, origin, state, compass_lead_id, received_at)
    values (v_lg, 'compass_mirror', 'blocked', (r->>'compass_lead_id')::integer, v_recv)
    on conflict (leadgen_id) do update
      set origin = 'compass_mirror', state = 'blocked', attempts = l.attempts + 1, next_attempt_at = null,
          compass_lead_id = coalesce(excluded.compass_lead_id, l.compass_lead_id), updated_at = now()
      where l.state in ('blocked','fallback_failed')
         or (l.state = 'fallback_pending' and l.updated_at < now() - interval '15 minutes')
    returning l.leadgen_id into v_claim;

    if v_claim is null then
      update public.meta_lead_mirror_ledger
         set compass_lead_id = (r->>'compass_lead_id')::integer, updated_at = now()
       where leadgen_id = v_lg and compass_lead_id is null and (r->>'compass_lead_id') is not null;
      select * into v_existing from public.meta_lead_mirror_ledger where leadgen_id = v_lg;
      out_action := 'exists_' || v_existing.state;
      out_public_lead_id := v_existing.public_lead_id;
      return next;
      continue;
    end if;

    if nullif(r->>'skip_reason', '') is not null then
      update public.meta_lead_mirror_ledger
         set state = 'skipped', last_error = left(r->>'skip_reason', 200), updated_at = now()
       where leadgen_id = v_lg;
      out_action := 'skipped';
      return next;
      continue;
    end if;

    begin
      insert into public.leads (
        source, name, org, role, size, email, phone, message, branch, status,
        source_detail, lead_magnet, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
        confirmed_at, last_inflow_at, created_at
      ) values (
        'meta_lead_ads', r->>'name', r->>'org', r->>'role', r->>'size', r->>'email', r->>'phone', r->>'message', r->>'branch', 'new',
        r->>'source_detail', r->>'lead_magnet', r->>'utm_source', r->>'utm_medium', r->>'utm_campaign', r->>'utm_term', r->>'utm_content',
        null, v_recv, v_recv
      ) returning id into v_id;
      update public.meta_lead_mirror_ledger
         set state = 'inserted', public_lead_id = v_id, last_error = null, updated_at = now()
       where leadgen_id = v_lg;
      out_action := 'inserted';
      out_public_lead_id := v_id;
    exception when unique_violation or check_violation or not_null_violation then
      update public.meta_lead_mirror_ledger
         set state = 'blocked', last_error = left(sqlstate || ' ' || sqlerrm, 200), updated_at = now()
       where leadgen_id = v_lg;
      out_action := 'blocked';
    end;
    return next;
  end loop;
end $$;

-- 폴백 선점 — compass 모드에서 받은 증인 중 fallback_after_minutes 가 지나도 Compass 에 흔적(제출 행·lead_refs)이 없는 것.
-- 모드와 무관하게 돈다(롤백 뒤에도 compass 구간 증인은 끝까지 간다). Compass 뷰가 없으면 "흔적 없음"으로 본다(안전 쪽 = 저장).
create or replace function public.meta_lead_fallback_claim(p_limit integer default 20)
returns table (out_leadgen_id text, out_page_id text, out_form_id text, out_ad_id text, out_attempt integer)
language plpgsql security definer
set search_path = ''
as $$
declare
  s public.meta_leadgen_cutover;
  has_sub boolean := to_regclass('public.compass_meta_submissions_v') is not null;
  has_refs boolean := to_regclass('public.compass_lead_refs_v') is not null;
begin
  perform pg_advisory_xact_lock(hashtext('public.meta_lead_mirror'));
  select * into s from public.meta_leadgen_cutover where id = 'default';
  perform public.meta_lead_mirror_adopt(now() - interval '8 days');
  return query execute format($q$
    with cand as (
      select r.leadgen_id, r.page_id, r.form_id, r.ad_id, r.first_received_at
      from public.meta_leadgen_receipts r
      left join public.meta_lead_mirror_ledger l on l.leadgen_id = r.leadgen_id
      where r.mode_at_receipt = 'compass'
        and r.first_received_at <= now() - make_interval(mins => $1)
        and r.first_received_at >= now() - interval '7 days'
        and (l.leadgen_id is null
             or (l.state = 'fallback_failed' and coalesce(l.next_attempt_at, '-infinity'::timestamptz) <= now())
             or (l.state = 'fallback_pending' and l.updated_at < now() - interval '15 minutes'))
        %s %s
      order by r.first_received_at, r.leadgen_id
      limit $2
    ), up as (
      insert into public.meta_lead_mirror_ledger as l (leadgen_id, origin, state, received_at)
      select c.leadgen_id, 'admin_fallback', 'fallback_pending', c.first_received_at from cand c
      on conflict (leadgen_id) do update
        set origin = 'admin_fallback', state = 'fallback_pending', attempts = l.attempts + 1, updated_at = now()
        where l.state in ('fallback_failed','fallback_pending')
      returning l.leadgen_id, l.attempts
    )
    select c.leadgen_id, c.page_id, c.form_id, c.ad_id, up.attempts from cand c join up on up.leadgen_id = c.leadgen_id
    order by c.first_received_at, c.leadgen_id
  $q$,
    case when has_sub then 'and not exists (select 1 from public.compass_meta_submissions_v m where m.leadgen_id = r.leadgen_id)' else '' end,
    case when has_refs then 'and not exists (select 1 from public.compass_lead_refs_v f where f.system = ''meta_leadgen'' and f.external_id = r.leadgen_id)' else '' end)
  using s.fallback_after_minutes, p_limit;
end $$;

-- 폴백 결과 — inserted(submitLeadCapture 가 저장, 부수효과도 이미 돎) · deduped(60초 중복으로 저장 안 함) · failed(지수 대기 10·20·40…최대 360분)
create or replace function public.meta_lead_fallback_finish(p_leadgen_id text, p_result text, p_public_lead_id uuid default null, p_error text default null)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare v_state text;
begin
  if p_result is null or p_result not in ('inserted','deduped','failed') then
    raise exception 'meta_lead_fallback_finish: 결과는 inserted·deduped·failed(지금 %)', p_result;
  end if;
  if p_result = 'inserted' and p_public_lead_id is null then
    raise exception 'meta_lead_fallback_finish: inserted 에는 public_lead_id 가 필요하다';
  end if;
  perform pg_advisory_xact_lock(hashtext('public.meta_lead_mirror'));
  update public.meta_lead_mirror_ledger l set
    state = case p_result when 'inserted' then 'inserted' when 'deduped' then 'skipped' else 'fallback_failed' end,
    public_lead_id = case when p_result = 'inserted' then p_public_lead_id else l.public_lead_id end,
    side_effects_done_at = case when p_result = 'inserted' then now() else l.side_effects_done_at end,
    last_error = case when p_result = 'inserted' then null else left(coalesce(p_error, p_result), 200) end,
    next_attempt_at = case when p_result = 'failed'
                           then now() + make_interval(mins => least(360, 10 * (2 ^ (least(l.attempts, 7) - 1))::integer))
                           end,
    updated_at = now()
  where l.leadgen_id = p_leadgen_id and l.origin = 'admin_fallback' and l.state = 'fallback_pending'
  returning l.state into v_state;
  return coalesce(v_state, 'not_pending');
end $$;

-- 부수효과(인앱 알림 등)를 끝낸 표시 — 미러 insert 분만(폴백은 submitLeadCapture 가 이미 했다)
create or replace function public.meta_lead_mirror_mark_side_effects(p_leadgen_ids text[])
returns integer
language sql security definer
set search_path = ''
as $$
  with u as (
    update public.meta_lead_mirror_ledger
       set side_effects_done_at = now(), updated_at = now()
     where leadgen_id = any(p_leadgen_ids) and state = 'inserted' and origin = 'compass_mirror' and side_effects_done_at is null
    returning 1)
  select count(*)::integer from u
$$;

-- ─── C) Compass → 어드민 브리지(추가 뷰, crm 객체가 있을 때만) ───────────────
-- form_answers 는 어드민 빌더(lib/meta/lead-ads-payload.ts)가 org·role·size·branch·동의로 읽는 키만, 45일 창. 주소·자유 응답은 열지 않는다.
-- 키 목록이 빌더와 어긋나지 않게 어드민 테스트가 이 파일을 파싱해 대조한다(tests/meta/submissions-allowlist.test.ts).
do $$
begin
  if to_regclass('crm.meta_leadgen_submissions') is not null then
    execute $view$
      create or replace view public.compass_meta_submissions_v as
      select s.leadgen_id, s.lead_id, s.outcome, s.via,
             s.ad_id, s.ad_name, s.adset_id, s.adset_name, s.campaign_id, s.campaign_name,
             s.form_id, s.page_id, s.platform, s.submitted_at, s.received_at,
             case when s.form_answers is not null and jsonb_typeof(s.form_answers) = 'array'
                       and s.received_at >= now() - interval '45 days' then
               (select coalesce(jsonb_agg(a.e order by a.ord), '[]'::jsonb)
                  from jsonb_array_elements(s.form_answers) with ordinality as a(e, ord)
                 where lower(trim(a.e->>'name')) = any (array[
                   'company_name','company','organization','business_name','school_name','academy_name','학원명','회사명','기관명',
                   'job_title','role','position','직책','담당자직책',
                   'student_count','number_of_students','academy_size','team_size','원생수','학생수','규모',
                   'city','region','province','지역','도시',
                   'marketing_consent','consent_marketing','email_marketing_consent','marketing','마케팅_수신_동의','마케팅 수신 동의'
                 ]))
             end as form_answers
      from crm.meta_leadgen_submissions s
    $view$;
    execute 'revoke all on public.compass_meta_submissions_v from anon, authenticated';
    execute 'grant select on public.compass_meta_submissions_v to service_role';
    raise notice 'compass_meta_submissions_v: created';
  else
    raise notice 'compass_meta_submissions_v: crm.meta_leadgen_submissions missing — deploy Compass first, then re-run';
  end if;
  if to_regclass('crm.meta_leadgen_failures') is not null then
    execute $view$
      create or replace view public.compass_meta_leadgen_failures_v as
      select leadgen_id, lead_specific, first_seen_at, last_seen_at, attempts
      from crm.meta_leadgen_failures
    $view$;
    execute 'revoke all on public.compass_meta_leadgen_failures_v from anon, authenticated';
    execute 'grant select on public.compass_meta_leadgen_failures_v to service_role';
    raise notice 'compass_meta_leadgen_failures_v: created';
  else
    raise notice 'compass_meta_leadgen_failures_v: crm.meta_leadgen_failures missing — deploy Compass first, then re-run';
  end if;
end $$;

-- 어드민 → Compass 역브리지: 수신 증인(식별자만). Compass 는 mode_at_receipt = 'compass' 만 실패 보관에 넣는다.
create or replace view public.home_meta_leadgen_receipts_v as
  select leadgen_id, page_id, form_id, first_received_at, mode_at_receipt from public.meta_leadgen_receipts;

-- ─── D) 건강 지표 — 미러 크론·관리 화면·Compass hourly-sync·런북 SQL 이 같은 숫자를 본다 ───────
create or replace function public.meta_lead_mirror_health()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  s public.meta_leadgen_cutover;
  st public.meta_lead_mirror_state;
  out jsonb;
  has_sub boolean := to_regclass('public.compass_meta_submissions_v') is not null;
  has_refs boolean := to_regclass('public.compass_lead_refs_v') is not null;
  has_fail boolean := to_regclass('public.compass_meta_leadgen_failures_v') is not null;
  not_in_compass text;
  v int;
begin
  select * into s from public.meta_leadgen_cutover where id = 'default';
  select * into st from public.meta_lead_mirror_state where id = 'default';
  out := jsonb_build_object('mode', s.mode, 'shadow_since', s.shadow_since, 'mirror_since', s.mirror_since,
                            'compass_started_at', s.compass_started_at, 'compass_ended_at', s.compass_ended_at,
                            'fallback_after_minutes', s.fallback_after_minutes,
                            'heartbeat_at', st.last_run_at,
                            'stale_minutes', case when st.last_run_at is null then null
                                                  else floor(extract(epoch from now() - st.last_run_at) / 60)::int end,
                            'views', jsonb_build_object('submissions', has_sub, 'refs', has_refs, 'failures', has_fail));
  not_in_compass :=
    (case when has_sub then ' and not exists (select 1 from public.compass_meta_submissions_v m where m.leadgen_id = r.leadgen_id)' else '' end) ||
    (case when has_refs then ' and not exists (select 1 from public.compass_lead_refs_v f where f.system = ''meta_leadgen'' and f.external_id = r.leadgen_id)' else '' end);

  -- H1 증인: 2시간 넘게 Compass 어디에도 없는 수신(90일 안, compass 모드 수신)
  execute 'select count(*)::int from public.meta_leadgen_receipts r
            where r.mode_at_receipt = ''compass'' and r.first_received_at < now() - interval ''2 hours''
              and r.first_received_at >= now() - interval ''90 days''' || not_in_compass into v;
  out := out || jsonb_build_object('h1_receipts_missing_in_compass_2h', v);
  if has_fail then
    execute 'select count(*)::int from public.meta_leadgen_receipts r
              join public.compass_meta_leadgen_failures_v f0 on f0.leadgen_id = r.leadgen_id
             where r.mode_at_receipt = ''compass'' and r.first_received_at < now() - interval ''2 hours''
               and r.first_received_at >= now() - interval ''90 days''' || not_in_compass into v;
    out := out || jsonb_build_object('h1b_receipts_in_compass_failures_2h', v);
  end if;

  -- AT RISK(유실 위험): 폴백 기한 + 15분이 지났는데 Compass 에도 없고 어드민에도 저장되지 않은 수신. 목표 0 — Compass hourly-sync 가 빨간불
  execute 'select count(*)::int from public.meta_leadgen_receipts r
             left join public.meta_lead_mirror_ledger l on l.leadgen_id = r.leadgen_id
            where r.mode_at_receipt = ''compass''
              and r.first_received_at <= now() - make_interval(mins => $1 + 15)
              and r.first_received_at >= now() - interval ''90 days''
              and coalesce(l.state, '''') not in (''inserted'',''adopted'',''skipped'')' || not_in_compass
    into v using s.fallback_after_minutes;
  out := out || jsonb_build_object('at_risk', v);

  -- ADMIN ONLY: Compass 에는 없고 어드민 폴백으로만 저장된 리드(사람이 Compass 에 넣어야 함)
  execute 'select count(*)::int from public.meta_leadgen_receipts r
             join public.meta_lead_mirror_ledger l on l.leadgen_id = r.leadgen_id
            where r.mode_at_receipt = ''compass'' and l.origin = ''admin_fallback'' and l.state = ''inserted''
              and r.first_received_at >= now() - interval ''90 days''' || not_in_compass into v;
  out := out || jsonb_build_object('admin_only_saved', v);

  select count(*)::int into v from public.meta_lead_mirror_ledger where state = 'fallback_failed';
  out := out || jsonb_build_object('fallback_failed', v);

  -- H2 미러 밀림: 창 안인데 30분 넘게 원장에 없는 제출
  if has_sub then
    execute $q$
      select count(*)::int from public.compass_meta_submissions_v m
      where m.received_at < now() - interval '30 minutes'
        and public.meta_lead_mirror_eligible($1, m.received_at)
        and not exists (select 1 from public.meta_lead_mirror_ledger l where l.leadgen_id = m.leadgen_id) $q$
      into v using s;
    out := out || jsonb_build_object('h2_mirror_backlog_30m', v);
  end if;

  select count(*) filter (where state = 'blocked')::int into v from public.meta_lead_mirror_ledger;
  out := out || jsonb_build_object('h3_blocked', v);
  select count(*) filter (where state = 'skipped')::int into v from public.meta_lead_mirror_ledger;
  out := out || jsonb_build_object('h3b_skipped', v);

  if s.mirror_since is not null then
    select count(*)::int into v from (
      select x.lg
      from (select substring(p.message from '(?:^|\n)leadgen_id=([0-9]+)') as lg
            from public.leads p
            where p.source = 'meta_lead_ads' and p.created_at >= s.mirror_since - interval '2 days') x
      where x.lg is not null
      group by x.lg having count(*) > 1
    ) d
    where exists (select 1 from public.meta_lead_mirror_ledger l where l.leadgen_id = d.lg and l.origin in ('compass_mirror','admin_fallback'));
    out := out || jsonb_build_object('h4_duplicate_leadgens_with_mirror', v);
  end if;

  if has_sub and has_refs then
    execute $q$
      select count(*)::int from public.compass_lead_refs_v f
      where f.system = 'meta_leadgen' and f.created_at >= coalesce($1, now()) - interval '2 days'
        and not exists (select 1 from public.compass_meta_submissions_v m where m.leadgen_id = f.external_id) $q$
      into v using coalesce(s.shadow_since, s.mirror_since);
    out := out || jsonb_build_object('h5_refs_without_submission', v);
  end if;

  select count(*)::int into v from public.meta_lead_mirror_ledger
   where state = 'inserted' and origin = 'compass_mirror' and side_effects_done_at is null and updated_at < now() - interval '1 hour';
  out := out || jsonb_build_object('h6_side_effects_pending_1h', v);
  return out;
end $$;

-- Compass hourly-sync 가 읽는 한 줄(PII 없음). 이 뷰를 못 읽는 것 자체도 Compass 쪽에서 실패로 친다(한 번이라도 shadow·compass 를 본 뒤).
create or replace view public.home_meta_receiver_health_v as
select h->>'mode' as mode,
       (h->>'heartbeat_at')::timestamptz as heartbeat_at,
       (h->>'stale_minutes')::integer as stale_minutes,
       coalesce((h->>'at_risk')::integer, 0) as at_risk,
       coalesce((h->>'admin_only_saved')::integer, 0) as admin_only_saved,
       (h->>'h2_mirror_backlog_30m')::integer as mirror_backlog_30m
from (select public.meta_lead_mirror_health() as h) x;

-- ─── E) 권한 — 20260902 하드닝과 같은 규칙(service_role 전용). 상태 변경은 함수로만 ─────────
-- RLS deny-all(정책을 만들지 않는다): 20260818 RLS 감사 이후 public 표는 모두 RLS 를 켠다(20260829_showroom_bookings 와 같은 형태).
-- service_role(BYPASSRLS)과 표 소유자(security definer 함수·definer 뷰의 실행 주체)는 영향을 받지 않는다.
alter table public.meta_leadgen_cutover enable row level security;
alter table public.meta_leadgen_cutover_history enable row level security;
alter table public.meta_lead_mirror_state enable row level security;
alter table public.meta_lead_mirror_ledger enable row level security;
alter table public.meta_leadgen_receipts enable row level security;

revoke all on public.meta_leadgen_cutover, public.meta_leadgen_cutover_history, public.meta_lead_mirror_state,
              public.meta_lead_mirror_ledger, public.meta_leadgen_receipts,
              public.home_meta_leadgen_receipts_v, public.home_meta_receiver_health_v from anon, authenticated, service_role;
grant select on public.meta_leadgen_cutover, public.meta_leadgen_cutover_history, public.meta_lead_mirror_ledger,
                public.meta_leadgen_receipts, public.home_meta_leadgen_receipts_v, public.home_meta_receiver_health_v to service_role;
grant select, update on public.meta_lead_mirror_state to service_role;
revoke all on function public.meta_leadgen_set_mode(text, text, text, timestamptz),
                       public.meta_leadgen_set_options(jsonb, text, text),
                       public.meta_lead_mirror_eligible(public.meta_leadgen_cutover, timestamptz),
                       public.meta_leadgen_record_receipts(jsonb, text),
                       public.meta_lead_mirror_adopt(timestamptz),
                       public.meta_lead_mirror_apply(jsonb),
                       public.meta_lead_fallback_claim(integer),
                       public.meta_lead_fallback_finish(text, text, uuid, text),
                       public.meta_lead_mirror_mark_side_effects(text[]),
                       public.meta_lead_mirror_health() from public, anon, authenticated;
grant execute on function public.meta_leadgen_set_mode(text, text, text, timestamptz),
                          public.meta_leadgen_set_options(jsonb, text, text),
                          public.meta_lead_mirror_eligible(public.meta_leadgen_cutover, timestamptz),
                          public.meta_leadgen_record_receipts(jsonb, text),
                          public.meta_lead_mirror_adopt(timestamptz),
                          public.meta_lead_mirror_apply(jsonb),
                          public.meta_lead_fallback_claim(integer),
                          public.meta_lead_fallback_finish(text, text, uuid, text),
                          public.meta_lead_mirror_mark_side_effects(text[]),
                          public.meta_lead_mirror_health() to service_role;

-- PostgREST 스키마 캐시 갱신 — 새 함수·권한을 즉시 반영한다(20260902 하드닝과 같음).
notify pgrst, 'reload schema';
