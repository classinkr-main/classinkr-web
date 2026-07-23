-- ─────────────────────────────────────────────────────────────
-- 크로스채널 캠페인 개체(D1) — Approach A: 연결·롤업 레이어
--
-- 목적:
-- 채널별 실행(email_campaigns·sms_campaigns·public_events·Meta)으로 파편화된
-- "캠페인"을, 이들을 연결·롤업하는 크로스채널 캠페인 1급 개체로 통합한다.
-- 기존 채널 실행 테이블은 불변(untouched) — 이 레이어는 우산(umbrella)으로서
-- 링크된 실행의 지표를 읽기시점에 롤업만 한다.
--
--   1) marketing_campaigns — 캠페인 개체(이름·목표·상태·채널·기간·예산·담당·프로젝트)
--   2) campaign_links      — 캠페인 ↔ 채널 실행 링크(email/sms/event/meta, ref_id 문자열)
--
-- project_id 는 지금은 bare nullable 컬럼(FK 없음) — D3(marketing_projects) 마이그레이션에서
-- marketing_projects 생성 후 project_id FK 를 추가한다.
-- ─────────────────────────────────────────────────────────────

-- ─── 1. 캠페인 개체 ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  objective   TEXT,
  status      TEXT NOT NULL DEFAULT 'planned'
                CHECK (status IN ('planned', 'active', 'paused', 'done')),
  channels    TEXT[] NOT NULL DEFAULT '{}',   -- 선언 채널(정보성): email/sms/kakao/meta/event/search/display 등
  starts_at   DATE,
  ends_at     DATE,
  budget      BIGINT,                          -- KRW, nullable
  owner       TEXT,
  project_id  UUID,                            -- D3에서 marketing_projects FK 연결(지금은 nullable 컬럼만)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. 캠페인 ↔ 채널 실행 링크 ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  ref_type    TEXT NOT NULL
                CHECK (ref_type IN ('email_campaign', 'sms_campaign', 'event', 'meta_campaign')),
  ref_id      TEXT NOT NULL,                   -- 링크 대상 실행의 id(문자열: uuid 또는 Meta 캠페인 id)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, ref_type, ref_id)
);

-- ─── 인덱스 ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_campaign_links_campaign
  ON public.campaign_links (campaign_id);

-- ─── updated_at 자동 갱신 트리거 ─────────────────────────────
-- 20260326_automation.sql 이 정의한 범용 함수와 동일(CREATE OR REPLACE 로 idempotent·self-contained).
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_marketing_campaigns_updated_at ON public.marketing_campaigns;
CREATE TRIGGER trg_marketing_campaigns_updated_at
  BEFORE UPDATE ON public.marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── RLS: admin/service-role 전용(deny-all 기본) ─────────────
-- 20260423_rls_admin_only_tables 패턴과 동일: RLS 를 ENABLE 하되 정책을 두지 않아
-- anon/authenticated 키는 차단, service_role(createSupabaseAdminClient)만 우회 접근한다.
-- 명시적 read 접근이 필요해지면 여기에 정책을 추가한다.
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_links ENABLE ROW LEVEL SECURITY;
