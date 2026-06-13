-- Partner workspace columns the app reads (lib/partners-data.ts) but no prior
-- migration ever created — environments that worked had these added manually
-- in the SQL Editor, so fresh DBs fail with
-- "column partners.channel does not exist" and fall back to local JSON.
-- Idempotent: safe to run on databases that already have the columns.

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'direct'
    CHECK (channel IN ('reseller', 'referral', 'branch', 'direct'));

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS region TEXT;

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS owner_name TEXT;

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS owner_email TEXT;

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS account_manager_name TEXT;

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
