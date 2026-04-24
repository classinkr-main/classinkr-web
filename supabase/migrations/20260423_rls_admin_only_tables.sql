-- RLS 보안 강화: 관리자 전용 테이블(자동화, 알림, 마케팅, 설정)에 deny-all 기본 정책 적용
-- 모든 접근은 service role(createSupabaseAdminClient)를 통해서만 허용한다.
-- anon/authenticated 키가 실수로 사용되어도 이 테이블들은 노출되지 않는다.
-- 명시적 read 접근이 필요해질 경우 이 파일에 정책을 추가한다.

-- ─── Automation ──────────────────────────────────────────
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_delay_queue ENABLE ROW LEVEL SECURITY;

-- ─── Marketing templates / campaigns ─────────────────────
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_campaigns ENABLE ROW LEVEL SECURITY;

-- email_campaigns 은 초기 마이그레이션 추적 이전에 생성돼
-- repo 에 CREATE TABLE 이 없다. 존재 시에만 RLS 활성화한다.
DO $$
BEGIN
  IF to_regclass('public.email_campaigns') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY';
  END IF;
END$$;

-- ─── Notifications / settings ────────────────────────────
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_logs ENABLE ROW LEVEL SECURITY;

-- ─── Newsletter subscribers ──────────────────────────────
-- /api/newsletter/subscribe 은 service role 로 upsert 한다.
-- anon 구독 요청은 서버 라우트에서 받아 service role 로 전달된다.
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
