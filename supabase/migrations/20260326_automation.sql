-- ─────────────────────────────────────────────────────────────
-- 마케팅 자동화 테이블 마이그레이션
-- 생성일: 2026-03-26
-- 브랜치: marketing_auto
-- ─────────────────────────────────────────────────────────────

-- ─── 1. 이메일 템플릿 ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  variables   TEXT[] DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. 자동화 규칙 ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS automation_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'active', 'paused')),
  trigger_type    TEXT NOT NULL
                    CHECK (trigger_type IN ('on_submit', 'scheduled', 'delay')),
  trigger_config  JSONB NOT NULL DEFAULT '{}',
  segment_config  JSONB NOT NULL DEFAULT '{}',
  template_id     UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 3. 실행 로그 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS automation_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id           UUID REFERENCES automation_rules(id) ON DELETE CASCADE,
  triggered_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  recipient_count   INT NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'sent', 'failed')),
  error_message     TEXT,
  recipient_emails  TEXT[] DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 인덱스 ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_automation_rules_status
  ON automation_rules (status);

CREATE INDEX IF NOT EXISTS idx_automation_rules_trigger_type
  ON automation_rules (trigger_type);

CREATE INDEX IF NOT EXISTS idx_automation_logs_rule_id
  ON automation_logs (rule_id);

CREATE INDEX IF NOT EXISTS idx_automation_logs_triggered_at
  ON automation_logs (triggered_at DESC);

-- ─── updated_at 자동 갱신 트리거 ─────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_automation_rules_updated_at
  BEFORE UPDATE ON automation_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── RLS 비활성화 (admin 서버 클라이언트만 접근) ─────────────
ALTER TABLE email_templates DISABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules DISABLE ROW LEVEL SECURITY;
ALTER TABLE automation_logs DISABLE ROW LEVEL SECURITY;
