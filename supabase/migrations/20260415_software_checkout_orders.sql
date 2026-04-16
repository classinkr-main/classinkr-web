CREATE TABLE IF NOT EXISTS software_checkout_orders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           TEXT NOT NULL UNIQUE,
  plan_id            TEXT NOT NULL CHECK (plan_id IN ('standard', 'plus')),
  billing_cycle      TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  order_name         TEXT NOT NULL,
  organization_name  TEXT NOT NULL,
  buyer_name         TEXT NOT NULL,
  buyer_email        TEXT NOT NULL,
  buyer_phone        TEXT,
  amount             INT NOT NULL CHECK (amount > 0),
  currency           TEXT NOT NULL DEFAULT 'KRW',
  provider           TEXT NOT NULL DEFAULT 'toss_payments',
  status             TEXT NOT NULL DEFAULT 'pending',
  payment_key        TEXT UNIQUE,
  payment_method     TEXT,
  easy_pay_provider  TEXT,
  failure_code       TEXT,
  failure_message    TEXT,
  approved_at        TIMESTAMPTZ,
  receipt_url        TEXT,
  raw_prepare        JSONB,
  raw_confirm        JSONB,
  raw_fail           JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_software_checkout_orders_status
  ON software_checkout_orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_software_checkout_orders_email
  ON software_checkout_orders (buyer_email, created_at DESC);

DROP TRIGGER IF EXISTS software_checkout_orders_updated_at ON software_checkout_orders;
CREATE TRIGGER software_checkout_orders_updated_at
  BEFORE UPDATE ON software_checkout_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE software_checkout_orders ENABLE ROW LEVEL SECURITY;
