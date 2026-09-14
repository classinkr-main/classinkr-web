-- 2026-09-14 Compass ↔ 어드민 연동 브리지 2차 — 전화 키 함수 + 링크/연락 뷰 + 역브리지 뷰.
--
-- ⚠ 이 파일은 작성만 했고 아직 어느 DB 에도 적용하지 않았다(2026-09-14).
--
-- 적용 순서(반드시 이 순서):
--   1) Compass(classinkr-main/crm) 배포 — scripts/schema.sql 이 crm.lead_refs 테이블과
--      crm.lead_contact_facts_v 뷰를 만든다. crm DDL 은 Compass 소유라 이 파일은 만들지 않는다.
--   2) 서울 프로젝트 pxbrsbovoobowpfarxmn 에 이 파일 적용. 원본(싱가포르)은 쓰기 차단 상태라
--      거기에 적용하면 운영에 반영되지 않는다.
--   3) Compass 배포 전에 먼저 적용했다면 배포 뒤 이 파일을 한 번 더 실행한다(멱등). crm 객체가
--      없을 때 compass_lead_refs_v·compass_lead_contact_v 는 NOTICE 만 남기고 건너뛴다
--      (to_regclass 가드). 나머지(함수·인덱스·역브리지 뷰)는 public 객체만 읽어 항상 만들어진다.
--
-- 무엇을 하나:
--   A) public.norm_phone_key(text) — Compass lib/format.ts normPhone(전화 저장 정본)과 같은 결과를
--      내는 SQL 함수. 원문 전화를 가진 public 테이블(leads·channel_conversations·NEO 스냅샷)을
--      crm.leads.phone_key 와 조인할 때 쓴다. 20260828 compass_leads_v 의 phone_key 식(K식)은
--      Compass 저장값에서는 normPhone 과 같지만, 원문에 쓰면 "+82 010…"·"0082-010…"·"10-…"
--      (앞 0 탈락) 형태가 조인에서 빠진다(Compass 감사 D-borrow-crm.md 전화 키 진리표 결론 2).
--      표현식 인덱스가 같은 함수를 공유하도록 함수로 둔다. 적용 시 아래 자기검증 블록이 진리표
--      픽스처로 PG 실행 결과를 확인하고, 어긋나면 예외로 중단한다.
--   B) Compass → 어드민: compass_lead_refs_v(시스템 간 링크), compass_lead_contact_v(리드별 연락 사실 —
--      "연락함" 정의의 단일 원천. 기계 작성자·자동 메모 제외 규칙은 Compass lib/leadContact.ts).
--   C) 어드민 → Compass(역브리지): home_owner_directory_v, home_neo_accounts_v, home_site_leads_v,
--      home_channel_contacts_v. Compass 는 리드 상세 단건(phone_key = $1)으로만 읽는다.
--
-- 설계 원칙(20260828_compass_bridge_views.sql 과 같음):
--  * 뷰는 definer(소유자 postgres) 권한으로 실행된다. anon/authenticated 는 명시 REVOKE,
--    service_role 만 SELECT. Supabase 린터의 security-definer-view 경고는 의도된 설계.
--  * PII 최소화: 역브리지 뷰는 원문 전화·이름·기관명(홈페이지 리드)·이메일·메시지·메모·대화 본문을
--    내보내지 않는다. phone_key 도 번호 자체라는 점은 인지하고, service_role 전용으로만 연다.
--  * 컬럼은 서울 실 카탈로그(2026-09-14T08:59Z, public_borrow_candidate_columns)로 존재를 확인했다.
--
-- 권한 주의: norm_phone_key 의 EXECUTE 는 회수하지 않는다. 표현식 인덱스 식은 행을 쓰는 역할의
-- 권한으로 평가되므로, 회수하면 anon/authenticated 경로의 public.leads insert 가 깨질 수 있다.
-- 부작용 없는 순수 함수라 열어 두어도 노출되는 데이터가 없다.
--
-- 되돌리기(필요 시): drop view public.home_channel_contacts_v, public.home_site_leads_v,
--   public.home_neo_accounts_v, public.home_owner_directory_v, public.compass_lead_contact_v,
--   public.compass_lead_refs_v; drop index public.leads_norm_phone_key_idx,
--   public.channel_conversations_norm_phone_key_idx, public.crm_neo_customer_snapshots_norm_phone_key_idx;
--   drop function public.norm_phone_key(text);  (뷰 → 인덱스 → 함수 순서)

-- ─── A) 전화 키 함수 ────────────────────────────────────────────────────────
-- 본문은 Compass 감사 R6 B-3 식 그대로. normPhone 규칙:
--   숫자만 남김 → 빈 값 null → 0082·82 국가번호를 벗기고 국내 0 이 없으면 붙임
--   → 국가번호 없이 10 으로 시작하는 10자리 이상(시트가 앞 0 을 떨어뜨린 형태)은 0 을 붙임
--   → 그 밖(국내 표기·다른 나라 국가번호)은 그대로.
-- search_path 고정: 본문은 pg_catalog 내장 함수만 쓴다(빈 search_path 에서도 해석된다).
create or replace function public.norm_phone_key(p text) returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select case
    when d = '' then null
    when d like '0082%' then case when substr(d,5) like '0%' then substr(d,5) else '0'||substr(d,5) end
    when d like '82%'   then case when substr(d,3) like '0%' then substr(d,3) else '0'||substr(d,3) end
    when d like '10%' and length(d) >= 10 then '0'||d
    else d end
  from (select regexp_replace(coalesce(p,''), '[^0-9]', '', 'g') as d) s
