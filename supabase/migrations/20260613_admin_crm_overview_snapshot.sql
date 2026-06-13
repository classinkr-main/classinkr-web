-- ============================================================
-- Admin CRM Overview Snapshot (pre-aggregated business overview)
-- ============================================================
-- 목적
-- - /api/admin/crm/overview 의 business 블록을 요청당 16개 쿼리(각 최대
--   5,000행 로드 + 메모리 조인)에서 단일 RPC 조회로 내린다.
-- - 집계는 DB 안에서 수행해 스냅샷 테이블(admin_crm_overview_snapshots)에
--   JSONB 1행으로 저장한다.
-- - 소스 테이블 쓰기 경로에는 statement-level 트리거를 걸어 dirty 로그를
--   남기고, 조회 RPC(admin_crm_business_overview)가 dirty/TTL 기준으로만
--   재계산한다.
--
-- 적용 후 검증
--   SELECT public.admin_crm_business_overview(0, true);

-- ─── Snapshot tables ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.admin_crm_overview_snapshots (
  snapshot_key        TEXT PRIMARY KEY,
  payload             JSONB NOT NULL,
  refreshed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  refresh_duration_ms INTEGER
);

-- 쓰기 경로가 append-only로 기록하는 dirty 마커.
-- (단일 행 UPDATE 방식은 동시 쓰기 트랜잭션을 직렬화하므로 insert-only로 둔다)
CREATE TABLE IF NOT EXISTS public.admin_crm_overview_dirty_log (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  snapshot_key TEXT NOT NULL DEFAULT 'business',
  marked_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS admin_crm_overview_dirty_log_key_marked_idx
  ON public.admin_crm_overview_dirty_log (snapshot_key, marked_at DESC);

ALTER TABLE public.admin_crm_overview_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_crm_overview_dirty_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read admin crm overview snapshots" ON public.admin_crm_overview_snapshots;
CREATE POLICY "Admins read admin crm overview snapshots"
  ON public.admin_crm_overview_snapshots
  FOR SELECT
  USING (public.is_active_admin());

DROP POLICY IF EXISTS "Admins read admin crm overview dirty log" ON public.admin_crm_overview_dirty_log;
CREATE POLICY "Admins read admin crm overview dirty log"
  ON public.admin_crm_overview_dirty_log
  FOR SELECT
  USING (public.is_active_admin());

-- ─── Dirty marker trigger ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_crm_mark_overview_dirty()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $trg$
BEGIN
  INSERT INTO public.admin_crm_overview_dirty_log (snapshot_key) VALUES ('business');
  RETURN NULL;
END;
$trg$;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'partner_accounts',
    'customers',
    'deals',
    'quotes',
    'contracts',
    'receipts',
    'activity_logs',
    'quote_documents',
    'contract_documents',
    'payments_v2',
    'receipts_v2',
    'calendar_events'
  ]
  LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON public.%I',
      tbl || '_admin_crm_overview_dirty',
      tbl
    );
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
        || 'FOR EACH STATEMENT EXECUTE FUNCTION public.admin_crm_mark_overview_dirty()',
      tbl || '_admin_crm_overview_dirty',
      tbl
    );
  END LOOP;
END $$;

-- ─── Aggregation (lib/admin-crm-overview.ts business 블록과 동일 의미) ──

