-- Typed forecast-operation contract for sales ledger drafts.
-- Existing beta rows keep working: generated columns are nullable and the
-- checks are added NOT VALID so prior local metadata is not backfilled-blocking.

ALTER TABLE public.branch_sales_ledger_drafts
  ADD COLUMN IF NOT EXISTS operation TEXT GENERATED ALWAYS AS (
    lower(nullif(btrim(coalesce(metadata->>'operation', metadata->>'operation_type')), ''))
  ) STORED,
  ADD COLUMN IF NOT EXISTS confidence TEXT GENERATED ALWAYS AS (
    replace(lower(nullif(btrim(coalesce(metadata->>'confidence', metadata->>'forecastConfidence')), '')), '-', '_')
  ) STORED,
  ADD COLUMN IF NOT EXISTS product_category TEXT GENERATED ALWAYS AS (
    lower(nullif(btrim(coalesce(metadata->>'product_category', metadata->>'productCategory')), ''))
  ) STORED,
  ADD COLUMN IF NOT EXISTS source_month TEXT GENERATED ALWAYS AS (
    nullif(btrim(coalesce(
      metadata->>'source_month',
      metadata->>'sourceMonth',
      metadata->>'from_month',
      metadata->>'fromMonth'
    )), '')
  ) STORED,
  ADD COLUMN IF NOT EXISTS target_month TEXT GENERATED ALWAYS AS (
    coalesce(
      nullif(btrim(coalesce(
        metadata->>'target_month',
        metadata->>'targetMonth',
        metadata->>'to_month',
        metadata->>'toMonth'
      )), ''),
      ledger_month
    )
  ) STORED,
  ADD COLUMN IF NOT EXISTS source_week TEXT GENERATED ALWAYS AS (
    lower(nullif(btrim(coalesce(
      metadata->>'source_week',
      metadata->>'sourceWeek',
      metadata->>'from_week',
      metadata->>'fromWeek'
    )), ''))
  ) STORED,
  ADD COLUMN IF NOT EXISTS target_week TEXT GENERATED ALWAYS AS (
    lower(coalesce(
      nullif(btrim(coalesce(
        metadata->>'target_week',
        metadata->>'targetWeek',
        metadata->>'to_week',
        metadata->>'toWeek',
        metadata->>'week'
      )), ''),
      'month'
    ))
  ) STORED,
  ADD COLUMN IF NOT EXISTS quantity NUMERIC GENERATED ALWAYS AS (
    CASE
      WHEN nullif(btrim(coalesce(metadata->>'quantity', metadata->>'forecastQuantity')), '') ~ '^[0-9]+(\.[0-9]+)?$'
        THEN btrim(coalesce(metadata->>'quantity', metadata->>'forecastQuantity'))::numeric
      ELSE NULL
    END
  ) STORED,
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC GENERATED ALWAYS AS (
    CASE
      WHEN nullif(btrim(coalesce(metadata->>'unit_price', metadata->>'unitPrice')), '') ~ '^[0-9]+(\.[0-9]+)?$'
        THEN btrim(coalesce(metadata->>'unit_price', metadata->>'unitPrice'))::numeric
      ELSE NULL
    END
  ) STORED;

