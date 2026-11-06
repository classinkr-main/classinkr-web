-- ─────────────────────────────────────────────────────────────
-- Google Ads 일자 스냅샷에 캠페인 유형 · 유튜브 조회수 (2026-11-06)
--
-- 20260914_ad_channel_daily.sql 의 google_ads_daily 에 칸 두 개를 더한다. Compass(같은 DB)의
-- 광고 탭 「구글」이 이 표를 읽어 유튜브(동영상·디맨드젠)와 검색을 가르고 조회당 비용을 낸다.
--
--   channel_type  campaign.advertising_channel_type 원문(VIDEO · DEMAND_GEN · SEARCH ·
--                 PERFORMANCE_MAX · DISPLAY …). 캠페인 이름으로 유형을 추측하지 않으려고 둔다.
--   video_views   metrics.video_trueview_views — 구글 화면의 'TrueView 조회수'(2025-10 개명 전 '조회수').
--                 API v22 에서 metrics.video_views 가 이 이름으로 바뀌었다. 동영상이 아닌 캠페인은 0.
--
-- 둘 다 NULL 허용이다. NULL = 이 칸이 생기기 전에 쌓인 행(아직 다시 받지 않음)이고 "0회"가 아니다.
-- 크론이 trailing 7일을 다시 받으므로 적용 뒤 첫 실행부터 최근 7일이 채워진다.
--
-- ⚠️ 이 칸을 쓰는 크론 코드보다 **먼저** 적용한다 — 없으면 upsert 가 칸을 못 찾아 크론이 매번 실패한다.
-- 재실행 무해(IF NOT EXISTS). RLS·권한은 원 표 그대로(deny-all, service_role 만).
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.google_ads_daily
  ADD COLUMN IF NOT EXISTS channel_type TEXT,
  ADD COLUMN IF NOT EXISTS video_views  BIGINT;

COMMENT ON COLUMN public.google_ads_daily.channel_type IS
  'campaign.advertising_channel_type 원문(VIDEO·DEMAND_GEN·SEARCH·PERFORMANCE_MAX…). NULL = 칸 생기기 전 행.';
COMMENT ON COLUMN public.google_ads_daily.video_views IS
  'metrics.video_trueview_views(TrueView 조회수). 동영상 아닌 캠페인은 0, NULL = 칸 생기기 전 행(0회 아님).';
