-- ─────────────────────────────────────────────────────────────
-- campaign_links.ref_type 에 광고 채널 두 종 추가 — google_campaign · naver_campaign
--
-- 우산 캠페인(marketing_campaigns)이 묶는 채널 실행에 Google Ads 캠페인과
-- 네이버 검색광고 캠페인을 더한다. 원본 CHECK 는 20260724_marketing_campaigns.sql 에서
-- 컬럼 인라인 제약으로 만들어졌고, Postgres 가 붙인 이름이 campaign_links_ref_type_check 다.
--
-- ref_id 에 들어가는 값:
--   google_campaign → Google Ads campaign.id (숫자 문자열)
--   naver_campaign  → 네이버 nccCampaignId (예: cmp-a001-01-000000001234567)
-- 둘 다 각 채널 일자 테이블(google_ads_daily / naver_ads_daily)의 campaign_id 와 같은 값이라,
-- 롤업은 링크 하나로 그 채널 스냅샷을 찾아간다.
--
-- ⚠️ 런타임 SSOT 는 lib/types/marketing-campaign.ts 의 CAMPAIGN_REF_TYPES 다.
--    이 CHECK 와 그 배열은 항상 같이 바뀌어야 한다(한쪽만 늘리면 저장은 되는데 UI 가 못 읽거나,
--    UI 가 보내는데 DB 가 거부한다).
--
-- 기존 행에는 영향이 없다 — 허용 집합을 넓히기만 하므로 재검증이 실패할 수 없다.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.campaign_links
  DROP CONSTRAINT IF EXISTS campaign_links_ref_type_check;

ALTER TABLE public.campaign_links
  ADD CONSTRAINT campaign_links_ref_type_check
  CHECK (ref_type IN (
    'email_campaign',
    'sms_campaign',
    'event',
    'meta_campaign',
    'google_campaign',
    'naver_campaign'
  ));
