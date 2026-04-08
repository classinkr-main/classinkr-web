CREATE TABLE teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER teams_updated_at BEFORE UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE install_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id     UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  quote_item_id   UUID REFERENCES quote_items(id) ON DELETE SET NULL,
  partner_id      UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  manager_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  team_id         UUID REFERENCES teams(id) ON DELETE SET NULL,
  scheduled_date  DATE NOT NULL,
  location        TEXT,
  status          TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'confirmed', 'completed', 'cancelled')),
  requested_by    TEXT NOT NULL DEFAULT 'admin' CHECK (requested_by IN ('admin', 'partner')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER install_schedules_updated_at BEFORE UPDATE ON install_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_install_schedules_contract_id    ON install_schedules(contract_id);
CREATE INDEX idx_install_schedules_partner_id     ON install_schedules(partner_id);
CREATE INDEX idx_install_schedules_team_id        ON install_schedules(team_id);
CREATE INDEX idx_install_schedules_scheduled_date ON install_schedules(scheduled_date);
CREATE INDEX idx_install_schedules_status         ON install_schedules(status);

ALTER TABLE teams             ENABLE ROW LEVEL SECURITY;
ALTER TABLE install_schedules ENABLE ROW LEVEL SECURITY;