ALTER TABLE public.branch_sales_ledger_entries
  ADD COLUMN IF NOT EXISTS operation TEXT GENERATED ALWAYS AS (
    lower(nullif(btrim(coalesce(metadata->>'operation', metadata->>'operation_type')), ''))
  ) STORED,
  ADD COLUMN IF NOT EXISTS confidence TEXT GENERATED ALWAYS AS (
    replace(lower(nullif(btrim(coalesce(metadata->>'confidence', metadata->>'forecastConfidence')), '')), '-', '_')
  ) STORED,
  ADD COLUMN IF NOT EXISTS product_category TEXT GENERATED ALWAYS AS (
    lower(nullif(btrim(coalesce(metadata->>'product_category', metadata->>'productCategory')), ''))
  ) STORED,
  ADD COLUMN IF NOT EXISTS source_month TEXT GENERATED ALWAYS AS (
    nullif(btrim(coalesce(
      metadata->>'source_month',
      metadata->>'sourceMonth',
      metadata->>'from_month',
      metadata->>'fromMonth'
    )), '')
  ) STORED,
  ADD COLUMN IF NOT EXISTS target_month TEXT GENERATED ALWAYS AS (
    coalesce(
      nullif(btrim(coalesce(
        metadata->>'target_month',
        metadata->>'targetMonth',
        metadata->>'to_month',
        metadata->>'toMonth'
      )), ''),
      ledger_month
    )
  ) STORED,
  ADD COLUMN IF NOT EXISTS source_week TEXT GENERATED ALWAYS AS (
    lower(nullif(btrim(coalesce(
      metadata->>'source_week',
      metadata->>'sourceWeek',
      metadata->>'from_week',
      metadata->>'fromWeek'
    )), ''))
  ) STORED,
  ADD COLUMN IF NOT EXISTS target_week TEXT GENERATED ALWAYS AS (
    lower(coalesce(
      nullif(btrim(coalesce(
        metadata->>'target_week',
        metadata->>'targetWeek',
        metadata->>'to_week',
        metadata->>'toWeek',
        metadata->>'week'
      )), ''),
      'month'
    ))
  ) STORED,
  ADD COLUMN IF NOT EXISTS quantity NUMERIC GENERATED ALWAYS AS (
    CASE
      WHEN nullif(btrim(coalesce(metadata->>'quantity', metadata->>'forecastQuantity')), '') ~ '^[0-9]+(\.[0-9]+)?$'
        THEN btrim(coalesce(metadata->>'quantity', metadata->>'forecastQuantity'))::numeric
      ELSE NULL
    END
  ) STORED,
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC GENERATED ALWAYS AS (
    CASE
      WHEN nullif(btrim(coalesce(metadata->>'unit_price', metadata->>'unitPrice')), '') ~ '^[0-9]+(\.[0-9]+)?$'
        THEN btrim(coalesce(metadata->>'unit_price', metadata->>'unitPrice'))::numeric
      ELSE NULL
    END
  ) STORED;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.branch_sales_ledger_drafts'::regclass
      AND conname = 'branch_sales_ledger_drafts_operation_check'
  ) THEN
    ALTER TABLE public.branch_sales_ledger_drafts
      ADD CONSTRAINT branch_sales_ledger_drafts_operation_check
      CHECK (
        operation IS NULL
        OR operation IN ('forecast-add', 'period-shift', 'quantity-change', 'amount-change')
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.branch_sales_ledger_drafts'::regclass
      AND conname = 'branch_sales_ledger_drafts_confidence_check'
  ) THEN
    ALTER TABLE public.branch_sales_ledger_drafts
      ADD CONSTRAINT branch_sales_ledger_drafts_confidence_check
      CHECK (
        confidence IS NULL
        OR confidence IN ('confirmed', 'high_confidence', 'expected', 'format_unavailable')
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.branch_sales_ledger_drafts'::regclass
      AND conname = 'branch_sales_ledger_drafts_product_category_check'
  ) THEN
    ALTER TABLE public.branch_sales_ledger_drafts
      ADD CONSTRAINT branch_sales_ledger_drafts_product_category_check
      CHECK (
        product_category IS NULL
        OR product_category IN ('software', 'hardware', 'unknown')
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.branch_sales_ledger_drafts'::regclass
      AND conname = 'branch_sales_ledger_drafts_forecast_month_check'
  ) THEN
    ALTER TABLE public.branch_sales_ledger_drafts
      ADD CONSTRAINT branch_sales_ledger_drafts_forecast_month_check
      CHECK (
        (source_month IS NULL OR source_month ~ '^[0-9]{4}-[0-9]{2}$')
        AND target_month ~ '^[0-9]{4}-[0-9]{2}$'
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.branch_sales_ledger_drafts'::regclass
      AND conname = 'branch_sales_ledger_drafts_forecast_week_check'
  ) THEN
    ALTER TABLE public.branch_sales_ledger_drafts
      ADD CONSTRAINT branch_sales_ledger_drafts_forecast_week_check
      CHECK (
        (source_week IS NULL OR source_week IN ('month', 'w1', 'w2', 'w3', 'w4', 'w5'))
        AND target_week IN ('month', 'w1', 'w2', 'w3', 'w4', 'w5')
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.branch_sales_ledger_drafts'::regclass
      AND conname = 'branch_sales_ledger_drafts_quantity_unit_price_check'
  ) THEN
    ALTER TABLE public.branch_sales_ledger_drafts
      ADD CONSTRAINT branch_sales_ledger_drafts_quantity_unit_price_check
      CHECK (
        (quantity IS NULL OR quantity >= 0)
        AND (unit_price IS NULL OR unit_price >= 0)
        AND (
          NOT (metadata ? 'quantity')
          OR metadata->>'quantity' IS NULL
          OR btrim(metadata->>'quantity') = ''
          OR btrim(metadata->>'quantity') ~ '^[0-9]+(\.[0-9]+)?$'
        )
        AND (
          NOT (metadata ? 'forecastQuantity')
          OR metadata->>'forecastQuantity' IS NULL
          OR btrim(metadata->>'forecastQuantity') = ''
          OR btrim(metadata->>'forecastQuantity') ~ '^[0-9]+(\.[0-9]+)?$'
        )
        AND (
          NOT (metadata ? 'unit_price')
          OR metadata->>'unit_price' IS NULL
          OR btrim(metadata->>'unit_price') = ''
          OR btrim(metadata->>'unit_price') ~ '^[0-9]+(\.[0-9]+)?$'
        )
        AND (
          NOT (metadata ? 'unitPrice')
          OR metadata->>'unitPrice' IS NULL
          OR btrim(metadata->>'unitPrice') = ''
          OR btrim(metadata->>'unitPrice') ~ '^[0-9]+(\.[0-9]+)?$'
        )
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.branch_sales_ledger_entries'::regclass
      AND conname = 'branch_sales_ledger_entries_operation_check'
  ) THEN
    ALTER TABLE public.branch_sales_ledger_entries
      ADD CONSTRAINT branch_sales_ledger_entries_operation_check
      CHECK (
        operation IS NULL
        OR operation IN ('forecast-add', 'period-shift', 'quantity-change', 'amount-change')
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.branch_sales_ledger_entries'::regclass
      AND conname = 'branch_sales_ledger_entries_confidence_check'
  ) THEN
    ALTER TABLE public.branch_sales_ledger_entries
      ADD CONSTRAINT branch_sales_ledger_entries_confidence_check
      CHECK (
        confidence IS NULL
        OR confidence IN ('confirmed', 'high_confidence', 'expected', 'format_unavailable')
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.branch_sales_ledger_entries'::regclass
      AND conname = 'branch_sales_ledger_entries_product_category_check'
  ) THEN
    ALTER TABLE public.branch_sales_ledger_entries
      ADD CONSTRAINT branch_sales_ledger_entries_product_category_check
      CHECK (
        product_category IS NULL
        OR product_category IN ('software', 'hardware', 'unknown')
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.branch_sales_ledger_entries'::regclass
      AND conname = 'branch_sales_ledger_entries_forecast_month_check'
  ) THEN
    ALTER TABLE public.branch_sales_ledger_entries
      ADD CONSTRAINT branch_sales_ledger_entries_forecast_month_check
      CHECK (
        (source_month IS NULL OR source_month ~ '^[0-9]{4}-[0-9]{2}$')
        AND target_month ~ '^[0-9]{4}-[0-9]{2}$'
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.branch_sales_ledger_entries'::regclass
      AND conname = 'branch_sales_ledger_entries_forecast_week_check'
  ) THEN
    ALTER TABLE public.branch_sales_ledger_entries
      ADD CONSTRAINT branch_sales_ledger_entries_forecast_week_check
      CHECK (
        (source_week IS NULL OR source_week IN ('month', 'w1', 'w2', 'w3', 'w4', 'w5'))
        AND target_week IN ('month', 'w1', 'w2', 'w3', 'w4', 'w5')
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.branch_sales_ledger_entries'::regclass
      AND conname = 'branch_sales_ledger_entries_quantity_unit_price_check'
  ) THEN
    ALTER TABLE public.branch_sales_ledger_entries
      ADD CONSTRAINT branch_sales_ledger_entries_quantity_unit_price_check
      CHECK (
        (quantity IS NULL OR quantity >= 0)
        AND (unit_price IS NULL OR unit_price >= 0)
        AND (
          NOT (metadata ? 'quantity')
          OR metadata->>'quantity' IS NULL
          OR btrim(metadata->>'quantity') = ''
          OR btrim(metadata->>'quantity') ~ '^[0-9]+(\.[0-9]+)?$'
        )
        AND (
          NOT (metadata ? 'forecastQuantity')
          OR metadata->>'forecastQuantity' IS NULL
          OR btrim(metadata->>'forecastQuantity') = ''
          OR btrim(metadata->>'forecastQuantity') ~ '^[0-9]+(\.[0-9]+)?$'
        )
        AND (
          NOT (metadata ? 'unit_price')
          OR metadata->>'unit_price' IS NULL
          OR btrim(metadata->>'unit_price') = ''
          OR btrim(metadata->>'unit_price') ~ '^[0-9]+(\.[0-9]+)?$'
        )
        AND (
          NOT (metadata ? 'unitPrice')
          OR metadata->>'unitPrice' IS NULL
          OR btrim(metadata->>'unitPrice') = ''
          OR btrim(metadata->>'unitPrice') ~ '^[0-9]+(\.[0-9]+)?$'
        )
      ) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS branch_sales_ledger_drafts_operation_month_idx
  ON public.branch_sales_ledger_drafts (operation, target_month, target_week)
  WHERE operation IS NOT NULL;

CREATE INDEX IF NOT EXISTS branch_sales_ledger_drafts_product_confidence_idx
  ON public.branch_sales_ledger_drafts (product_category, confidence, target_month)
  WHERE product_category IS NOT NULL OR confidence IS NOT NULL;

CREATE INDEX IF NOT EXISTS branch_sales_ledger_entries_operation_month_idx
  ON public.branch_sales_ledger_entries (operation, target_month, target_week)
  WHERE operation IS NOT NULL;
