-- ============================================================
-- Classin Home — Phase 2 테이블 생성
-- Supabase SQL Editor에 복사 → 실행
-- 순서: bug_reports → calendar_events → patch_notes →
--       roadmap_items → site_settings → subscribers → email_campaigns
-- ============================================================


-- ─── 1. bug_reports ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bug_reports (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  severity    TEXT NOT NULL DEFAULT 'medium'
              CHECK (severity IN ('low','medium','high','critical')),
  status      TEXT NOT NULL DEFAULT 'open'
              CHECK (status IN ('open','in-progress','resolved','closed')),
  reporter    TEXT NOT NULL,
  assignee    TEXT,
  tags        TEXT[] DEFAULT '{}',
  environment TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TRIGGER bug_reports_updated_at
  BEFORE UPDATE ON public.bug_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage bug_reports"
  ON public.bug_reports FOR ALL USING (is_active_admin());

COMMENT ON TABLE public.bug_reports IS '버그 리포트 — 관리자 전용';


-- ─── 2. calendar_events ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title       TEXT NOT NULL,
  date        DATE NOT NULL,
  end_date    DATE,
  time        TEXT,
  end_time    TEXT,
  type        TEXT NOT NULL DEFAULT 'other'
              CHECK (type IN ('team','deadline','meeting','launch','holiday','other')),
  description TEXT,
  assignees   TEXT[] DEFAULT '{}',
  all_day     BOOLEAN DEFAULT FALSE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TRIGGER calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON public.calendar_events(date);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage calendar_events"
  ON public.calendar_events FOR ALL USING (is_active_admin());

COMMENT ON TABLE public.calendar_events IS '팀 캘린더 이벤트 — 관리자 전용';


-- ─── 3. patch_notes ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.patch_notes (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  version    TEXT NOT NULL,
  title      TEXT NOT NULL,
  date       DATE NOT NULL,
  status     TEXT NOT NULL DEFAULT 'draft'
             CHECK (status IN ('draft','published')),
  changes    JSONB DEFAULT '[]' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TRIGGER patch_notes_updated_at
  BEFORE UPDATE ON public.patch_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_patch_notes_date ON public.patch_notes(date DESC);

ALTER TABLE public.patch_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage patch_notes"
  ON public.patch_notes FOR ALL USING (is_active_admin());

COMMENT ON TABLE public.patch_notes IS '패치노트 — 관리자 전용';


-- ─── 4. roadmap_items ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.roadmap_items (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  version     TEXT NOT NULL,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'planned'
              CHECK (status IN ('planned','in-progress','done')),
  start_date  DATE,
  target_date DATE,
  features    JSONB DEFAULT '[]' NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TRIGGER roadmap_items_updated_at
  BEFORE UPDATE ON public.roadmap_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.roadmap_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage roadmap_items"
  ON public.roadmap_items FOR ALL USING (is_active_admin());

COMMENT ON TABLE public.roadmap_items IS '로드맵 아이템 — 관리자 전용';


-- ─── 5. site_settings ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.site_settings (
  id                       TEXT PRIMARY KEY DEFAULT 'default',
  demo_form_enabled        BOOLEAN DEFAULT TRUE NOT NULL,
  demo_banner_enabled      BOOLEAN DEFAULT FALSE NOT NULL,
  demo_banner_text         TEXT DEFAULT '' NOT NULL,
  blog_section_enabled     BOOLEAN DEFAULT TRUE NOT NULL,
  notice_banner_enabled    BOOLEAN DEFAULT FALSE NOT NULL,
  notice_banner_text       TEXT DEFAULT '' NOT NULL,
  google_sheet_webhook_url TEXT,
  lead_webhook_url         TEXT,
  channel_talk_webhook_url TEXT,
  email_webhook_url        TEXT,
  updated_at               TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 기본 설정 행 자동 생성
INSERT INTO public.site_settings (id) VALUES ('default') ON CONFLICT DO NOTHING;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage site_settings"
  ON public.site_settings FOR ALL USING (is_active_admin());

COMMENT ON TABLE public.site_settings IS '사이트 설정 — 관리자 전용 단일 행';


-- ─── 6. newsletter_subscribers ──────────────────────────────
-- scripts/003-create-newsletter-subscribers.sql 참고
-- (별도 스크립트로 분리됨)


-- ─── 7. email_campaigns ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subject          TEXT NOT NULL,
  body             TEXT NOT NULL,
  target_tags      TEXT[] DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','sent','failed')),
  sent_at          TIMESTAMPTZ,
  recipient_count  INTEGER DEFAULT 0 NOT NULL,
  external_id      TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_created_at ON public.email_campaigns(created_at DESC);

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage email_campaigns"
  ON public.email_campaigns FOR ALL USING (is_active_admin());

COMMENT ON TABLE public.email_campaigns IS '이메일 캠페인 이력';


-- ─── 완료 ───────────────────────────────────────────────────
-- 실행 후 Supabase Dashboard → Table Editor에서 7개 테이블 확인