CREATE OR REPLACE FUNCTION public.admin_crm_compute_business_overview()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $sql$
WITH
deal_stats AS (
  SELECT
    count(*) FILTER (WHERE status = 'active')::int AS active_deal_count,
    count(*) FILTER (
      WHERE status <> 'cancelled' AND (outstanding_amount > 0 OR payment_status <> 'paid')
    )::int AS payment_risk_count,
    COALESCE(sum(installed_amount), 0) AS installed_amount,
    COALESCE(sum(contracted_amount), 0) AS contracted_amount,
    COALESCE(sum(paid_amount), 0) AS paid_amount,
    COALESCE(sum(outstanding_amount), 0) AS outstanding_amount,
    COALESCE(sum(expected_amount) FILTER (WHERE status = 'active'), 0) AS active_expected_amount
  FROM deals
),
legacy_contract_stats AS (
  SELECT COALESCE(sum(total_amount) FILTER (WHERE status <> 'cancelled'), 0) AS contracted_amount
  FROM contracts
),
legacy_receipt_stats AS (
  SELECT COALESCE(sum(total_amount), 0) AS paid_amount
  FROM receipts
),
legacy_quote_stats AS (
  SELECT COALESCE(sum(total_amount) FILTER (WHERE status IN ('accepted', 'converted')), 0) AS accepted_amount
  FROM quotes
),
base_counts AS (
  SELECT
    (SELECT count(*)::int FROM partner_accounts) AS partner_account_count,
    (SELECT count(*)::int FROM customers) AS customer_count,
    (SELECT count(*)::int FROM quote_documents) AS quote_document_count,
    (
      SELECT count(*)::int
      FROM activity_logs
      WHERE created_at >= now() - interval '7 days'
    ) AS recent_activity_count
),
log_candidates AS (
  SELECT
    'activity:' || al.id AS item_id,
    CASE
      WHEN h.haystack ~ 'call|phone|전화|통화' THEN 'call'
      WHEN h.haystack ~ 'visit|meeting|calendar|installation|방문|미팅|설치' THEN 'visit'
      WHEN h.haystack ~ 'quote|견적' THEN 'quote'
      WHEN h.haystack ~ 'payment|receipt|수납|입금|영수' THEN 'payment'
      WHEN h.haystack ~ 'contract|order|주문|계약' THEN 'order'
      ELSE 'activity'
    END AS kind,
    al.summary AS title,
    al.action_type AS summary,
    al.target_type AS status,
    NULL::numeric AS amount,
    al.created_at AS occurred_at,
    al.partner_account_id,
    al.customer_id,
    al.deal_id,
    FALSE AS summary_from_deal,
    NULL::text AS amount_source
  FROM (
    SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 24
  ) al
  CROSS JOIN LATERAL (
    SELECT lower(al.action_type || ' ' || al.target_type || ' ' || COALESCE(al.summary, '')) AS haystack
  ) h
  UNION ALL
  SELECT
    'quote:' || qd.id,
    'quote',
    '견적 ' || qd.quote_number,
    NULL::text,
    qd.status::text,
    NULL::numeric,
    COALESCE(qd.updated_at, qd.created_at),
    NULL::uuid,
    NULL::uuid,
    qd.deal_id,
    TRUE,
    'expected'
  FROM (
    SELECT * FROM quote_documents ORDER BY updated_at DESC LIMIT 12
  ) qd
  UNION ALL
  SELECT
    'contract:' || cd.id,
    'order',
    '계약 ' || cd.contract_number,
    NULL::text,
    cd.status::text,
    NULL::numeric,
    COALESCE(cd.updated_at, cd.created_at),
    NULL::uuid,
    NULL::uuid,
    cd.deal_id,
    TRUE,
    'contracted'
  FROM (
    SELECT * FROM contract_documents ORDER BY updated_at DESC LIMIT 12
  ) cd
  UNION ALL
  SELECT
    'payment:' || p.id,
    'payment',
    '수납',
    COALESCE(NULLIF(p.memo, ''), p.payment_method::text),
    p.payment_method::text,
    p.amount,
    p.paid_at,
    p.partner_account_id,
    p.customer_id,
    p.deal_id,
    FALSE,
    NULL::text
  FROM (
    SELECT * FROM payments_v2 ORDER BY paid_at DESC LIMIT 12
  ) p
  UNION ALL
  SELECT
    'receipt:' || r.id,
    'payment',
    '영수증 ' || r.receipt_number,
    NULL::text,
    'issued',
    r.total_amount,
    COALESCE(r.updated_at, r.created_at),
    r.partner_account_id,
    r.customer_id,
    r.deal_id,
    TRUE,
    NULL::text
  FROM (
    SELECT * FROM receipts_v2 ORDER BY created_at DESC LIMIT 12
  ) r
  UNION ALL
  SELECT
    'calendar:' || ce.id,
    'visit',
    ce.title,
    ce.source_type::text,
    ce.status,
    NULL::numeric,
    ce.starts_at,
    ce.partner_account_id,
    ce.customer_id,
    ce.deal_id,
    FALSE,
    NULL::text
  FROM (
    SELECT * FROM calendar_events ORDER BY starts_at DESC LIMIT 12
  ) ce
),
log_enriched AS (
  SELECT
    lc.*,
    d.id AS deal_join_id,
    CASE WHEN d.id IS NULL THEN NULL ELSE d.deal_code || ' · ' || d.title END AS deal_label,
    d.expected_amount AS deal_expected_amount,
    d.contracted_amount AS deal_contracted_amount,
    COALESCE(lc.customer_id, d.customer_id) AS resolved_customer_id,
    COALESCE(lc.partner_account_id, d.partner_account_id) AS resolved_partner_account_id
  FROM log_candidates lc
  LEFT JOIN deals d ON d.id = lc.deal_id
),
log_final AS (
  SELECT
    le.item_id,
    le.kind,
    le.title,
    CASE WHEN le.summary_from_deal THEN le.deal_label ELSE le.summary END AS summary,
    le.status,
    CASE le.amount_source
      WHEN 'expected' THEN le.deal_expected_amount
      WHEN 'contracted' THEN le.deal_contracted_amount
      ELSE le.amount
    END AS amount,
    le.occurred_at,
    le.resolved_customer_id,
    le.resolved_partner_account_id,
    le.deal_id,
    le.deal_label,
    CASE
      WHEN cu.id IS NULL THEN NULL
      ELSE cu.name || CASE WHEN COALESCE(cu.campus_name, '') <> '' THEN ' · ' || cu.campus_name ELSE '' END
    END AS customer_label,
    pa.name AS partner_account_label,
    CASE
      WHEN le.deal_id IS NOT NULL THEN '/admin/crm/deals/orders?deal=' || le.deal_id
      WHEN le.resolved_customer_id IS NOT NULL THEN '/admin/crm/customers/accounts?customer=' || le.resolved_customer_id
      ELSE '/admin/crm/customers/accounts'
    END AS href
  FROM log_enriched le
  LEFT JOIN customers cu ON cu.id = le.resolved_customer_id
  LEFT JOIN partner_accounts pa ON pa.id = le.resolved_partner_account_id
  ORDER BY le.occurred_at DESC NULLS LAST
  LIMIT 12
),
recent_logs AS (
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', lf.item_id,
          'kind', lf.kind,
          'title', lf.title,
          'summary', lf.summary,
          'status', lf.status,
          'amount', lf.amount,
          'occurredAt', lf.occurred_at,
          'customerId', lf.resolved_customer_id,
          'customerName', lf.customer_label,
          'partnerAccountId', lf.resolved_partner_account_id,
          'partnerAccountName', lf.partner_account_label,
          'dealId', lf.deal_id,
          'dealTitle', lf.deal_label,
          'href', lf.href
        )
        ORDER BY lf.occurred_at DESC NULLS LAST
      ),
      '[]'::jsonb
    ) AS items,
    max(lf.occurred_at) AS latest_at
  FROM log_final lf
),
upcoming_events AS (
  SELECT
    ce.id,
    ce.source_type,
    ce.title,
    ce.starts_at,
    ce.deal_id,
    COALESCE(ce.customer_id, d.customer_id) AS resolved_customer_id,
    COALESCE(ce.partner_account_id, d.partner_account_id) AS resolved_partner_account_id
  FROM calendar_events ce
  LEFT JOIN deals d ON d.id = ce.deal_id
  WHERE ce.starts_at >= now()
    AND ce.starts_at <= now() + interval '7 days'
    AND ce.status <> 'cancelled'
  ORDER BY ce.starts_at ASC
  LIMIT 24
),
upcoming_final AS (
  SELECT
    ue.id,
    CASE
      WHEN lower(COALESCE(ue.source_type::text, '') || ' ' || COALESCE(ue.title, '')) ~ 'install|설치|배송|delivery'
        THEN 'install'
      ELSE 'visit'
    END AS kind,
    COALESCE(NULLIF(ue.title, ''), '일정') AS title,
    COALESCE(
      CASE
        WHEN cu.id IS NULL THEN NULL
        ELSE cu.name || CASE WHEN COALESCE(cu.campus_name, '') <> '' THEN ' · ' || cu.campus_name ELSE '' END
      END,
      pa.name
    ) AS customer_name,
    ue.starts_at,
    CASE
      WHEN ue.deal_id IS NOT NULL THEN '/admin/crm/deals/orders?deal=' || ue.deal_id
      WHEN ue.resolved_customer_id IS NOT NULL THEN '/admin/crm/customers/accounts?customer=' || ue.resolved_customer_id
      ELSE '/admin/crm/customers/accounts'
    END AS href
  FROM upcoming_events ue
  LEFT JOIN customers cu ON cu.id = ue.resolved_customer_id
  LEFT JOIN partner_accounts pa ON pa.id = ue.resolved_partner_account_id
),
upcoming_agg AS (
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', uf.id,
          'kind', uf.kind,
          'title', uf.title,
          'customerName', uf.customer_name,
          'startsAt', uf.starts_at,
          'href', uf.href
        )
        ORDER BY uf.starts_at ASC
      ),
      '[]'::jsonb
    ) AS items
  FROM upcoming_final uf
),
freq_logs AS (
  SELECT
    al.summary,
    al.action_type,
    al.created_at,
    al.deal_id,
    COALESCE(al.customer_id, d.customer_id) AS resolved_customer_id
  FROM activity_logs al
  LEFT JOIN deals d ON d.id = al.deal_id
  WHERE al.created_at >= now() - interval '14 days'
),
freq_counts AS (
  SELECT
    resolved_customer_id,
    count(*)::int AS contact_count,
    max(created_at) AS latest_at
  FROM freq_logs
  WHERE resolved_customer_id IS NOT NULL
  GROUP BY resolved_customer_id
),
freq_latest AS (
  SELECT DISTINCT ON (resolved_customer_id)
    resolved_customer_id,
    summary,
    action_type,
    created_at,
    deal_id
  FROM freq_logs
  WHERE resolved_customer_id IS NOT NULL
  ORDER BY resolved_customer_id, created_at DESC
),
freq_final AS (
  SELECT
    fc.resolved_customer_id AS customer_id,
    COALESCE(
      CASE
        WHEN cu.id IS NULL THEN NULL
        ELSE cu.name || CASE WHEN COALESCE(cu.campus_name, '') <> '' THEN ' · ' || cu.campus_name ELSE '' END
      END,
      '고객 미지정'
    ) AS customer_name,
    fc.contact_count,
    COALESCE(NULLIF(fl.summary, ''), NULLIF(fl.action_type, '')) AS latest_summary,
    fl.created_at AS latest_at,
    CASE
      WHEN fl.deal_id IS NOT NULL THEN '/admin/crm/deals/orders?deal=' || fl.deal_id
      ELSE '/admin/crm/customers/accounts?customer=' || fc.resolved_customer_id
    END AS href
  FROM freq_counts fc
  JOIN freq_latest fl ON fl.resolved_customer_id = fc.resolved_customer_id
  LEFT JOIN customers cu ON cu.id = fc.resolved_customer_id
  ORDER BY fc.contact_count DESC, fc.latest_at DESC
  LIMIT 5
),
freq_agg AS (
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'customerId', ff.customer_id,
          'customerName', ff.customer_name,
          'contactCount', ff.contact_count,
          'latestSummary', ff.latest_summary,
          'latestAt', ff.latest_at,
          'href', ff.href
        )
        ORDER BY ff.contact_count DESC, ff.latest_at DESC
      ),
      '[]'::jsonb
    ) AS items
  FROM freq_final ff
)
SELECT jsonb_build_object(
  'revenue', jsonb_build_object(
    'deliveryTotalAmount', ds.installed_amount,
    'contractedAmount', lcs.contracted_amount + ds.contracted_amount,
    'paidAmount', lrs.paid_amount + ds.paid_amount,
    'outstandingAmount', ds.outstanding_amount + GREATEST(0, lcs.contracted_amount - lrs.paid_amount),
    'expectedPipelineAmount', ds.active_expected_amount,
    'acceptedQuoteAmount', lqs.accepted_amount
  ),
  'kpis', jsonb_build_object(
    'partnerAccountCount', bc.partner_account_count,
    'customerCount', bc.customer_count,
    'activeDealCount', ds.active_deal_count,
    'paymentRiskCount', ds.payment_risk_count,
    'quoteDocumentCount', bc.quote_document_count,
    'recentActivityCount', bc.recent_activity_count
  ),
  'customerLogs', jsonb_build_object(
    'latestActivityAt', rl.latest_at,
    'recent', rl.items
  ),
  'upcomingThisWeek', jsonb_build_object(
    'count', COALESCE(jsonb_array_length(ua.items), 0),
    'items', ua.items
  ),
  'frequentCustomers', fa.items
)
FROM deal_stats ds,
     legacy_contract_stats lcs,
     legacy_receipt_stats lrs,
     legacy_quote_stats lqs,
     base_counts bc,
     recent_logs rl,
     upcoming_agg ua,
     freq_agg fa;
