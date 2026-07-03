-- DB-native import backbone for FY Korea Sales Ledger.
-- Sheets/files are import sources only; successful import runs become the
-- authoritative operating record read by admin branch ledger surfaces.

CREATE TABLE IF NOT EXISTS public.sales_ledger_import_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year INTEGER NOT NULL CHECK (fiscal_year BETWEEN 2020 AND 2100),
  source_kind TEXT NOT NULL
    CHECK (source_kind IN ('xlsx', 'csv', 'google-sheet', 'manual')),
  source_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
  parser_version TEXT NOT NULL DEFAULT 'sales-ledger-import-v1',
  source_checksum TEXT,
  row_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_by TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_ledger_import_runs_recent_idx
  ON public.sales_ledger_import_runs (fiscal_year, status, started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS sales_ledger_import_runs_checksum_idx
  ON public.sales_ledger_import_runs (fiscal_year, source_kind, source_checksum)
  WHERE source_checksum IS NOT NULL AND status = 'succeeded';

DROP TRIGGER IF EXISTS sales_ledger_import_runs_updated_at
  ON public.sales_ledger_import_runs;
CREATE TRIGGER sales_ledger_import_runs_updated_at
  BEFORE UPDATE ON public.sales_ledger_import_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.sales_ledger_import_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage sales ledger import runs"
  ON public.sales_ledger_import_runs;
CREATE POLICY "Admins manage sales ledger import runs"
  ON public.sales_ledger_import_runs
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

COMMENT ON TABLE public.sales_ledger_import_runs IS
  'One import attempt for the Korea sales ledger. Latest succeeded run is the DB-native source of truth.';

CREATE TABLE IF NOT EXISTS public.sales_ledger_source_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_run_id UUID NOT NULL
    REFERENCES public.sales_ledger_import_runs(id)
    ON DELETE CASCADE,
  tab_key TEXT NOT NULL CHECK (tab_key IN ('dsh', 'rev', 'kpi')),
  file_name TEXT NOT NULL,
  file_sha256 TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  header_hash TEXT,
  raw_sample JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (import_run_id, tab_key),
  UNIQUE (import_run_id, file_sha256)
);

CREATE INDEX IF NOT EXISTS sales_ledger_source_files_tab_idx
  ON public.sales_ledger_source_files (tab_key, created_at DESC);

ALTER TABLE public.sales_ledger_source_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage sales ledger source files"
  ON public.sales_ledger_source_files;
CREATE POLICY "Admins manage sales ledger source files"
  ON public.sales_ledger_source_files
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

COMMENT ON TABLE public.sales_ledger_source_files IS
  'Per-tab source file fingerprints used to prove which DSH/REV/KPI inputs populated a DB import.';

CREATE TABLE IF NOT EXISTS public.sales_ledger_import_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_run_id UUID NOT NULL
    REFERENCES public.sales_ledger_import_runs(id)
    ON DELETE CASCADE,
  tab_key TEXT NOT NULL CHECK (tab_key IN ('dsh', 'rev', 'kpi')),
  payload_checksum TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (import_run_id, tab_key)
);

ALTER TABLE public.sales_ledger_import_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read sales ledger import snapshots"
  ON public.sales_ledger_import_snapshots;
CREATE POLICY "Admins read sales ledger import snapshots"
  ON public.sales_ledger_import_snapshots
  FOR SELECT
  USING (public.is_active_admin());

DROP POLICY IF EXISTS "Admins insert sales ledger import snapshots"
  ON public.sales_ledger_import_snapshots;
CREATE POLICY "Admins insert sales ledger import snapshots"
  ON public.sales_ledger_import_snapshots
  FOR INSERT
  WITH CHECK (public.is_active_admin());

CREATE OR REPLACE FUNCTION public.prevent_sales_ledger_import_snapshot_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Sales ledger import snapshots are append-only';
END;
$$;

DROP TRIGGER IF EXISTS sales_ledger_import_snapshots_append_only
  ON public.sales_ledger_import_snapshots;
CREATE TRIGGER sales_ledger_import_snapshots_append_only
  BEFORE UPDATE OR DELETE ON public.sales_ledger_import_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.prevent_sales_ledger_import_snapshot_mutation();

COMMENT ON TABLE public.sales_ledger_import_snapshots IS
  'Append-only normalized source payloads for import audit, troubleshooting, and replays.';

