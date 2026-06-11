-- Auto-confirm policy for CRM source-link candidates.
-- High-confidence, unambiguous name matches can be confirmed automatically.
-- Policy values stay in SQL so operations can tune them without a deploy.
-- Auto-confirmed rows keep confirmed_by NULL and set metadata.auto_confirmed = true,
-- so they remain distinguishable and reversible from the matching inbox.

ALTER TABLE public.crm_source_priorities
  ADD COLUMN IF NOT EXISTS auto_confirm_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.crm_source_priorities
  ADD COLUMN IF NOT EXISTS auto_confirm_min_confidence NUMERIC(5,4) NOT NULL DEFAULT 0.9200
    CHECK (auto_confirm_min_confidence >= 0.5 AND auto_confirm_min_confidence <= 1);

ALTER TABLE public.crm_source_priorities
  ADD COLUMN IF NOT EXISTS auto_confirm_min_gap NUMERIC(5,4) NOT NULL DEFAULT 0.1500
    CHECK (auto_confirm_min_gap >= 0 AND auto_confirm_min_gap <= 0.5);

-- Neo CRM (Xiaoshouyi) snapshots and REV sheet rows are the manual-linking pain
-- points; enable auto-confirm there. Lead links stay manual because lead
-- conversion already creates confirmed links explicitly.
UPDATE public.crm_source_priorities
SET auto_confirm_enabled = true
WHERE source_system IN ('xiaoshouyi', 'branch_rev_sheet');
