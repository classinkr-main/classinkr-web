-- Compass 브리지 뷰 — 마케팅팀 앱(mkt.classin.co.kr, classinkr-main/crm)의 crm 스키마를
-- 어드민이 읽기 전용으로 소비하기 위한 계약 계층.
--
-- 설계 원칙 (2026-08-28 연결 진단 리포트 기준):
--  * crm 스키마에는 DDL 0건 — Compass 소유. 뷰는 전부 public에 만든다.
--  * 뷰는 definer(소유자 postgres) 권한으로 실행된다. service_role에 crm USAGE를 주지
--    않고 아래 컬럼 스코프만 연다. Supabase 린터의 security-definer-view 경고는 의도된 설계.
--  * PII 최소화: 전화 원문 대신 정규화 키(phone_key)만 노출한다.
--  * fail loud: Compass가 crm 컬럼을 rename하면 뷰가 소리 내며 깨진다(무음 오염 금지).
--    Compass 팀과의 계약 = 컬럼 rename 사전 공유.
--  * Supabase 기본권한이 public 신규 객체에 anon/authenticated SELECT를 부여하므로
--    반드시 명시적으로 REVOKE한다(공개 노출 차단).

-- 1) 리드 — 상태·재유입·NeoCRM 표식·담당 3역할. note/memo류 장문은 제외.
CREATE OR REPLACE VIEW public.compass_leads_v AS
SELECT
  l.id,
  l.academy,
  l.name,
  NULLIF(
    regexp_replace(
      regexp_replace(
        regexp_replace(COALESCE(l.phone, ''), '[^0-9]', '', 'g'),
        '^0082', '82'),
      '^82', '0'),
    '') AS phone_key,
  lower(NULLIF(trim(l.email), '')) AS email_key,
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
FROM crm.leads l;

-- 2) 활동 타임라인 — 고객 360 병합용. body(콜/미팅 기록)는 서버 전용 경로로만 소비할 것.
CREATE OR REPLACE VIEW public.compass_activities_v AS
SELECT a.id, a.lead_id, a.kind, a.body, a.from_stage, a.to_stage, a.actor, a.created_at
FROM crm.activities a
WHERE a.deleted_at IS NULL;

-- 3) 광고 소재 단위 일별 성과 + 크리에이티브 + 별칭. "캠페인 레벨만 가능" 전제를 깨는 뷰.
CREATE OR REPLACE VIEW public.compass_ads_v AS
SELECT
  d.day,
  d.ad_id,
  COALESCE(a_al.alias, m.ad_name, d.ad_name) AS ad_name,
  m.adset_id,
  COALESCE(s_al.alias, m.adset_name) AS adset_name,
  d.campaign_id,
  COALESCE(c_al.alias, m.campaign_name) AS campaign_name,
  m.category,
  m.creative_thumb,
  m.creative_image,
  m.creative_title,
  m.creative_body,
  d.spend_usd,
  d.leads,
  d.clicks,
  d.impressions,
  d.synced_at
FROM crm.meta_ad_daily d
LEFT JOIN crm.meta_ads   m    ON m.ad_id = d.ad_id
LEFT JOIN crm.meta_alias a_al ON a_al.ref_id = d.ad_id
LEFT JOIN crm.meta_alias s_al ON s_al.ref_id = m.adset_id
LEFT JOIN crm.meta_alias c_al ON c_al.ref_id = d.campaign_id;

-- 4) 광고세트 단위 일별 성과 + 별칭.
CREATE OR REPLACE VIEW public.compass_adsets_v AS
SELECT
  d.day,
  d.adset_id,
  COALESCE(al.alias, d.adset_name) AS adset_name,
  d.campaign_id,
  COALESCE(cal.alias, d.campaign_name) AS campaign_name,
  d.spend_usd,
  d.leads,
  d.clicks,
  d.impressions,
  d.synced_at
FROM crm.ad_adset_daily d
LEFT JOIN crm.meta_alias al  ON al.ref_id = d.adset_id
LEFT JOIN crm.meta_alias cal ON cal.ref_id = d.campaign_id;

-- 5) 데모 실측 레코드 — 어드민 demo-signal 키워드 추측(오차 3/7)을 대체한다.
CREATE OR REPLACE VIEW public.compass_demos_v AS
SELECT ld.id, ld.lead_id, ld.day, ld.kind, ld.status, ld.owner, ld.source,
       ld.memo, ld.day_approx, ld.bd, ld.created_at
FROM crm.lead_demos ld;

-- 6) 캘린더 미러(구글 'MKT 데모일정' 원본) — 어드민 캘린더의 compass_demo 소스.
CREATE OR REPLACE VIEW public.compass_cal_events_v AS
SELECT ce.key, ce.day, ce."time", ce.title, ce.owners, ce.lead_id, ce.link, ce.synced_at
FROM crm.cal_events ce;

-- 7) 매출 결제 스냅샷 — rev-sheet 대조 배지용 합계 소스(시간당 동기화본).
CREATE OR REPLACE VIEW public.compass_revenue_v AS
SELECT rd.id, rd.month, rd.week, rd.customer, rd.person, rd.status, rd.product,
       rd.amount, rd.team, rd.is_mkt, rd.synced_at
FROM crm.revenue_deals rd;

-- 권한: service_role만 SELECT. Supabase 기본권한이 부여한 공개 접근은 명시 회수.
REVOKE ALL ON public.compass_leads_v,
              public.compass_activities_v,
              public.compass_ads_v,
              public.compass_adsets_v,
              public.compass_demos_v,
              public.compass_cal_events_v,
              public.compass_revenue_v
  FROM anon, authenticated;

GRANT SELECT ON public.compass_leads_v,
                public.compass_activities_v,
                public.compass_ads_v,
                public.compass_adsets_v,
                public.compass_demos_v,
                public.compass_cal_events_v,
                public.compass_revenue_v
  TO service_role;

-- 8) 어드민 자체 재유입 축 — 자체 원천(홈페이지 등) 재제출 시 갱신할 컬럼.
--    기존 행은 created_at으로 백필(재유입 이력 없음 = 최초 유입이 마지막 유입).
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_inflow_at TIMESTAMPTZ;
UPDATE public.leads SET last_inflow_at = created_at WHERE last_inflow_at IS NULL;

COMMENT ON VIEW public.compass_leads_v IS
  'Compass(crm.leads) 읽기 전용 브리지. phone_key=전화 정규화 키(0082/82→0). 쓰기 금지 — 상태 소유권은 Compass.';
COMMENT ON COLUMN public.leads.last_inflow_at IS
  '마지막 유입 시각(재유입 축). 자체 원천 재제출 시 갱신. Compass 리드의 재유입은 compass_leads_v를 읽는다.';