CREATE TABLE IF NOT EXISTS public.sales_ledger_active_sources (
  tab_key TEXT NOT NULL CHECK (tab_key IN ('dsh', 'rev', 'kpi')),
  fiscal_year INTEGER NOT NULL CHECK (fiscal_year BETWEEN 2020 AND 2100),
  import_run_id UUID NOT NULL
    REFERENCES public.sales_ledger_import_runs(id)
    ON DELETE RESTRICT,
  activated_by TEXT,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tab_key, fiscal_year)
);

CREATE INDEX IF NOT EXISTS sales_ledger_active_sources_run_idx
  ON public.sales_ledger_active_sources (import_run_id);

ALTER TABLE public.sales_ledger_active_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage sales ledger active sources"
  ON public.sales_ledger_active_sources;
CREATE POLICY "Admins manage sales ledger active sources"
  ON public.sales_ledger_active_sources
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

COMMENT ON TABLE public.sales_ledger_active_sources IS
  'Active import pointer per ledger tab and fiscal year. Routes should read DB-active first, not live Sheets.';

CREATE OR REPLACE FUNCTION public.ensure_sales_ledger_active_source_succeeded()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status
    INTO v_status
    FROM public.sales_ledger_import_runs
   WHERE id = NEW.import_run_id;

  IF v_status IS DISTINCT FROM 'succeeded' THEN
    RAISE EXCEPTION 'Active sales ledger source must point to a succeeded import run';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_ledger_active_sources_succeeded_only
  ON public.sales_ledger_active_sources;
CREATE TRIGGER sales_ledger_active_sources_succeeded_only
  BEFORE INSERT OR UPDATE ON public.sales_ledger_active_sources
  FOR EACH ROW EXECUTE FUNCTION public.ensure_sales_ledger_active_source_succeeded();

CREATE TABLE IF NOT EXISTS public.branch_dsh_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_run_id UUID NOT NULL
    REFERENCES public.sales_ledger_import_runs(id)
    ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL CHECK (fiscal_year BETWEEN 2020 AND 2100),
  row_level TEXT NOT NULL
    CHECK (row_level IN ('total', 'team', 'member', 'breakdown', 'summary')),
  row_kind TEXT NOT NULL
    CHECK (row_kind IN ('goal', 'status', 'rate', 'gap')),
  team TEXT,
  member TEXT,
  category TEXT,
  status_type TEXT,
  channel TEXT,
  annual NUMERIC NOT NULL DEFAULT 0,
  q1 NUMERIC NOT NULL DEFAULT 0,
  q2 NUMERIC NOT NULL DEFAULT 0,
  q3 NUMERIC NOT NULL DEFAULT 0,
  q4 NUMERIC NOT NULL DEFAULT 0,
  months JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_row INTEGER,
  source_labels JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS branch_dsh_rows_run_kind_idx
  ON public.branch_dsh_rows (import_run_id, row_level, row_kind);

CREATE INDEX IF NOT EXISTS branch_dsh_rows_team_member_idx
  ON public.branch_dsh_rows (fiscal_year, team, member);

ALTER TABLE public.branch_dsh_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage branch dsh rows"
  ON public.branch_dsh_rows;
CREATE POLICY "Admins manage branch dsh rows"
  ON public.branch_dsh_rows
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

COMMENT ON TABLE public.branch_dsh_rows IS
  'DB-native DSH rows for goal/status/rate/gap, including team/member/breakdown rollups.';

CREATE TABLE IF NOT EXISTS public.branch_kpi_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_run_id UUID NOT NULL
    REFERENCES public.sales_ledger_import_runs(id)
    ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL CHECK (fiscal_year BETWEEN 2020 AND 2100),
  period_key TEXT NOT NULL,
  period_month TEXT CHECK (period_month IS NULL OR period_month ~ '^[0-9]{4}-[0-9]{2}$'),
  row_kind TEXT NOT NULL
    CHECK (row_kind IN ('goal', 'status', 'gap', 'achievement')),
  team TEXT,
  member TEXT NOT NULL,
  revenue_sum NUMERIC NOT NULL DEFAULT 0,
  new_revenue NUMERIC NOT NULL DEFAULT 0,
  renewal_revenue NUMERIC NOT NULL DEFAULT 0,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_row INTEGER,
  source_labels JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS branch_kpi_rows_run_period_idx
  ON public.branch_kpi_rows (import_run_id, period_key, row_kind);

CREATE INDEX IF NOT EXISTS branch_kpi_rows_member_idx
  ON public.branch_kpi_rows (fiscal_year, member, period_key);

