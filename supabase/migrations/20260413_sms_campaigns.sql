-- SMS 캠페인 발송 이력 테이블
-- provider-ready stub: 실제 SMS API 연동 전까지 발송 기록만 저장
CREATE TABLE IF NOT EXISTS sms_campaigns (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message          TEXT        NOT NULL,
  target_tags      TEXT[]      NOT NULL DEFAULT '{}',
  recipient_count  INT         NOT NULL DEFAULT 0,
  status           TEXT        NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft', 'sent', 'failed')),
  sent_at          TIMESTAMPTZ,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
