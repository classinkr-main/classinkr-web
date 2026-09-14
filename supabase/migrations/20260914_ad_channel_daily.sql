-- ─────────────────────────────────────────────────────────────
-- 광고 채널 일자별 성과 스냅샷 — Google Ads · 네이버 검색광고
--
-- 20260820_meta_insights_daily.sql 과 같은 계열(크론이 trailing 재적재 upsert,
-- perf 조립이 [since, until] 범위로 읽는다). 채널마다 테이블을 따로 두는 이유는
-- 고유 지표가 서로 다르기 때문이다 — Meta 는 reach·actions[], Google 은 클릭 시각
-- 귀속 conversions, 네이버는 평균노출순위·전환수. 한 테이블에 몰면 NULL 밭이 되고
-- 컬럼별 CHECK 도 못 건다. 화면이 보는 공통 형태는 읽기 레이어
-- (lib/marketing/ad-insights.ts)가 만든다.
--
-- 공통 규약(Meta 와 동일):
--  - spend 는 **계정 통화 네이티브**. KRW 환산·합산 금지(정직 규칙).
--  - date 는 광고 플랫폼이 준 일자 문자열 그대로 — 우리 타임존으로 재계산하지 않는다.
--  - synced_at 은 감사용. 같은 배치는 같은 값을 쓴다.
-- ─────────────────────────────────────────────────────────────

-- ─── Google Ads ──────────────────────────────────────────────
-- 원천: GoogleAdsService.searchStream (GAQL, segments.date 로 일자 분해).
-- ⚠️ spend 는 metrics.cost_micros ÷ 1,000,000 을 저장한다(마이크로 단위 그대로 넣지 않는다).
-- ⚠️ conversions 는 **클릭 시각 귀속**이라 과거 일자 값이 계속 바뀐다 — 크론이 trailing 7일을
--    재적재하는 이유이고, 이 테이블의 과거 행은 "확정값"이 아니다.
-- conversions 가 NUMERIC 인 것도 의도 — Google 은 부분전환(0.5 등) 값을 돌려준다.
CREATE TABLE IF NOT EXISTS public.google_ads_daily (
  date          DATE NOT NULL,
  campaign_id   TEXT NOT NULL,
  campaign_name TEXT,
  spend         NUMERIC NOT NULL DEFAULT 0,
  impressions   BIGINT  NOT NULL DEFAULT 0,
  clicks        BIGINT  NOT NULL DEFAULT 0,
  conversions   NUMERIC NOT NULL DEFAULT 0,
  currency      TEXT,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (date, campaign_id)
);

-- ─── 네이버 검색광고 ─────────────────────────────────────────
-- 원천: api.searchad.naver.com — /stat-reports(대용량 보고서, 일자별) 또는 /stats.
-- ⚠️ salesAmt 는 **KRW · VAT 별도**다. 화면 라벨에 VAT 포함 여부를 명시할 것.
-- ⚠️ conversions(ccnt)는 프리미엄 로그분석/전환추적이 연동된 계정에서만 값이 온다 —
--    연동 전에는 0 이 아니라 "측정 없음"이므로, 읽기 레이어가 0 을 CPA 분모로 쓰지 않는다.
-- currency 를 컬럼으로 둔 이유는 Meta·Google 과 읽기 형태를 맞추기 위해서다(항상 KRW).
CREATE TABLE IF NOT EXISTS public.naver_ads_daily (
  date          DATE NOT NULL,
  campaign_id   TEXT NOT NULL,              -- nccCampaignId
  campaign_name TEXT,
  spend         NUMERIC NOT NULL DEFAULT 0, -- salesAmt (KRW, VAT 별도)
  impressions   BIGINT  NOT NULL DEFAULT 0, -- impCnt
  clicks        BIGINT  NOT NULL DEFAULT 0, -- clkCnt
  conversions   NUMERIC NOT NULL DEFAULT 0, -- ccnt
  currency      TEXT NOT NULL DEFAULT 'KRW',
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (date, campaign_id)
);

-- date 단독 인덱스는 두지 않는다 — PRIMARY KEY (date, campaign_id) 의 선행 컬럼이
-- date 범위 스캔(perf 의 [since, until] 조회)을 이미 커버한다(meta_insights_daily 와 동일).

-- ─── RLS: admin/service-role 전용(deny-all 기본) ─────────────
-- 정책을 두지 않아 anon/authenticated 키는 전 행 차단, service_role 만 우회한다.
ALTER TABLE public.google_ads_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.naver_ads_daily  ENABLE ROW LEVEL SECURITY;