$$;

comment on function public.norm_phone_key(text) is
  'Compass lib/format.ts normPhone 의 SQL 등가 — 원문 전화 → Compass crm.leads.phone_key 조인 키. 규칙을 바꾸면 Compass normPhone 과 함께 바꿀 것(자기검증 픽스처: 20260914_compass_integration_bridge.sql).';

-- 자기검증: Compass normPhone 진리표(D-borrow-crm.md) + normPhone 주석의 실사례.
-- 픽스처는 tests/db/compass-integration-bridge-migration.test.ts 가 같은 값으로 JS normPhone 과 대조한다.
do $$
declare
  r record;
  actual text;
begin
  for r in
    select * from (values
      ('010-1234-5678', '01012345678'),
      ('+82 10-1234-5678', '01012345678'),
      ('0082-10-1234-5678', '01012345678'),
      ('82-10-1234-5678', '01012345678'),
      ('821012345678', '01012345678'),
      ('8227956720', '027956720'),
      ('02-795-6720', '027956720'),
      ('031-123-4567', '0311234567'),
      ('1588-1234', '15881234'),
      ('010 1234 5678 (내선 2)', '010123456782'),
      ('010-1234-5678 / 02-795-6720', '01012345678027956720'),
      ('+82 010-1234-5678', '01012345678'),
      ('0082-010-1234-5678', '01012345678'),
      ('0082-1091948713', '01091948713'),
      ('0082-01091948713', '01091948713'),
      ('10-1234-5678', '01012345678'),
      ('1012345678', '01012345678'),
      ('01091948713', '01091948713'),
      ('+86 138 0013 8000', '8613800138000'),
      ('008613800138000', '008613800138000'),
      ('없음', null),
      ('', null),
      (null, null)
    ) as t(input, expected)
  loop
    actual := public.norm_phone_key(r.input);
    if actual is distinct from r.expected then
      raise exception 'norm_phone_key parity failed for %: got %, expected %', r.input, actual, r.expected;
    end if;
  end loop;
end $$;

-- 조인용 표현식 인덱스. 뷰의 where(phone is not null)가 부분 인덱스 조건을 함의해야 플래너가 쓴다.
create index if not exists leads_norm_phone_key_idx
  on public.leads (public.norm_phone_key(phone)) where phone is not null;
create index if not exists channel_conversations_norm_phone_key_idx
  on public.channel_conversations (public.norm_phone_key(phone)) where phone is not null;
-- home_neo_accounts_v 는 전화 없는 고객도 목록에 남기므로 부분 인덱스가 아니다.
create index if not exists crm_neo_customer_snapshots_norm_phone_key_idx
  on public.crm_neo_customer_snapshots (public.norm_phone_key(phone));

-- ─── B) Compass → 어드민 (crm 객체가 있을 때만) ─────────────────────────────
-- 1) 시스템 간 링크 — 한 외부 레코드(홈페이지 리드·leadgen·채널톡 대화)는 Compass 리드 하나에만 붙는다.
--    created_by 는 내보내지 않는다(작업자 식별).
do $$
begin
  if to_regclass('crm.lead_refs') is not null then
    execute $view$
      create or replace view public.compass_lead_refs_v as
      select lead_id, system, external_id, matched_by, created_at
      from crm.lead_refs
    $view$;
    execute 'revoke all on public.compass_lead_refs_v from anon, authenticated';
    execute 'grant select on public.compass_lead_refs_v to service_role';
    execute $comment$
      comment on view public.compass_lead_refs_v is
        'Compass crm.lead_refs 읽기 전용 브리지 — 시스템 간 링크(home_lead·meta_leadgen·neocrm_lead·neocrm_account·channel_conv). 쓰기 금지 — 링크 소유권은 Compass.'
    $comment$;
    raise notice 'compass_lead_refs_v: created from crm.lead_refs';
  else
    raise notice 'compass_lead_refs_v: crm.lead_refs missing — deploy Compass scripts/schema.sql first, then re-run this migration';
  end if;
end $$;

