-- 매출 장부 내부 원장(drafts/entries) 운영 보강 — DB 설계 점검 후속.
--
-- 1) 인덱스: 기본 목록 쿼리와 인덱스가 어긋나 있었다.
--    - entries 목록은 entry_status 필터 + applied_at DESC 정렬인데 기존 인덱스는
--      (entry_status, ledger_month)뿐이라 append-only로 계속 자라는 테이블에서
--      매번 정렬이 필요했다.
--    - drafts 목록의 status='all' 경로는 updated_at DESC 정렬을 인덱스 없이 수행했다.
-- 2) reversal 계약 실현: entry_status CHECK와 예외 메시지("reverse them instead")는
--    'reversed'를 약속하지만, no-update 트리거가 모든 UPDATE를 차단해 그 상태로
--    전이할 방법이 없었다(도달 불가능한 상태). active→reversed 상태 전이와
--    반전 사유 기록(metadata)만 허용하도록 트리거를 좁힌다.

CREATE INDEX IF NOT EXISTS branch_sales_ledger_entries_status_applied_idx
  ON public.branch_sales_ledger_entries (entry_status, applied_at DESC);

CREATE INDEX IF NOT EXISTS branch_sales_ledger_drafts_updated_idx
  ON public.branch_sales_ledger_drafts (updated_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_branch_sales_ledger_entry_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- 허용되는 유일한 변경: active → reversed 전이 + metadata(반전 사유) 갱신.
  -- 금액·귀속월·고객 등 원장 사실 컬럼은 여전히 불변이다. updated_at은 별도
  -- update_updated_at 트리거가 관리하므로 비교에서 제외한다.
  IF OLD.entry_status = 'active'
     AND NEW.entry_status = 'reversed'
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.draft_id IS NOT DISTINCT FROM OLD.draft_id
     AND NEW.entry_type IS NOT DISTINCT FROM OLD.entry_type
     AND NEW.source_deal_id IS NOT DISTINCT FROM OLD.source_deal_id
     AND NEW.source_sheet_row IS NOT DISTINCT FROM OLD.source_sheet_row
     AND NEW.source_snapshot IS NOT DISTINCT FROM OLD.source_snapshot
     AND NEW.customer_name IS NOT DISTINCT FROM OLD.customer_name
     AND NEW.manager IS NOT DISTINCT FROM OLD.manager
     AND NEW.team IS NOT DISTINCT FROM OLD.team
     AND NEW.ledger_month IS NOT DISTINCT FROM OLD.ledger_month
     AND NEW.amount IS NOT DISTINCT FROM OLD.amount
     AND NEW.currency IS NOT DISTINCT FROM OLD.currency
     AND NEW.note IS NOT DISTINCT FROM OLD.note
     AND NEW.applied_by IS NOT DISTINCT FROM OLD.applied_by
     AND NEW.applied_at IS NOT DISTINCT FROM OLD.applied_at
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Applied sales ledger entries are append-only; only active -> reversed status transitions (with metadata note) are allowed';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_branch_sales_ledger_entry_update()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.prevent_branch_sales_ledger_entry_update() IS
  'Append-only guard for branch_sales_ledger_entries; permits only active->reversed status transitions with metadata updates.';
