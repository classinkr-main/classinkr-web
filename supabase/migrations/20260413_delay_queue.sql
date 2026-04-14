-- ─────────────────────────────────────────────────────────────
-- automation_delay_queue  —  on_submit + delay 트리거 발송 큐
-- ─────────────────────────────────────────────────────────────
-- delay 트리거 규칙이 매칭되면 즉시 발송하지 않고 이 큐에
-- 예약 항목을 삽입한다. cron(/api/cron/automation)이 주기적으로
-- scheduled_at <= now() 인 pending 항목을 처리하여 이메일을 발송한다.

CREATE TABLE IF NOT EXISTS automation_delay_queue (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id          UUID        NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  recipient_email  TEXT        NOT NULL,
  recipient_name   TEXT,
  recipient_data   JSONB,          -- 수신자 전체 객체 (변수 치환용)
  scheduled_at     TIMESTAMPTZ NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_delay_queue_status_scheduled
  ON automation_delay_queue(status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_delay_queue_rule_id
  ON automation_delay_queue(rule_id);
