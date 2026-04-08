-- ============================================================
-- Partner Portal Migration
-- Phase 1: Partners, Quotes, Contracts, Receipts
-- ============================================================

-- ─── ENUM Types ───────────────────────────────────────────

CREATE TYPE partner_status AS ENUM ('active', 'inactive', 'pending');
CREATE TYPE pipeline_stage AS ENUM ('prospect', 'quoting', 'contracted', 'installing', 'completed', 'cancelled');

-- admin_role에 PARTNER 추가 (기존 테이블이 있을 경우)
-- ALTER TYPE admin_role ADD VALUE IF NOT EXISTS 'PARTNER';
CREATE TYPE quote_status AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted');
CREATE TYPE contract_status AS ENUM ('draft', 'sent', 'partner_signed', 'admin_signed', 'completed', 'cancelled');
CREATE TYPE payment_method AS ENUM ('bank_transfer', 'card', 'cash');
CREATE TYPE cash_receipt_type AS ENUM ('personal', 'business');

-- ─── partners ─────────────────────────────────────────────

CREATE TABLE partners (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  contact_name         TEXT,
  email                TEXT,
  phone                TEXT,
  address              TEXT,
  business_number      TEXT,
  status               partner_status NOT NULL DEFAULT 'active',
  pipeline_stage       pipeline_stage NOT NULL DEFAULT 'prospect',
  deal_amount          NUMERIC,
  installation_date    DATE,
  installation_address TEXT,
  installer_name       TEXT,
  notes                TEXT,
  created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── quotes ───────────────────────────────────────────────

CREATE TABLE quotes (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number                TEXT NOT NULL UNIQUE,
  partner_id                  UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  title                       TEXT NOT NULL,
  status                      quote_status NOT NULL DEFAULT 'draft',
  valid_until                 DATE,
  subtotal                    INTEGER NOT NULL DEFAULT 0,
  discount_amount             INTEGER NOT NULL DEFAULT 0,
  tax_amount                  INTEGER NOT NULL DEFAULT 0,
  total_amount                INTEGER NOT NULL DEFAULT 0,
  notes                       TEXT,
  created_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at                     TIMESTAMPTZ,
  accepted_at                 TIMESTAMPTZ,
  converted_to_contract_id    UUID,  -- FK added after contracts table
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── quote_items ──────────────────────────────────────────

CREATE TABLE quote_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id      UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  product_name  TEXT NOT NULL,
  description   TEXT,
  quantity      INTEGER NOT NULL DEFAULT 1,
  unit_price    INTEGER NOT NULL DEFAULT 0,
  discount_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  amount        INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

-- ─── contracts ────────────────────────────────────────────

CREATE TABLE contracts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_number         TEXT NOT NULL UNIQUE,
  quote_id                UUID REFERENCES quotes(id) ON DELETE SET NULL,
  partner_id              UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  title                   TEXT NOT NULL,
  status                  contract_status NOT NULL DEFAULT 'draft',
  total_amount            INTEGER NOT NULL DEFAULT 0,
  content_html            TEXT,
  notes                   TEXT,
  valid_from              DATE,
  valid_until             DATE,
  sign_token              TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  partner_signed_at       TIMESTAMPTZ,
  partner_signature_url   TEXT,
  partner_signed_ip       TEXT,
  admin_signed_at         TIMESTAMPTZ,
  admin_signature_url     TEXT,
  admin_signed_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- quotes.converted_to_contract_id FK (delayed because contracts didn't exist yet)
ALTER TABLE quotes
  ADD CONSTRAINT quotes_converted_to_contract_id_fkey
  FOREIGN KEY (converted_to_contract_id) REFERENCES contracts(id) ON DELETE SET NULL;

-- ─── contract_versions ────────────────────────────────────

CREATE TABLE contract_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id     UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  version_number  INTEGER NOT NULL,
  content_html    TEXT NOT NULL,
  changed_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  change_reason   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── receipts ─────────────────────────────────────────────

CREATE TABLE receipts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number          TEXT NOT NULL UNIQUE,
  contract_id             UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  partner_id              UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  amount                  INTEGER NOT NULL DEFAULT 0,
  tax_amount              INTEGER NOT NULL DEFAULT 0,
  total_amount            INTEGER NOT NULL DEFAULT 0,
  payment_method          payment_method NOT NULL DEFAULT 'bank_transfer',
  cash_receipt_requested  BOOLEAN NOT NULL DEFAULT false,
  cash_receipt_type       cash_receipt_type,
  cash_receipt_number     TEXT,
  pdf_url                 TEXT,
  emailed_at              TIMESTAMPTZ,
  paid_at                 TIMESTAMPTZ,
  notes                   TEXT,
  created_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Triggers: updated_at 자동 갱신 ──────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER partners_updated_at   BEFORE UPDATE ON partners   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER quotes_updated_at     BEFORE UPDATE ON quotes     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER contracts_updated_at  BEFORE UPDATE ON contracts  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER receipts_updated_at   BEFORE UPDATE ON receipts   FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Indexes ──────────────────────────────────────────────

CREATE INDEX idx_quotes_partner_id     ON quotes(partner_id);
CREATE INDEX idx_quotes_status         ON quotes(status);
CREATE INDEX idx_contracts_partner_id  ON contracts(partner_id);
CREATE INDEX idx_contracts_quote_id    ON contracts(quote_id);
CREATE INDEX idx_contracts_status      ON contracts(status);
CREATE INDEX idx_contracts_sign_token  ON contracts(sign_token);
CREATE INDEX idx_receipts_contract_id  ON receipts(contract_id);
CREATE INDEX idx_receipts_partner_id   ON receipts(partner_id);
CREATE INDEX idx_contract_versions_contract_id ON contract_versions(contract_id);

-- ─── partner_users ────────────────────────────────────────

CREATE TABLE partner_users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id      UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  display_name    TEXT,
  role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  status          TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'suspended')),
  invited_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, partner_id)
);

CREATE TRIGGER partner_users_updated_at BEFORE UPDATE ON partner_users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX idx_partner_users_user_id    ON partner_users(user_id);
CREATE INDEX idx_partner_users_partner_id ON partner_users(partner_id);

-- ─── Row Level Security ───────────────────────────────────

ALTER TABLE partners          ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_users     ENABLE ROW LEVEL SECURITY;

-- 어드민: service_role은 RLS 우회 (모든 CRUD 허용)

-- 파트너 유저: 자신이 속한 partner_id 데이터만 조회
CREATE POLICY "partners_select_own"
  ON partners FOR SELECT
  USING (
    id IN (
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "quotes_select_own_partner"
  ON quotes FOR SELECT
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "quote_items_select_via_quote"
  ON quote_items FOR SELECT
  USING (
    quote_id IN (
      SELECT id FROM quotes WHERE partner_id IN (
        SELECT partner_id FROM partner_users WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

CREATE POLICY "contracts_select_own_partner"
  ON contracts FOR SELECT
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "receipts_select_own_partner"
  ON receipts FOR SELECT
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "partner_users_select_self"
  ON partner_users FOR SELECT
  USING (user_id = auth.uid());

-- 파트너 서명: sign_token URL로 접근하는 경우는 service_role API로만 처리 (RLS 우회)
