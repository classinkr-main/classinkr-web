-- 하드웨어 출고 ↔ REV 대사 뷰가 배송 예정을 실출고로 세던 문제 수리 (2026-10-22).
--
-- 20260710_hw_rev_reconcile_matches.sql 은 "배송 예정은 occurred_at 이 없다"고 가정하고
-- occurred_at IS NOT NULL 만으로 실출고를 골랐다. 실제로는 예정 등록 때 날짜가 저장된다
-- (빠른 기록의 출고 예정일, CRM 오더 대사의 예정 등록은 오늘 날짜, 시트 출고 행의 날짜).
-- 그래서 예정만 있는 고객·월이 hw_only/both 로 잡혔다.
--
-- 상태 판정은 앱의 isPlannedStatus(lib/repositories/hardware-inventory.ts:
-- /예정|예약|대기|planned/i)와 같은 단어로 맞춘다. 뷰 열 구성은 그대로다(CREATE OR REPLACE 호환).
-- 앱 쪽 대사(lib/repositories/hw-rev-reconcile.ts)는 이미 예정을 따로 세고 있어 코드 변경은 없다.

CREATE OR REPLACE VIEW public.v_hardware_rev_matches AS
WITH active_rev AS (
  SELECT
    l.account_key,
    MAX(l.account_name) AS raw_account_name,
    e.period_month,
    SUM(e.amount) AS rev_cny,
    SUM(e.amount) FILTER (WHERE e.confidence = 'confirmed') AS rev_confirmed_cny,
    COUNT(DISTINCT l.id) AS rev_lines
  FROM public.sales_ledger_active_sources s
  JOIN public.branch_rev_lines l ON l.import_run_id = s.import_run_id
  JOIN public.branch_rev_period_entries e ON e.rev_line_id = l.id
  WHERE s.tab_key = 'rev'
    AND l.product ILIKE '%hardware%'
    AND coalesce(l.account_key, '') <> ''
  GROUP BY l.account_key, e.period_month
),
hw AS (
  SELECT
    m.account_key,
    MAX(m.to_location) AS raw_account_name,
    to_char(m.occurred_at, 'YYYY-MM') AS period_month,
    SUM(m.quantity) AS hw_qty,
    SUM(m.amount_usd) AS hw_amount_usd,
    COUNT(*) AS hw_movements,
    MAX(m.occurred_at) AS last_outbound_date
  FROM public.hardware_movements m
  WHERE m.movement_type = 'outbound'
    AND m.voided_at IS NULL
    AND m.occurred_at IS NOT NULL
    AND NOT (coalesce(m.status, '') ILIKE ANY (ARRAY['%예정%', '%예약%', '%대기%', '%planned%']))
    AND coalesce(m.account_key, '') <> ''
  GROUP BY m.account_key, to_char(m.occurred_at, 'YYYY-MM')
)
SELECT
  COALESCE(hw.account_key, r.account_key) AS account_key,
  COALESCE(hw.raw_account_name, r.raw_account_name) AS raw_account_name,
  COALESCE(hw.period_month, r.period_month) AS period_month,
  CASE
    WHEN hw.account_key IS NOT NULL AND r.account_key IS NOT NULL THEN 'both'
    WHEN hw.account_key IS NOT NULL THEN 'hw_only'
    ELSE 'rev_only'
  END AS match_status,
  hw.hw_qty,
  hw.hw_amount_usd,
  hw.hw_movements,
  hw.last_outbound_date,
  r.rev_cny,
  r.rev_confirmed_cny,
  r.rev_lines
FROM hw
FULL OUTER JOIN active_rev r
  ON r.account_key = hw.account_key AND r.period_month = hw.period_month;

COMMENT ON VIEW public.v_hardware_rev_matches IS
  'HW outbound (ledger, non-void, shipped = dated and not planned/reserved/waiting) x active-run REV hardware lines, joined on normalized account_key + YYYY-MM. Existence-grain reconciliation only: USD/CNY amounts are side-by-side, never converted or compared.';

-- 뷰는 어드민 서비스 롤 전용 — PostgREST 익명/인증 경로로 새지 않게 회수(재정의 후에도 유지 확인).
REVOKE ALL ON public.v_hardware_rev_matches FROM anon, authenticated;