ALTER TABLE public.branch_kpi_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage branch kpi rows"
  ON public.branch_kpi_rows;
CREATE POLICY "Admins manage branch kpi rows"
  ON public.branch_kpi_rows
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

COMMENT ON TABLE public.branch_kpi_rows IS
  'DB-native KPI rows by period/member for goal, status, gap, and achievement blocks.';

CREATE TABLE IF NOT EXISTS public.branch_rev_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_run_id UUID NOT NULL
    REFERENCES public.sales_ledger_import_runs(id)
    ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL CHECK (fiscal_year BETWEEN 2020 AND 2100),
  source_row INTEGER NOT NULL,
  source_record_key TEXT NOT NULL,
  account_name TEXT NOT NULL,
  branch_contact TEXT,
  location TEXT,
  scale TEXT,
  importance TEXT,
  team TEXT,
  manager TEXT,
  status TEXT,
  deal_type TEXT,
  product TEXT,
  first_payment DATE,
  remark TEXT,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (import_run_id, source_row),
  UNIQUE (import_run_id, source_record_key)
);

CREATE INDEX IF NOT EXISTS branch_rev_lines_run_manager_idx
  ON public.branch_rev_lines (import_run_id, team, manager);

CREATE INDEX IF NOT EXISTS branch_rev_lines_record_key_idx
  ON public.branch_rev_lines (source_record_key);

ALTER TABLE public.branch_rev_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage branch rev lines"
  ON public.branch_rev_lines;
CREATE POLICY "Admins manage branch rev lines"
  ON public.branch_rev_lines
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

COMMENT ON TABLE public.branch_rev_lines IS
  'DB-native REV account/deal lines with stable source_record_key for draft and edit linkage.';

CREATE TABLE IF NOT EXISTS public.branch_rev_period_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_run_id UUID NOT NULL
    REFERENCES public.sales_ledger_import_runs(id)
    ON DELETE CASCADE,
  rev_line_id UUID NOT NULL
    REFERENCES public.branch_rev_lines(id)
    ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL CHECK (fiscal_year BETWEEN 2020 AND 2100),
  period_month TEXT NOT NULL CHECK (period_month ~ '^[0-9]{4}-[0-9]{2}$'),
  amount NUMERIC NOT NULL DEFAULT 0,
  confidence TEXT NOT NULL DEFAULT 'expected'
    CHECK (confidence IN ('confirmed', 'high_confidence', 'expected', 'format_unavailable')),
  source_week TEXT,
  source_col TEXT,
  source_row INTEGER,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS branch_rev_period_entries_run_month_idx
  ON public.branch_rev_period_entries (import_run_id, period_month, confidence);

CREATE INDEX IF NOT EXISTS branch_rev_period_entries_line_month_idx
  ON public.branch_rev_period_entries (rev_line_id, period_month);

ALTER TABLE public.branch_rev_period_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage branch rev period entries"
  ON public.branch_rev_period_entries;
CREATE POLICY "Admins manage branch rev period entries"
  ON public.branch_rev_period_entries
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

COMMENT ON TABLE public.branch_rev_period_entries IS
  'Normalized monthly/weekly REV amounts. CSV imports mark color-derived certainty as format_unavailable.';

CREATE TABLE IF NOT EXISTS public.sales_ledger_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_run_id UUID NOT NULL
    REFERENCES public.sales_ledger_import_runs(id)
    ON DELETE CASCADE,
  tab_key TEXT NOT NULL CHECK (tab_key IN ('dsh', 'rev', 'kpi')),
  severity TEXT NOT NULL
    CHECK (severity IN ('info', 'warning', 'error')),
  issue_code TEXT NOT NULL,
  message TEXT NOT NULL,
  source_row INTEGER,
  source_col TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_ledger_validations_run_severity_idx
  ON public.sales_ledger_validations (import_run_id, severity, tab_key);

ALTER TABLE public.sales_ledger_validations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage sales ledger validations"
  ON public.sales_ledger_validations;
CREATE POLICY "Admins manage sales ledger validations"
  ON public.sales_ledger_validations
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

COMMENT ON TABLE public.sales_ledger_validations IS
  'Import data-quality issues for parity, duplicates, missing owners, month totals, and source-format gaps.';

REVOKE EXECUTE ON FUNCTION public.prevent_sales_ledger_import_snapshot_mutation()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_sales_ledger_active_source_succeeded()
  FROM PUBLIC, anon, authenticated;