$sql$;

-- ─── Read/refresh orchestrator ────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_crm_business_overview(
  p_max_age_seconds INTEGER DEFAULT 60,
  p_force BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_lock_key CONSTANT BIGINT := hashtextextended('admin_crm_overview:business', 0);
  v_row public.admin_crm_overview_snapshots%ROWTYPE;
  v_dirty TIMESTAMPTZ;
  v_payload JSONB;
  v_started TIMESTAMPTZ;
  v_max_age INTERVAL := make_interval(secs => GREATEST(COALESCE(p_max_age_seconds, 60), 0));
BEGIN
  SELECT * INTO v_row FROM admin_crm_overview_snapshots WHERE snapshot_key = 'business';
  SELECT max(marked_at) INTO v_dirty
  FROM admin_crm_overview_dirty_log
  WHERE snapshot_key = 'business';

  IF NOT COALESCE(p_force, FALSE)
     AND v_row.snapshot_key IS NOT NULL
     AND v_row.refreshed_at >= now() - v_max_age
     AND (v_dirty IS NULL OR v_dirty <= v_row.refreshed_at) THEN
    RETURN jsonb_build_object(
      'refreshedAt', v_row.refreshed_at,
      'stale', FALSE,
      'payload', v_row.payload
    );
  END IF;

  -- 동시 refresh 스탬피드 방지: 다른 트랜잭션이 갱신 중이면 기존 스냅샷을 그대로 반환.
  IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
    IF v_row.snapshot_key IS NOT NULL THEN
      RETURN jsonb_build_object(
        'refreshedAt', v_row.refreshed_at,
        'stale', TRUE,
        'payload', v_row.payload
      );
    END IF;
    -- 스냅샷이 아직 한 번도 없으면 선행 refresh를 기다렸다가 재사용한다.
    PERFORM pg_advisory_xact_lock(v_lock_key);
    SELECT * INTO v_row FROM admin_crm_overview_snapshots WHERE snapshot_key = 'business';
    IF v_row.snapshot_key IS NOT NULL THEN
      RETURN jsonb_build_object(
        'refreshedAt', v_row.refreshed_at,
        'stale', FALSE,
        'payload', v_row.payload
      );
    END IF;
  END IF;

  v_started := clock_timestamp();
  v_payload := admin_crm_compute_business_overview();

  INSERT INTO admin_crm_overview_snapshots (snapshot_key, payload, refreshed_at, refresh_duration_ms)
  VALUES (
    'business',
    v_payload,
    v_started,
    GREATEST(0, round(extract(epoch FROM clock_timestamp() - v_started) * 1000))::int
  )
  ON CONFLICT (snapshot_key) DO UPDATE
    SET payload = EXCLUDED.payload,
        refreshed_at = EXCLUDED.refreshed_at,
        refresh_duration_ms = EXCLUDED.refresh_duration_ms;

  -- 이번 refresh가 반영한 dirty 마커는 정리한다.
  -- (compute 중에 커밋된 쓰기는 marked_at이 v_started 이후라 남는다)
  DELETE FROM admin_crm_overview_dirty_log
  WHERE snapshot_key = 'business'
    AND marked_at <= v_started;

  RETURN jsonb_build_object(
    'refreshedAt', v_started,
    'stale', FALSE,
    'payload', v_payload
  );
END;
$fn$;

-- ─── Grants ───────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.admin_crm_mark_overview_dirty() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_crm_compute_business_overview() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_crm_compute_business_overview() TO service_role;
REVOKE EXECUTE ON FUNCTION public.admin_crm_business_overview(INTEGER, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_crm_business_overview(INTEGER, BOOLEAN) TO service_role;
