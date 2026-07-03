-- message_logs: 발송 레이어(solapi SMS/LMS/알림톡 등) per-recipient 발송 기록.
-- lib/messaging/send.ts 가 모든 발송 결과를 이 테이블에 정직하게 기록한다.
-- (성공/실패/시뮬레이션을 부풀리지 않고 그대로 저장)

CREATE TABLE IF NOT EXISTS public.message_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel      TEXT        NOT NULL
                           CHECK (channel IN (
                             'sms', 'lms', 'kakao_alimtalk', 'kakao_friendtalk', 'email'
                           )),
  provider     TEXT        NOT NULL DEFAULT 'solapi',
  recipient    TEXT        NOT NULL,
  template_id  TEXT,
  group_id     TEXT,
  status       TEXT        NOT NULL
                           CHECK (status IN ('requested', 'sent', 'failed', 'simulated')),
  status_code  TEXT,
  error        TEXT,
  context      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS message_logs_created_at_idx
  ON public.message_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS message_logs_channel_idx
  ON public.message_logs (channel);

-- RLS: 관리자 전용(service role 만 접근). 20260423_rls_admin_only_tables.sql 패턴 —
-- 정책을 두지 않으면 anon/authenticated 는 전면 차단되고,
-- createSupabaseAdminClient(service role)만 우회한다.
ALTER TABLE public.message_logs ENABLE ROW LEVEL SECURITY;
