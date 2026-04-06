-- ============================================================
-- Classin Home — newsletter_subscribers 테이블 추가
-- Supabase SQL Editor에 복사 → 실행
-- ============================================================

-- ─── newsletter_subscribers ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  name              TEXT,
  tags              TEXT[] DEFAULT '{}',
  source            TEXT DEFAULT 'newsletter',
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','unsubscribed')),
  opt_in_at         TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  unsubscribed_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TRIGGER newsletter_subscribers_updated_at
  BEFORE UPDATE ON public.newsletter_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_email
  ON public.newsletter_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_status
  ON public.newsletter_subscribers(status);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_created_at
  ON public.newsletter_subscribers(created_at DESC);

COMMENT ON TABLE public.newsletter_subscribers IS '뉴스레터 구독자 — 이메일 수신 동의 이력 포함';

-- ─── RLS ────────────────────────────────────────────────────

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- 누구나 구독(INSERT) 가능 — 공개 폼에서 호출
CREATE POLICY "Anyone can subscribe"
  ON public.newsletter_subscribers FOR INSERT
  WITH CHECK (true);

-- 관리자만 전체 조회/수정/삭제
CREATE POLICY "Admins read subscribers"
  ON public.newsletter_subscribers FOR SELECT
  USING (is_active_admin());

CREATE POLICY "Admins update subscribers"
  ON public.newsletter_subscribers FOR UPDATE
  USING (is_active_admin());

CREATE POLICY "Admins delete subscribers"
  ON public.newsletter_subscribers FOR DELETE
  USING (is_active_admin());

-- ─── 완료 ───────────────────────────────────────────────────
-- 실행 후 Supabase Dashboard → Table Editor에서 newsletter_subscribers 확인