-- 2) 리드별 연락 사실 — "연락함" 판정은 이 뷰를 읽는다(어드민에서 활동 body 를 다시 해석하지 않는다).
--    bd_contact_at 은 compass_leads_v 에 이미 있어 여기서는 뺀다.
do $$
begin
  if to_regclass('crm.lead_contact_facts_v') is not null then
    execute $view$
      create or replace view public.compass_lead_contact_v as
      select lead_id, latest_inflow_at, first_attempt_at, last_attempt_at,
             first_connected_at, last_connected_at, missed_since_inflow, sms_since_inflow
      from crm.lead_contact_facts_v
    $view$;
    execute 'revoke all on public.compass_lead_contact_v from anon, authenticated';
    execute 'grant select on public.compass_lead_contact_v to service_role';
    execute $comment$
      comment on view public.compass_lead_contact_v is
        'Compass crm.lead_contact_facts_v 읽기 전용 브리지 — 리드별 연락 시도·연결 시각과 최신 유입 뒤 부재중·문자 수. 기계 작성자(Claude·BD시트·시트 동기화)와 자동 메모는 연결에서 제외된 값.'
    $comment$;
    raise notice 'compass_lead_contact_v: created from crm.lead_contact_facts_v';
  else
    raise notice 'compass_lead_contact_v: crm.lead_contact_facts_v missing — deploy Compass scripts/schema.sql first, then re-run this migration';
  end if;
end $$;

-- ─── C) 어드민 → Compass 역브리지 ───────────────────────────────────────────
-- 3) 담당자 디렉터리 — admin_profiles 를 담당자·NEO owner 매핑의 원본으로 둔다.
--    user_id·role·capabilities·nav_*·invited_by·last_login_at 은 제외.
create or replace view public.home_owner_directory_v as
select
  p.display_name,
  p.crm_owner_key,
  p.crm_owner_aliases,
  p.neo_owner_id,
  p.crm_assignable,
  p.crm_team_role,
  p.status,
  p.crm_sort_order
from public.admin_profiles p;

-- 4) NEO 고객 스냅샷 — 푸시 전 "이미 NEO 고객" 검사와 리드 상세 패널용.
--    원문 phone·uid·주문 금액·원천 참조(source_refs 등)는 제외.
create or replace view public.home_neo_accounts_v as
select
  s.source_system,
  s.account_id,
  s.account_name,
  s.owner_id,
  s.owner_name,
  public.norm_phone_key(s.phone) as phone_key,
  s.region_label,
  s.has_eeo,
  s.billing_mode,
  s.balance,
  s.expire_at,
  s.expire_in_days,
  s.depletion_in_days,
  s.risk_level,
  s.risk_reasons,
  s.is_stale,
  s.source_synced_at
from public.crm_neo_customer_snapshots s;

-- 5) 홈페이지 문의 — phone_key 당 1행 집계. public.leads 는 정규화 기준 중복이 남아 있어
--    행 단위로 내보내면 phone_key 가 유일하지 않다. 광고 리드 원본(meta_lead_ads)은 Compass 가 가진다.
--    name·org·email·phone·message·notes·anonymous_id·user_id·클릭 id 는 제외.
create or replace view public.home_site_leads_v as
select
  public.norm_phone_key(l.phone) as phone_key,
  count(*)::int as n,
  max(l.created_at) as last_at,
  max(l.last_inflow_at) as last_inflow_at,
  (array_agg(l.source order by l.created_at desc, l.id desc))[1] as last_source,
  (array_agg(l.status order by l.created_at desc, l.id desc))[1] as last_status
from public.leads l
where l.phone is not null
  and l.source is distinct from 'meta_lead_ads'
group by 1;

-- 6) 채널톡 상담 — phone_key 당 1행 집계. 채널톡 동기화는 숫자만 저장(예 8210…)하므로 함수로 010… 복원.
--    transcript·last_message_text·first_question·name·email·phone 은 제외.
create or replace view public.home_channel_contacts_v as
select
  public.norm_phone_key(c.phone) as phone_key,
  count(*)::int as conversations,
  sum(c.message_count)::int as messages,
  max(c.last_message_at) as last_message_at,
  bool_or(c.matched_lead_id is not null) as matched_home_lead
from public.channel_conversations c
where c.phone is not null
group by 1;

-- 권한: service_role만 SELECT. Supabase 기본권한이 부여한 공개 접근은 명시 회수.
revoke all on public.home_owner_directory_v,
              public.home_neo_accounts_v,
              public.home_site_leads_v,
              public.home_channel_contacts_v
  from anon, authenticated;

grant select on public.home_owner_directory_v,
                public.home_neo_accounts_v,
                public.home_site_leads_v,
                public.home_channel_contacts_v
  to service_role;

comment on view public.home_owner_directory_v is
  '어드민 admin_profiles → Compass 역브리지 — 담당자 표시명·CRM owner 키·별칭·NEO owner id. Compass 가 담당자 매핑 원본으로 읽는다.';
comment on view public.home_neo_accounts_v is
  '어드민 crm_neo_customer_snapshots → Compass 역브리지 — NEO 고객 요약. phone_key=norm_phone_key(phone), 원문 전화 제외.';
comment on view public.home_site_leads_v is
  '어드민 public.leads → Compass 역브리지 — phone_key 당 문의 건수·최근 시각·최근 출처·상태. 이름·기관·이메일·메시지 제외, meta_lead_ads 제외.';
comment on view public.home_channel_contacts_v is
  '어드민 channel_conversations → Compass 역브리지 — phone_key 당 상담 건수·메시지 수·최근 시각·홈페이지 리드 매칭 여부. 대화 본문 제외.';
