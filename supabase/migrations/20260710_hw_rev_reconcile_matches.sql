-- 하드웨어 출고 ↔ REV 매출 대사: 계정×월 존재성 그레인 (2026-07-10 운영 결정 — 마스터플랜 §7)
--
-- 선행 조건: 20260703_normalized_account_key.sql (public.normalized_account_key 함수).
-- 이 마이그레이션은 그 함수를 GENERATED 컬럼으로 물리화하고, 액티브 REV 임포트 런의
-- HW 분류 라인과 무효 아닌 실출고를 계정×월로 FULL OUTER JOIN 하는 뷰를 만든다.
--
-- 통화 철칙: HW 출고 금액=USD(amount_usd), REV 매출=CNY(amount). 병기만 하고
-- 환산·합산·금액 동등 매칭은 하지 않는다 — 이 뷰는 "존재성"(있어야 할 매출/출고가
-- 없는 계정×월)만 판정한다.

-- ─── Phase A: GENERATED account_key 컬럼 + 인덱스 ───────────────────────────

-- 출고 원장(재고 SSOT — 2026-07-10 결정): to_location에 시트 destination(고객사)이 실린다.
ALTER TABLE public.hardware_movements
  ADD COLUMN IF NOT EXISTS account_key text
    GENERATED ALWAYS AS (public.normalized_account_key(to_location)) STORED;

CREATE INDEX IF NOT EXISTS hardware_movements_account_key_outbound_idx
  ON public.hardware_movements (account_key, occurred_at)
  WHERE movement_type = 'outbound' AND voided_at IS NULL;

-- DB-native REV 라인(액티브 런 기준 조인 축)
ALTER TABLE public.branch_rev_lines
  ADD COLUMN IF NOT EXISTS account_key text
    GENERATED ALWAYS AS (public.normalized_account_key(account_name)) STORED;

CREATE INDEX IF NOT EXISTS branch_rev_lines_account_key_idx
  ON public.branch_rev_lines (import_run_id, account_key);

-- ─── Phase B: 계정×월 존재성 매칭 뷰 ────────────────────────────────────────
--
-- REV 축: sales_ledger_active_sources(tab_key='rev')가 가리키는 런의 라인 중
--   product가 Hardware로 분류된 것(실측 값: 'Hardware' — TS 분류기
--   classifySalesLedgerProductCategory의 SQL 근사, ILIKE '%hardware%').
-- HW 축: hardware_movements의 무효 아님(voided_at IS NULL)·실출고(occurred_at 존재)
--   outbound. 배송예정(occurred_at 없음)은 실출고가 아니므로 제외 — 운영 철칙.
-- 샘플/사내 이동 판정(classifyDestination)은 TS 레이어 몫 — 뷰는 대표 원문명
--   (raw_account_name)을 실어 소비자가 걸러낸다.

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
  'HW outbound (ledger, non-void, shipped) x active-run REV hardware lines, joined on normalized account_key + YYYY-MM. Existence-grain reconciliation only: USD/CNY amounts are side-by-side, never converted or compared.';

-- 뷰는 어드민 서비스 롤 전용 — PostgREST 익명/인증 경로로 새지 않게 회수.
REVOKE ALL ON public.v_hardware_rev_matches FROM anon, authenticated;
