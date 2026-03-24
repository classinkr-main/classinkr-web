-- ============================================================
-- Classin Home — Phase 1 테이블 생성
-- Supabase SQL Editor에 복사 → 실행
-- 순서: admin_profiles → blog_posts → leads → audit_logs → RLS
-- ============================================================

-- ─── 0. 헬퍼 함수 ───────────────────────────────────────────

-- 현재 사용자가 활성 관리자인지 확인
CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE user_id = auth.uid()
    AND status = 'ACTIVE'
  )
$$ LANGUAGE sql SECURITY DEFINER;

-- updated_at 자동 갱신 트리거 함수
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ─── 1. admin_profiles ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.admin_profiles (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN','ADMIN','EDITOR','VIEWER')),
  status        TEXT NOT NULL DEFAULT 'INVITED' CHECK (status IN ('INVITED','ACTIVE','SUSPENDED')),
  invited_by    UUID REFERENCES auth.users(id),
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TRIGGER admin_profiles_updated_at
  BEFORE UPDATE ON public.admin_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

COMMENT ON TABLE public.admin_profiles IS '관리자 프로필 — 역할/상태 관리';


-- ─── 2. blog_posts ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.blog_posts (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title             TEXT NOT NULL,
  slug              TEXT NOT NULL UNIQUE,
  excerpt           TEXT,
  content_markdown  TEXT,
  content_html      TEXT,
  category          TEXT,
  tags              TEXT[] DEFAULT '{}',
  author_name       TEXT,
  author_role       TEXT,
  author_bio        TEXT,
  author_avatar_url TEXT,
  author_user_id    UUID REFERENCES auth.users(id),
  read_time         TEXT,
  image_url         TEXT,
  hero_image_url    TEXT,
  featured          BOOLEAN DEFAULT FALSE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT','IN_REVIEW','PUBLISHED','ARCHIVED')),
  seo_title         TEXT,
  seo_description   TEXT,
  benefit_items     TEXT[] DEFAULT '{}',
  target_reader     TEXT,
  cta_text          TEXT,
  cta_url           TEXT,
  cta_style         TEXT DEFAULT 'primary',
  related_post_ids  UUID[] DEFAULT '{}',
  published_at      TIMESTAMPTZ,
  published_by      UUID REFERENCES auth.users(id),
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TRIGGER blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON public.blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON public.blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON public.blog_posts(category);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at ON public.blog_posts(published_at DESC);

COMMENT ON TABLE public.blog_posts IS '블로그 게시글 — DRAFT/IN_REVIEW/PUBLISHED/ARCHIVED';


-- ─── 3. leads ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.leads (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source        TEXT NOT NULL,
  name          TEXT,
  org           TEXT,
  role          TEXT,
  size          TEXT,
  email         TEXT,
  phone         TEXT,
  message       TEXT,
  branch        TEXT,
  status        TEXT NOT NULL DEFAULT 'new'
                CHECK (status IN ('new','contacted','converted','closed')),
  notes         TEXT,
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_source ON public.leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at DESC);

COMMENT ON TABLE public.leads IS '리드 — 데모신청/문의/뉴스레터 수집';


-- ─── 4. audit_logs ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_user_id   UUID REFERENCES auth.users(id),
  action          TEXT NOT NULL,
  target_type     TEXT NOT NULL,
  target_id       TEXT,
  payload         JSONB,
  ip_address      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

COMMENT ON TABLE public.audit_logs IS '감사 로그 — 관리자 행위 추적';


-- ─── 5. RLS 정책 ────────────────────────────────────────────

-- admin_profiles: 관리자만 조회/수정
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read profiles"
  ON public.admin_profiles FOR SELECT
  USING (is_active_admin());

CREATE POLICY "Admins can update profiles"
  ON public.admin_profiles FOR UPDATE
  USING (is_active_admin());

-- 자기 자신의 프로필은 항상 읽기 가능
CREATE POLICY "Users can read own profile"
  ON public.admin_profiles FOR SELECT
  USING (user_id = auth.uid());


-- blog_posts: 공개 READ(PUBLISHED) + 관리자 전체
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public reads published posts"
  ON public.blog_posts FOR SELECT
  USING (
    (status = 'PUBLISHED' AND deleted_at IS NULL)
    OR is_active_admin()
  );

CREATE POLICY "Admins insert posts"
  ON public.blog_posts FOR INSERT
  WITH CHECK (is_active_admin());

CREATE POLICY "Admins update posts"
  ON public.blog_posts FOR UPDATE
  USING (is_active_admin());

CREATE POLICY "Admins delete posts"
  ON public.blog_posts FOR DELETE
  USING (is_active_admin());


-- leads: 누구나 INSERT + 관리자 관리
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit lead"
  ON public.leads FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins read leads"
  ON public.leads FOR SELECT
  USING (is_active_admin());

CREATE POLICY "Admins update leads"
  ON public.leads FOR UPDATE
  USING (is_active_admin());

CREATE POLICY "Admins delete leads"
  ON public.leads FOR DELETE
  USING (is_active_admin());


-- audit_logs: 관리자만 읽기, 서비스롤만 쓰기
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read audit logs"
  ON public.audit_logs FOR SELECT
  USING (is_active_admin());

-- INSERT는 서비스롤(admin 클라이언트)로만 하므로 별도 정책 불필요


-- ─── 완료 ───────────────────────────────────────────────────
-- 실행 후 Supabase Dashboard → Table Editor에서 4개 테이블 확인
