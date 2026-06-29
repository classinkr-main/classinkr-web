-- Hardware movements: sheet costing fields — Step 2
--
-- Adds the remaining sheet 입고(inbound) ledger columns so the hardware admin can
-- capture a full inbound row manually (단가·금액 USD/CNY·보관장소·수입자). Sheet-imported
-- rows keep these in branch_hw_inbound / raw, so the import/restore RPCs are unchanged;
-- these columns are populated by manual admin entry.

alter table public.hardware_movements
  add column if not exists unit_price numeric,
  add column if not exists amount_usd numeric,
  add column if not exists amount_cny numeric,
  add column if not exists storage_location text,
  add column if not exists importer text;
