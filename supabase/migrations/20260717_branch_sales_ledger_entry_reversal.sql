-- 매출 장부 내부 원장(entries) "되돌리기(reverse)" 백엔드 — 웨이브5.
--
-- 배경: 20260630 마이그레이션이 entry_status CHECK IN ('active','reversed')와
-- "reverse them instead" 트리거 메시지로 반전 상태를 예비해뒀지만, active -> reversed로
-- 전이할 RPC가 없어 도달 불가능한 상태였다(R4 지적: 오적용 복구 경로 없음).
-- 20260702 마이그레이션이 이 전이를 허용하도록 프리벤션 트리거를 좁혔다 — 이 파일은
-- (a) 그 트리거 정의를 동일 로직으로 재단언해 20260702 적용 여부와 무관하게 안전하게 하고,
-- (b) 실제 반전 RPC와 감사 컬럼을 추가하며,
-- (c) "정정(edit-row 유래) 항목은 딜·월당 활성 1건" 유일성을 강제한다.
--
-- 상쇄 방식(사용자 확정): 원 entry를 DELETE하지 않고 entry_status='reversed'로 마크한다.
-- 연결된 draft.status는 절대 건드리지 않는다(감사 추적 — "이 초안은 X일에 적용됐다"는 사실은
-- 반전 이후에도 불변이어야 한다).

-- 1) 감사 컬럼 — 누가/언제/왜 반전했는지.
ALTER TABLE public.branch_sales_ledger_entries
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by TEXT,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

COMMENT ON COLUMN public.branch_sales_ledger_entries.reversed_at IS
  'reverse_branch_sales_ledger_entry()가 active->reversed로 전이시킨 시각. reversed 상태가 아니면 NULL.';
COMMENT ON COLUMN public.branch_sales_ledger_entries.reversed_by IS
  '반전을 실행한 관리자 액터(표시 이름/userId/role) — applied_by와 동일 관례.';
COMMENT ON COLUMN public.branch_sales_ledger_entries.reversal_reason IS
  '반전 사유(선택) — 운영자가 남긴 자유 텍스트.';

-- 2) 프리벤션 트리거 재단언 — 20260702가 이미 적용됐다면 바이트 동일 재정의(무해),
--    아직이라면 이 마이그레이션 단독으로도 active->reversed 전이가 열린다.
--    reversed_at/reversed_by/reversal_reason은 새 컬럼이라 아래 불변 컬럼 목록에 없고,
--    따라서 이 전이 중 자유롭게 바뀔 수 있다(의도된 동작).
CREATE OR REPLACE FUNCTION public.prevent_branch_sales_ledger_entry_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
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

-- 3) 반전 RPC — FOR UPDATE로 잠그고, active만 reversed로 전이한다. 멱등: 이미 reversed면
--    기존 반전 감사 정보(누가/언제/왜)를 덮어쓰지 않고 그대로 반환한다.
CREATE OR REPLACE FUNCTION public.reverse_branch_sales_ledger_entry(
  p_entry_id UUID,
  p_actor TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.branch_sales_ledger_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry public.branch_sales_ledger_entries%ROWTYPE;
  v_now TIMESTAMPTZ := now();
BEGIN
  SELECT *
    INTO v_entry
    FROM public.branch_sales_ledger_entries
   WHERE id = p_entry_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_entry.entry_status = 'reversed' THEN
    -- 이미 반전됨 — 멱등 no-op. 최초 반전자/시각/사유를 보존한다.
    RETURN v_entry;
  END IF;

  UPDATE public.branch_sales_ledger_entries
     SET entry_status = 'reversed',
         reversed_at = v_now,
         reversed_by = p_actor,
         reversal_reason = nullif(btrim(coalesce(p_reason, '')), '')
   WHERE id = p_entry_id
   RETURNING *
    INTO v_entry;

  RETURN v_entry;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reverse_branch_sales_ledger_entry(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_branch_sales_ledger_entry(UUID, TEXT, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.reverse_branch_sales_ledger_entry(UUID, TEXT, TEXT) IS
  '적용된 매출 장부 entry를 상쇄(active->reversed)한다. draft.status는 건드리지 않는다(감사 추적). 멱등.';

-- 4) 감사/조회 인덱스 — "언제 반전됐나"로 정렬하는 향후 감사 뷰용
--    (기존 branch_sales_ledger_entries_status_applied_idx는 applied_at 정렬이라 별도 필요).
CREATE INDEX IF NOT EXISTS branch_sales_ledger_entries_reversed_at_idx
  ON public.branch_sales_ledger_entries (reversed_at DESC)
  WHERE entry_status = 'reversed';

-- 5) 유일성 — (source_deal_id, ledger_month)당 활성 "정정(entry_type='manual-edit', 즉
--    edit-row 초안에서 유래)" entry는 최대 1건이어야 한다. 원본 시트 셀을 대체하는 단일
--    진실이기 때문 — 두 개가 동시에 active면 그 셀이 이중 반영된다(R4 "멀티탭 이중계상").
--
--    manual-new(entry_type='manual-new', new-row 초안 유래)는 스코프 밖이다: 매트릭스에서는
--    가감이 누적되는 "추가 행"으로 취급되어(SalesLedgerWorkbench의 additiveAppliedDraftRows)
--    같은 딜·월에 여러 건이 정당하게 공존한다(예: forecast-add를 여러 번 쌓는 운영 패턴).
--    이 인덱스를 entry_type으로 스코프하지 않으면 그 정당한 누적 입력이 막힌다.
--
--    2026-07-17 프로브: 운영 branch_sales_ledger_entries는 0행(이 내부 원장은 아직 실사용
--    전)이라 기존 데이터 위반 없이 VALID 유니크 인덱스로 즉시 적용 가능했다(NOT VALID로
--    미루지 않음). apply_branch_sales_ledger_draft()의 INSERT가 이 인덱스를 위반하면
--    23505로 실패해 같은 함수 호출(단일 트랜잭션) 안의 draft.status='applied' 갱신도
--    롤백된다 — draft는 'checked'로 안전하게 남는다.
CREATE UNIQUE INDEX IF NOT EXISTS branch_sales_ledger_entries_active_manual_edit_unique
  ON public.branch_sales_ledger_entries (source_deal_id, ledger_month)
  WHERE entry_status = 'active'
    AND entry_type = 'manual-edit'
    AND source_deal_id IS NOT NULL;

COMMENT ON INDEX public.branch_sales_ledger_entries_active_manual_edit_unique IS
  '딜·월당 활성 정정(manual-edit) entry 1건 제약 — manual-new(가감 누적)는 의도적으로 스코프 밖.';
