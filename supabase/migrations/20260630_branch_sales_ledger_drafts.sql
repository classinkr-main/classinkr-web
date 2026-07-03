-- Persistent review queue for Korea branch sales ledger input/edit drafts.
-- This lets the admin ledger UI own sheet-like entry review before a future
-- apply step mutates the revenue source of truth.

CREATE TABLE IF NOT EXISTS public.branch_sales_ledger_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL
    CHECK (kind IN ('new-row', 'edit-row')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'checked', 'applied', 'cancelled')),
  source_deal_id TEXT,
  source_sheet_row INTEGER,
  source_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  customer_name TEXT NOT NULL,
  manager TEXT,
  team TEXT,
  ledger_month TEXT NOT NULL
    CHECK (ledger_month ~ '^[0-9]{4}-[0-9]{2}$'),
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CNY',
  note TEXT,
  created_by TEXT,
  updated_by TEXT,
  checked_by TEXT,
  checked_at TIMESTAMPTZ,
  applied_by TEXT,
  applied_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS branch_sales_ledger_drafts_status_updated_idx
  ON public.branch_sales_ledger_drafts (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS branch_sales_ledger_drafts_month_team_manager_idx
  ON public.branch_sales_ledger_drafts (ledger_month, team, manager);

CREATE INDEX IF NOT EXISTS branch_sales_ledger_drafts_source_deal_idx
  ON public.branch_sales_ledger_drafts (source_deal_id)
  WHERE source_deal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS branch_sales_ledger_drafts_source_sheet_row_idx
  ON public.branch_sales_ledger_drafts (source_sheet_row)
  WHERE source_sheet_row IS NOT NULL;

CREATE INDEX IF NOT EXISTS branch_sales_ledger_drafts_search_idx
  ON public.branch_sales_ledger_drafts
  USING GIN (
    to_tsvector(
      'simple',
      coalesce(customer_name, '') || ' ' ||
      coalesce(manager, '') || ' ' ||
      coalesce(team, '') || ' ' ||
      coalesce(note, '')
    )
  );

DROP TRIGGER IF EXISTS branch_sales_ledger_drafts_updated_at ON public.branch_sales_ledger_drafts;
CREATE TRIGGER branch_sales_ledger_drafts_updated_at
  BEFORE UPDATE ON public.branch_sales_ledger_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.branch_sales_ledger_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage branch sales ledger drafts" ON public.branch_sales_ledger_drafts;
CREATE POLICY "Admins manage branch sales ledger drafts"
  ON public.branch_sales_ledger_drafts
  FOR ALL
  USING (is_active_admin())
  WITH CHECK (is_active_admin());

COMMENT ON TABLE public.branch_sales_ledger_drafts IS
  'Admin review queue for Korea branch sales ledger new/edit drafts.';

CREATE TABLE IF NOT EXISTS public.branch_sales_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID UNIQUE
    REFERENCES public.branch_sales_ledger_drafts(id)
    ON DELETE RESTRICT,
  entry_type TEXT NOT NULL
    CHECK (entry_type IN ('manual-new', 'manual-edit')),
  entry_status TEXT NOT NULL DEFAULT 'active'
    CHECK (entry_status IN ('active', 'reversed')),
  source_deal_id TEXT,
  source_sheet_row INTEGER,
  source_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  customer_name TEXT NOT NULL,
  manager TEXT,
  team TEXT,
  ledger_month TEXT NOT NULL
    CHECK (ledger_month ~ '^[0-9]{4}-[0-9]{2}$'),
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CNY',
  note TEXT,
  applied_by TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS branch_sales_ledger_entries_status_month_idx
  ON public.branch_sales_ledger_entries (entry_status, ledger_month);

CREATE INDEX IF NOT EXISTS branch_sales_ledger_entries_month_team_manager_idx
  ON public.branch_sales_ledger_entries (ledger_month, team, manager);

CREATE INDEX IF NOT EXISTS branch_sales_ledger_entries_source_deal_idx
  ON public.branch_sales_ledger_entries (source_deal_id)
  WHERE source_deal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS branch_sales_ledger_entries_draft_idx
  ON public.branch_sales_ledger_entries (draft_id)
  WHERE draft_id IS NOT NULL;

DROP TRIGGER IF EXISTS branch_sales_ledger_entries_updated_at ON public.branch_sales_ledger_entries;
CREATE TRIGGER branch_sales_ledger_entries_updated_at
  BEFORE UPDATE ON public.branch_sales_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.branch_sales_ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage branch sales ledger entries" ON public.branch_sales_ledger_entries;
CREATE POLICY "Admins manage branch sales ledger entries"
  ON public.branch_sales_ledger_entries
  FOR ALL
  USING (is_active_admin())
  WITH CHECK (is_active_admin());

COMMENT ON TABLE public.branch_sales_ledger_entries IS
  'Internal applied-entry ledger for Korea branch sales workbench drafts.';

CREATE OR REPLACE FUNCTION public.prevent_branch_sales_ledger_applied_draft_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'applied' THEN
      RAISE EXCEPTION 'Applied sales ledger drafts are immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'applied' THEN
    RAISE EXCEPTION 'Applied sales ledger drafts are immutable';
  END IF;

  IF OLD.status = 'checked' AND (
    NEW.kind IS DISTINCT FROM OLD.kind OR
    NEW.source_deal_id IS DISTINCT FROM OLD.source_deal_id OR
    NEW.source_sheet_row IS DISTINCT FROM OLD.source_sheet_row OR
    NEW.source_snapshot IS DISTINCT FROM OLD.source_snapshot OR
    NEW.customer_name IS DISTINCT FROM OLD.customer_name OR
    NEW.manager IS DISTINCT FROM OLD.manager OR
    NEW.team IS DISTINCT FROM OLD.team OR
    NEW.ledger_month IS DISTINCT FROM OLD.ledger_month OR
    NEW.amount IS DISTINCT FROM OLD.amount OR
    NEW.currency IS DISTINCT FROM OLD.currency OR
    NEW.note IS DISTINCT FROM OLD.note OR
    NEW.metadata IS DISTINCT FROM OLD.metadata
  ) THEN
    RAISE EXCEPTION 'Checked sales ledger drafts must be returned to draft before editing';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS branch_sales_ledger_drafts_immutable_applied
  ON public.branch_sales_ledger_drafts;
CREATE TRIGGER branch_sales_ledger_drafts_immutable_applied
  BEFORE UPDATE OR DELETE ON public.branch_sales_ledger_drafts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_branch_sales_ledger_applied_draft_mutation();

CREATE OR REPLACE FUNCTION public.prevent_branch_sales_ledger_entry_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Applied sales ledger entries cannot be deleted; reverse them instead';
END;
$$;

DROP TRIGGER IF EXISTS branch_sales_ledger_entries_no_delete
  ON public.branch_sales_ledger_entries;
CREATE TRIGGER branch_sales_ledger_entries_no_delete
  BEFORE DELETE ON public.branch_sales_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.prevent_branch_sales_ledger_entry_delete();

CREATE OR REPLACE FUNCTION public.prevent_branch_sales_ledger_entry_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Applied sales ledger entries are append-only; reverse them instead';
END;
$$;

DROP TRIGGER IF EXISTS branch_sales_ledger_entries_no_update
  ON public.branch_sales_ledger_entries;
CREATE TRIGGER branch_sales_ledger_entries_no_update
  BEFORE UPDATE ON public.branch_sales_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.prevent_branch_sales_ledger_entry_update();

CREATE OR REPLACE FUNCTION public.apply_branch_sales_ledger_draft(
  p_draft_id UUID,
  p_actor TEXT
)
RETURNS public.branch_sales_ledger_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draft public.branch_sales_ledger_drafts%ROWTYPE;
  v_applied_at TIMESTAMPTZ := now();
BEGIN
  SELECT *
    INTO v_draft
    FROM public.branch_sales_ledger_drafts
   WHERE id = p_draft_id
     AND status = 'checked'
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.branch_sales_ledger_drafts
     SET status = 'applied',
         applied_by = p_actor,
         applied_at = v_applied_at,
         updated_by = p_actor,
         updated_at = v_applied_at
   WHERE id = p_draft_id
   RETURNING *
    INTO v_draft;

  INSERT INTO public.branch_sales_ledger_entries (
    draft_id,
    entry_type,
    entry_status,
    source_deal_id,
    source_sheet_row,
    source_snapshot,
    customer_name,
    manager,
    team,
    ledger_month,
    amount,
    currency,
    note,
    applied_by,
    applied_at,
    metadata
  )
  VALUES (
    v_draft.id,
    CASE v_draft.kind
      WHEN 'edit-row' THEN 'manual-edit'
      ELSE 'manual-new'
    END,
    'active',
    v_draft.source_deal_id,
    v_draft.source_sheet_row,
    coalesce(v_draft.source_snapshot, '{}'::jsonb),
    v_draft.customer_name,
    v_draft.manager,
    v_draft.team,
    v_draft.ledger_month,
    v_draft.amount,
    v_draft.currency,
    v_draft.note,
    p_actor,
    v_applied_at,
    coalesce(v_draft.metadata, '{}'::jsonb) ||
      jsonb_build_object(
        'source', 'sales-ledger-workbench',
        'appliedFromDraftId', v_draft.id
      )
  )
  ON CONFLICT (draft_id) DO NOTHING;

  RETURN v_draft;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_branch_sales_ledger_applied_draft_mutation()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_branch_sales_ledger_entry_delete()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_branch_sales_ledger_entry_update()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_branch_sales_ledger_draft(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_branch_sales_ledger_draft(UUID, TEXT)
  TO service_role;
