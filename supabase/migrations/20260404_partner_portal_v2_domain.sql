-- ============================================================
-- Partner Portal V2 Domain Model
-- partner_account -> customer -> deal
-- ============================================================

-- NOTE
-- - 기존 partners / quotes / contracts / receipts 모델은 유지한다.
-- - 이 migration은 신규 도메인 모델을 추가하는 초안이다.
-- - 점진적 전환을 위해 구형 모델을 즉시 삭제하지 않는다.

-- ─── ENUM Types ───────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'partner_account_status') THEN
    CREATE TYPE partner_account_status AS ENUM ('active', 'inactive', 'pending');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deal_stage_v2') THEN
    CREATE TYPE deal_stage_v2 AS ENUM (
      'contact',
      'quote',
      'contract',
      'confirmed',
      'installation',
      'payment',
      'closed',
      'cancelled'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deal_status_v2') THEN
    CREATE TYPE deal_status_v2 AS ENUM ('active', 'paused', 'closed', 'cancelled');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'catalog_category_v2') THEN
    CREATE TYPE catalog_category_v2 AS ENUM ('board', 'camera', 'mount', 'install_fee');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quote_document_status_v2') THEN
    CREATE TYPE quote_document_status_v2 AS ENUM ('draft', 'shared', 'accepted', 'expired', 'archived');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contract_document_status_v2') THEN
    CREATE TYPE contract_document_status_v2 AS ENUM ('draft', 'shared', 'partner_signed', 'admin_signed', 'completed', 'cancelled');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'share_access_mode_v2') THEN
    CREATE TYPE share_access_mode_v2 AS ENUM ('view', 'sign');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'installation_status_v2') THEN
    CREATE TYPE installation_status_v2 AS ENUM ('planned', 'confirmed', 'in_progress', 'completed', 'paused', 'cancelled');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'created_by_role_v2') THEN
    CREATE TYPE created_by_role_v2 AS ENUM ('admin', 'partner');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status_v2') THEN
    CREATE TYPE payment_status_v2 AS ENUM ('unpaid', 'partial', 'paid');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'calendar_source_type_v2') THEN
    CREATE TYPE calendar_source_type_v2 AS ENUM ('meeting', 'installation', 'document_due', 'internal');
  END IF;
END $$;

-- ─── Partner Account ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS partner_accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  owner_name        TEXT,
  email             TEXT,
  phone             TEXT,
  business_number   TEXT,
  address           TEXT,
  status            partner_account_status NOT NULL DEFAULT 'active',
  notes             TEXT,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partner_account_users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_account_id  UUID NOT NULL REFERENCES partner_accounts(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role                TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner')),
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended')),
  invited_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_login_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partner_account_id, user_id)
);

-- ─── Customers / Institutions ────────────────────────────

