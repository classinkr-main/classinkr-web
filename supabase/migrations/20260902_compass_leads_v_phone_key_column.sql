-- 2026-09-02 compass_leads_v.phone_key — 뷰 안 정규식 계산을 crm.leads.phone_key 생성 컬럼 읽기로 전환.
--
-- 배경: Admin 이 compass_leads_v 를 .in("phone_key", …) 로 조회할 때마다 phone_key 가 뷰 안의
-- 계산 컬럼이라 crm.leads 전체가 정규식 스캔됐다(docs/active/admin-performance-plan-2026-09-02.md §4.8,
-- lib/compass/bridge.ts 의 60초 메모는 임시 처방). 근본 해결은 Compass 쪽 생성 컬럼 + 인덱스다.
--
-- 소유권: crm 스키마 DDL 은 Compass 저장소(classinkr-main/crm, scripts/schema.sql)가 소유한다
-- (docs/active/supabase-shared-db-consolidation-analysis-2026-09-02.md §6.4 계약). 그래서 이 파일은
-- 컬럼을 만들지 않는다 — Compass 의 phone_key 컬럼이 이미 있을 때만 뷰를 갈아 끼우고, 없으면
-- NOTICE 만 남기고 기존 뷰(정규식 계산, 20260828_compass_bridge_views.sql)를 그대로 둔다.
-- 순서: Compass scripts/schema.sql 적용 → 이 migration 재실행(멱등).
--
-- 컬럼 정의식(Compass 측)은 뷰의 기존 식과 바이트 단위로 같아야 한다:
--   nullif(regexp_replace(regexp_replace(regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g'), '^0082', '82'), '^82', '0'), '')
-- 뷰의 컬럼 이름·순서·타입은 20260828 정의와 동일하게 유지한다(CREATE OR REPLACE VIEW 제약).
-- 권한(REVOKE anon/authenticated, GRANT service_role)과 COMMENT 는 뷰 교체 뒤에도 유지된다.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'crm' and table_name = 'leads' and column_name = 'phone_key'
  ) then
    execute $view$
      create or replace view public.compass_leads_v as
      select
        l.id,
        l.academy,
        l.name,
        l.phone_key,
        lower(nullif(trim(l.email), '')) as email_key,
        l.stage,
        l.lost_reason,
        l.owner,
        l.caller,
        l.team,
        l.channel,
        l.platform,
        l.meta_ad_id,
        l.campaign_id,
        l.source_tab,
        l.subject,
        l.region,
        l.created_at,
        l.updated_at,
        l.last_inflow_at,
        l.callback_at,
        l.demo_at,
        l.account_at,
        l.neocrm_registered_at,
        l.care_stage,
        l.care_track,
        l.next_action_at,
        l.next_action,
        l.bd_owner,
        l.bd_prob,
        l.bd_contact_at,
        l.bd_paid_at,
        l.paid_amount,
        l.paid_month
      from crm.leads l
    $view$;
    raise notice 'compass_leads_v: phone_key now reads crm.leads.phone_key (generated column)';
  else
    raise notice 'compass_leads_v: crm.leads.phone_key missing — apply Compass scripts/schema.sql first; view unchanged';
  end if;
end $$;
