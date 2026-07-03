-- email_campaigns 백필: repo 에 CREATE TABLE 이 없는 고아 테이블.
-- app/api/admin/email/send/route.ts → lib/repositories/marketing.ts 및
-- supabase/migrations/20260413_email_tracking.sql 이 사용하는 컬럼을 코드 근거로만 재현한다.
-- 이미 프로덕션에 존재하므로 IF NOT EXISTS 로 무해하게 정의(추측 컬럼 없음).
--
-- 근거:
--   lib/repositories/marketing.ts createCampaign():
--     subject, body, target_tags, status, sent_at, recipient_count, external_id
--   lib/repositories/marketing.ts updateCampaign(): open_count
--   marketing-types.ts EmailCampaign.status: 'draft' | 'sent' | 'failed'
--   20260413_email_tracking.sql: open_count INT NOT NULL DEFAULT 0
--                                + increment_campaign_open_count(campaign_id UUID)

CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject          TEXT        NOT NULL,
  body             TEXT        NOT NULL,
  target_tags      TEXT[]      NOT NULL DEFAULT '{}',
  status           TEXT        NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft', 'sent', 'failed')),
  sent_at          TIMESTAMPTZ,
  recipient_count  INT         NOT NULL DEFAULT 0,
  open_count       INT         NOT NULL DEFAULT 0,
  external_id      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 열람 추적 증가 RPC(/api/track/open). 20260413_email_tracking.sql 과 동일 — 재적용 무해.
CREATE OR REPLACE FUNCTION public.increment_campaign_open_count(campaign_id UUID)
RETURNS VOID LANGUAGE SQL SECURITY DEFINER AS $$
  UPDATE public.email_campaigns
  SET open_count = open_count + 1
  WHERE id = campaign_id;
$$;

-- RLS: 관리자 전용. 20260423_rls_admin_only_tables.sql 이 존재 시 조건부로 RLS 를 켜므로
-- 여기서 명시적으로 CREATE TABLE 이 앞서 실행돼도 안전하게 다시 활성화한다.
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