CREATE TABLE IF NOT EXISTS customers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_account_id  UUID NOT NULL REFERENCES partner_accounts(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  contact_name        TEXT,
  email               TEXT,
  phone               TEXT,
  address             TEXT,
  business_number     TEXT,
  campus_name         TEXT,
  region_label        TEXT,
  notes               TEXT,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Product Catalog ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_catalog_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                 TEXT NOT NULL UNIQUE,
  category            catalog_category_v2 NOT NULL,
  product_name        TEXT NOT NULL,
  default_unit_price  NUMERIC(12,0) NOT NULL DEFAULT 0,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO product_catalog_items (sku, category, product_name, default_unit_price, sort_order, metadata)
VALUES
  ('board_86', 'board', '전자칠판 86', 5800000, 10, '{"size":"86"}'::jsonb),
  ('board_75', 'board', '전자칠판 75', 4900000, 20, '{"size":"75"}'::jsonb),
  ('camera_t1', 'camera', 'AI 카메라 T1', 1200000, 30, '{"model":"T1"}'::jsonb),
  ('camera_s1', 'camera', 'AI 카메라 S1', 1200000, 40, '{"model":"S1"}'::jsonb),
  ('mount_stand', 'mount', '거치 스탠드', 0, 50, '{"mountType":"stand"}'::jsonb),
  ('mount_wall', 'mount', '거치 벽걸이', 0, 60, '{"mountType":"wall"}'::jsonb),
  ('mount_embedded', 'mount', '거치 매립', 0, 70, '{"mountType":"embedded"}'::jsonb),
  ('install_fee', 'install_fee', '설치비', 500000, 80, '{}'::jsonb)
ON CONFLICT (sku) DO NOTHING;

-- ─── Deals ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS deals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_account_id  UUID NOT NULL REFERENCES partner_accounts(id) ON DELETE CASCADE,
  customer_id         UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  deal_code           TEXT NOT NULL UNIQUE,
  title               TEXT NOT NULL,
  status              deal_status_v2 NOT NULL DEFAULT 'active',
  current_stage       deal_stage_v2 NOT NULL DEFAULT 'contact',
  expected_amount     NUMERIC(12,0) NOT NULL DEFAULT 0,
  contracted_amount   NUMERIC(12,0) NOT NULL DEFAULT 0,
  installed_amount    NUMERIC(12,0) NOT NULL DEFAULT 0,
  paid_amount         NUMERIC(12,0) NOT NULL DEFAULT 0,
  outstanding_amount  NUMERIC(12,0) NOT NULL DEFAULT 0,
  payment_status      payment_status_v2 NOT NULL DEFAULT 'unpaid',
  starts_at           TIMESTAMPTZ,
  closed_at           TIMESTAMPTZ,
  notes               TEXT,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deal_line_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id             UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  sku                 TEXT,
  category            catalog_category_v2 NOT NULL,
  product_name        TEXT NOT NULL,
  quantity            INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price          NUMERIC(12,0) NOT NULL DEFAULT 0,
  amount              NUMERIC(12,0) NOT NULL DEFAULT 0,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Quote Documents ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS quote_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id             UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  quote_number        TEXT NOT NULL UNIQUE,
  current_version_id  UUID,
  status              quote_document_status_v2 NOT NULL DEFAULT 'draft',
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quote_document_versions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_document_id   UUID NOT NULL REFERENCES quote_documents(id) ON DELETE CASCADE,
  version_number      INTEGER NOT NULL,
  title               TEXT NOT NULL,
  content_html        TEXT,
  structured_json     JSONB,
  subtotal            NUMERIC(12,0) NOT NULL DEFAULT 0,
  discount_amount     NUMERIC(12,0) NOT NULL DEFAULT 0,
  tax_amount          NUMERIC(12,0) NOT NULL DEFAULT 0,
  total_amount        NUMERIC(12,0) NOT NULL DEFAULT 0,
  valid_until         DATE,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quote_document_id, version_number)
);

CREATE TABLE IF NOT EXISTS quote_document_shares (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_document_version_id  UUID NOT NULL REFERENCES quote_document_versions(id) ON DELETE CASCADE,
  token                      TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  access_mode                share_access_mode_v2 NOT NULL DEFAULT 'view',
  expires_at                 TIMESTAMPTZ,
  created_by                 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE quote_documents
  DROP CONSTRAINT IF EXISTS quote_documents_current_version_id_fkey;

ALTER TABLE quote_documents
  ADD CONSTRAINT quote_documents_current_version_id_fkey
  FOREIGN KEY (current_version_id) REFERENCES quote_document_versions(id) ON DELETE SET NULL;

-- ─── Contract Documents ──────────────────────────────────

CREATE TABLE IF NOT EXISTS contract_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id             UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  contract_number     TEXT NOT NULL UNIQUE,
  current_version_id  UUID,
  status              contract_document_status_v2 NOT NULL DEFAULT 'draft',
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contract_document_versions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_document_id  UUID NOT NULL REFERENCES contract_documents(id) ON DELETE CASCADE,
  version_number        INTEGER NOT NULL,
  title                 TEXT NOT NULL,
  content_html          TEXT,
  structured_json       JSONB,
  total_amount          NUMERIC(12,0) NOT NULL DEFAULT 0,
  valid_from            DATE,
  valid_until           DATE,
  sign_status           TEXT NOT NULL DEFAULT 'draft' CHECK (sign_status IN ('draft', 'shared', 'partner_signed', 'admin_signed', 'completed', 'cancelled')),
  partner_signed_at     TIMESTAMPTZ,
  partner_signature_url TEXT,
  admin_signed_at       TIMESTAMPTZ,
  admin_signature_url   TEXT,
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contract_document_id, version_number)
);

