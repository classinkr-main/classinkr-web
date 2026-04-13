-- ============================================================
-- 스키마 누락 항목 일괄 수정
-- ============================================================

-- ─── 1. lead_contact_logs 테이블 생성 ────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_contact_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  type          TEXT        NOT NULL CHECK (type IN ('call', 'sms', 'kakao', 'email')),
  result        TEXT        CHECK (result IN ('answered', 'no_answer', 'callback', 'meeting_set')),
  notes         TEXT,
  contacted_by  TEXT,
  contacted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_contact_logs_lead_id
  ON public.lead_contact_logs (lead_id);

ALTER TABLE public.lead_contact_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage contact logs"
  ON public.lead_contact_logs
  FOR ALL
  USING (is_active_admin())
  WITH CHECK (is_active_admin());

-- ─── 2. newsletter_subscribers 테이블 생성 ───────────────────
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email            TEXT        NOT NULL UNIQUE,
  name             TEXT,
  tags             TEXT[]      NOT NULL DEFAULT '{}',
  source           TEXT        NOT NULL DEFAULT 'unknown',
  status           TEXT        NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'unsubscribed')),
  opt_in_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  unsubscribed_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_email
  ON public.newsletter_subscribers (email);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_status
  ON public.newsletter_subscribers (status);

-- RLS 없음 — 서비스롤(admin 클라이언트)로만 접근

-- ─── 3. quotes 누락 컬럼 추가 ────────────────────────────────
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS version  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lead_id  TEXT;

-- ─── 4. quote_items 누락 컬럼 추가 ──────────────────────────
ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS sku TEXT;

-- ─── 5. partners 누락 컬럼 추가 ─────────────────────────────
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS installation_sub_dates TEXT[];

-- ─── 6. teams RLS 정책 추가 ──────────────────────────────────
CREATE POLICY "Admins manage teams"
  ON public.teams
  FOR ALL
  USING (is_active_admin())
  WITH CHECK (is_active_admin());

-- ─── 7. install_schedules RLS 정책 추가 ─────────────────────
CREATE POLICY "Admins manage install schedules"
  ON public.install_schedules
  FOR ALL
  USING (is_active_admin())
  WITH CHECK (is_active_admin());
