-- Meta 캠페인 일자별 성과 스냅샷 — 크론(sync-meta-insights)이 trailing 3일 upsert,
-- scripts/backfill-meta-insights.mjs 가 과거 12개월 1회 백필한다.
-- date 는 Meta insights 의 date_start(광고 계정 타임존 기준 일자) 그대로 저장.
-- spend 는 계정 통화 네이티브(currency 컬럼) — KRW 환산 금지(정직 규칙).
CREATE TABLE IF NOT EXISTS public.meta_insights_daily (
  date          DATE NOT NULL,
  campaign_id   TEXT NOT NULL,
  campaign_name TEXT,
  spend         NUMERIC NOT NULL DEFAULT 0,
  impressions   BIGINT NOT NULL DEFAULT 0,
  reach         BIGINT NOT NULL DEFAULT 0,
  clicks        BIGINT NOT NULL DEFAULT 0,
  ctr           NUMERIC,
  cpc           NUMERIC,
  cpm           NUMERIC,
  leads         INTEGER NOT NULL DEFAULT 0,
  currency      TEXT,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (date, campaign_id)
);

-- date 단독 인덱스는 두지 않는다 — PRIMARY KEY (date, campaign_id) 의 선행 컬럼이
-- date 범위 스캔(perf API 의 [since, until] 조회)을 이미 커버한다.
ALTER TABLE public.meta_insights_daily ENABLE ROW LEVEL SECURITY;