CREATE TABLE IF NOT EXISTS contract_document_shares (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_document_version_id  UUID NOT NULL REFERENCES contract_document_versions(id) ON DELETE CASCADE,
  token                         TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  access_mode                   share_access_mode_v2 NOT NULL DEFAULT 'sign',
  expires_at                    TIMESTAMPTZ,
  created_by                    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE contract_documents
  DROP CONSTRAINT IF EXISTS contract_documents_current_version_id_fkey;

ALTER TABLE contract_documents
  ADD CONSTRAINT contract_documents_current_version_id_fkey
  FOREIGN KEY (current_version_id) REFERENCES contract_document_versions(id) ON DELETE SET NULL;

-- ─── Installations / Calendar ────────────────────────────

CREATE TABLE IF NOT EXISTS installation_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_account_id  UUID NOT NULL REFERENCES partner_accounts(id) ON DELETE CASCADE,
  customer_id         UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  deal_id             UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  scheduled_start_at  TIMESTAMPTZ NOT NULL,
  scheduled_end_at    TIMESTAMPTZ NOT NULL,
  timezone            TEXT NOT NULL DEFAULT 'Asia/Seoul',
  location            TEXT,
  assigned_team       TEXT,
  status              installation_status_v2 NOT NULL DEFAULT 'planned',
  created_by_role     created_by_role_v2 NOT NULL DEFAULT 'admin',
  notes               TEXT,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (scheduled_end_at >= scheduled_start_at)
);

CREATE TABLE IF NOT EXISTS payments_v2 (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_account_id  UUID NOT NULL REFERENCES partner_accounts(id) ON DELETE CASCADE,
  customer_id         UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  deal_id             UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  amount              NUMERIC(12,0) NOT NULL CHECK (amount >= 0),
  paid_at             TIMESTAMPTZ NOT NULL,
  payment_method      payment_method NOT NULL DEFAULT 'bank_transfer',
  memo                TEXT,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS receipts_v2 (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_account_id  UUID NOT NULL REFERENCES partner_accounts(id) ON DELETE CASCADE,
  customer_id         UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  deal_id             UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  payment_id          UUID REFERENCES payments_v2(id) ON DELETE SET NULL,
  receipt_number      TEXT NOT NULL UNIQUE,
  total_amount        NUMERIC(12,0) NOT NULL DEFAULT 0,
  pdf_url             TEXT,
  notes               TEXT,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_account_id  UUID NOT NULL REFERENCES partner_accounts(id) ON DELETE CASCADE,
  customer_id         UUID REFERENCES customers(id) ON DELETE CASCADE,
  deal_id             UUID REFERENCES deals(id) ON DELETE CASCADE,
  actor_user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role          TEXT NOT NULL,
  action_type         TEXT NOT NULL,
  target_type         TEXT NOT NULL,
  target_id           UUID,
  summary             TEXT NOT NULL,
  before_json         JSONB,
  after_json          JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_account_id  UUID NOT NULL REFERENCES partner_accounts(id) ON DELETE CASCADE,
  customer_id         UUID REFERENCES customers(id) ON DELETE CASCADE,
  deal_id             UUID REFERENCES deals(id) ON DELETE CASCADE,
  source_type         calendar_source_type_v2 NOT NULL,
  source_id           UUID,
  starts_at           TIMESTAMPTZ NOT NULL,
  ends_at             TIMESTAMPTZ NOT NULL,
  timezone            TEXT NOT NULL DEFAULT 'Asia/Seoul',
  title               TEXT NOT NULL,
  description         TEXT,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'completed')),
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at >= starts_at)
);

-- ─── Summary / History Views ─────────────────────────────

CREATE OR REPLACE VIEW customer_deal_summary AS
SELECT
  c.id AS customer_id,
  c.partner_account_id,
  c.name AS customer_name,
  count(d.id) AS total_deals,
  count(*) FILTER (WHERE d.status = 'active') AS active_deals,
  count(*) FILTER (WHERE d.current_stage = 'installation') AS installation_deals,
  count(*) FILTER (WHERE d.payment_status <> 'paid') AS unpaid_deals,
  coalesce(sum(d.contracted_amount), 0) AS contracted_amount,
  coalesce(sum(d.installed_amount), 0) AS installed_amount,
  coalesce(sum(d.paid_amount), 0) AS paid_amount,
  coalesce(sum(d.outstanding_amount), 0) AS outstanding_amount,
  max(d.updated_at) AS last_deal_updated_at
FROM customers c
LEFT JOIN deals d ON d.customer_id = c.id
GROUP BY c.id, c.partner_account_id, c.name;

CREATE OR REPLACE VIEW customer_deal_history AS
SELECT
  c.id AS customer_id,
  c.name AS customer_name,
  d.id AS deal_id,
  d.deal_code,
  d.title AS deal_title,
  d.current_stage,
  d.status AS deal_status,
  d.expected_amount,
  d.contracted_amount,
  d.installed_amount,
  d.paid_amount,
  d.outstanding_amount,
  d.payment_status,
  d.created_at AS deal_created_at,
  d.updated_at AS deal_updated_at,
  (
    SELECT max(al.created_at)
    FROM activity_logs al
    WHERE al.deal_id = d.id
  ) AS last_activity_at,
  (
    SELECT min(ie.scheduled_start_at)
    FROM installation_events ie
    WHERE ie.deal_id = d.id
      AND ie.status IN ('planned', 'confirmed', 'in_progress')
  ) AS next_installation_at,
  (
    SELECT max(p.paid_at)
    FROM payments_v2 p
    WHERE p.deal_id = d.id
  ) AS last_paid_at
FROM customers c
JOIN deals d ON d.customer_id = c.id;

-- ─── Triggers ────────────────────────────────────────────

CREATE TRIGGER partner_accounts_updated_at
  BEFORE UPDATE ON partner_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER partner_account_users_updated_at
  BEFORE UPDATE ON partner_account_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER product_catalog_items_updated_at
  BEFORE UPDATE ON product_catalog_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER deal_line_items_updated_at
  BEFORE UPDATE ON deal_line_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER quote_documents_updated_at
  BEFORE UPDATE ON quote_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER contract_documents_updated_at
  BEFORE UPDATE ON contract_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER installation_events_updated_at
  BEFORE UPDATE ON installation_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER payments_v2_updated_at
  BEFORE UPDATE ON payments_v2
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER receipts_v2_updated_at
  BEFORE UPDATE ON receipts_v2
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Indexes ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_partner_account_users_account_id ON partner_account_users(partner_account_id);
CREATE INDEX IF NOT EXISTS idx_partner_account_users_user_id ON partner_account_users(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_partner_account_id ON customers(partner_account_id);
CREATE INDEX IF NOT EXISTS idx_product_catalog_items_category ON product_catalog_items(category);
CREATE INDEX IF NOT EXISTS idx_deals_partner_account_id ON deals(partner_account_id);
CREATE INDEX IF NOT EXISTS idx_deals_customer_id ON deals(customer_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(current_stage);
CREATE INDEX IF NOT EXISTS idx_deals_payment_status ON deals(payment_status);
CREATE INDEX IF NOT EXISTS idx_deal_line_items_deal_id ON deal_line_items(deal_id);
CREATE INDEX IF NOT EXISTS idx_quote_documents_deal_id ON quote_documents(deal_id);
CREATE INDEX IF NOT EXISTS idx_quote_document_versions_document_id ON quote_document_versions(quote_document_id);
CREATE INDEX IF NOT EXISTS idx_quote_document_shares_version_id ON quote_document_shares(quote_document_version_id);
CREATE INDEX IF NOT EXISTS idx_contract_documents_deal_id ON contract_documents(deal_id);
CREATE INDEX IF NOT EXISTS idx_contract_document_versions_document_id ON contract_document_versions(contract_document_id);
CREATE INDEX IF NOT EXISTS idx_contract_document_shares_version_id ON contract_document_shares(contract_document_version_id);
CREATE INDEX IF NOT EXISTS idx_installation_events_deal_id ON installation_events(deal_id);
CREATE INDEX IF NOT EXISTS idx_installation_events_customer_id ON installation_events(customer_id);
CREATE INDEX IF NOT EXISTS idx_installation_events_window ON installation_events(scheduled_start_at, scheduled_end_at);
CREATE INDEX IF NOT EXISTS idx_payments_v2_deal_id ON payments_v2(deal_id);
CREATE INDEX IF NOT EXISTS idx_receipts_v2_deal_id ON receipts_v2(deal_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_customer_id ON activity_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_deal_id ON activity_logs(deal_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_deal_id ON calendar_events(deal_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_window ON calendar_events(starts_at, ends_at);

-- ─── RLS ─────────────────────────────────────────────────

ALTER TABLE partner_accounts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_account_users  ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_catalog_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_line_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_documents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_document_shares  ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_documents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_document_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE installation_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments_v2            ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts_v2            ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partner_accounts_select_own_v2"
  ON partner_accounts FOR SELECT
  USING (
    id IN (
      SELECT partner_account_id
      FROM partner_account_users
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );

CREATE POLICY "partner_account_users_select_self_v2"
  ON partner_account_users FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "customers_select_own_account_v2"
  ON customers FOR SELECT
  USING (
    partner_account_id IN (
      SELECT partner_account_id
      FROM partner_account_users
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );

CREATE POLICY "product_catalog_items_select_all_v2"
  ON product_catalog_items FOR SELECT
  USING (true);

CREATE POLICY "deals_select_own_account_v2"
  ON deals FOR SELECT
  USING (
    partner_account_id IN (
      SELECT partner_account_id
      FROM partner_account_users
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );

CREATE POLICY "deal_line_items_select_via_deal_v2"
  ON deal_line_items FOR SELECT
  USING (
    deal_id IN (
      SELECT id FROM deals
      WHERE partner_account_id IN (
        SELECT partner_account_id
        FROM partner_account_users
        WHERE user_id = auth.uid()
          AND status = 'active'
      )
    )
  );

CREATE POLICY "quote_documents_select_via_deal_v2"
  ON quote_documents FOR SELECT
  USING (
    deal_id IN (
      SELECT id FROM deals
      WHERE partner_account_id IN (
        SELECT partner_account_id
        FROM partner_account_users
        WHERE user_id = auth.uid()
          AND status = 'active'
      )
    )
  );

CREATE POLICY "quote_document_versions_select_via_document_v2"
  ON quote_document_versions FOR SELECT
  USING (
    quote_document_id IN (
      SELECT qd.id
      FROM quote_documents qd
      JOIN deals d ON d.id = qd.deal_id
      WHERE d.partner_account_id IN (
        SELECT partner_account_id
        FROM partner_account_users
        WHERE user_id = auth.uid()
          AND status = 'active'
      )
    )
  );

CREATE POLICY "contract_documents_select_via_deal_v2"
  ON contract_documents FOR SELECT
  USING (
    deal_id IN (
      SELECT id FROM deals
      WHERE partner_account_id IN (
        SELECT partner_account_id
        FROM partner_account_users
        WHERE user_id = auth.uid()
          AND status = 'active'
      )
    )
  );

CREATE POLICY "contract_document_versions_select_via_document_v2"
  ON contract_document_versions FOR SELECT
  USING (
    contract_document_id IN (
      SELECT cd.id
      FROM contract_documents cd
      JOIN deals d ON d.id = cd.deal_id
      WHERE d.partner_account_id IN (
        SELECT partner_account_id
        FROM partner_account_users
        WHERE user_id = auth.uid()
          AND status = 'active'
      )
    )
  );

CREATE POLICY "installation_events_select_own_account_v2"
  ON installation_events FOR SELECT
  USING (
    partner_account_id IN (
      SELECT partner_account_id
      FROM partner_account_users
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );

CREATE POLICY "payments_v2_select_own_account_v2"
  ON payments_v2 FOR SELECT
  USING (
    partner_account_id IN (
      SELECT partner_account_id
      FROM partner_account_users
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );

CREATE POLICY "receipts_v2_select_own_account_v2"
  ON receipts_v2 FOR SELECT
  USING (
    partner_account_id IN (
      SELECT partner_account_id
      FROM partner_account_users
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );

CREATE POLICY "activity_logs_select_own_account_v2"
  ON activity_logs FOR SELECT
  USING (
    partner_account_id IN (
      SELECT partner_account_id
      FROM partner_account_users
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );

CREATE POLICY "calendar_events_select_own_account_v2"
  ON calendar_events FOR SELECT
  USING (
    partner_account_id IN (
      SELECT partner_account_id
      FROM partner_account_users
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );

-- 공유 링크는 token 기반 service_role route에서 처리한다.
