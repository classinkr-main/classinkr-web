-- 매출 장부 반영 → '2. REV' 시트 쓰기 감사 기록(2026-10-23).
--
-- 장부(/admin/branch/ledger)의 "반영"이 시트 쓰기 스위치(BRANCH_REV_SHEET_WRITE_ENABLED, Production 전용)가
-- 켜진 상태에서 시트 '2. REV' 주차 칸에 쓰려 할 때마다 초안 하나에 한 행을 남긴다.
--   sending  — 시트에 보내기 직전(이 행을 못 남기면 시트에 쓰지 않는다)
--   written  — 시트가 의도한 값을 가졌고 장부 반영까지 시도함(code 가 db_apply_failed 면 장부만 실패)
--   refused  — 쓰기 전 판정에서 거절(지난 주차·충돌·수식 칸 등 — code 참고)
--   failed   — 시트 호출 거절(4xx)·읽기 실패·되읽기 확인 실패(행 이동·값 불일치)
--   unknown  — 5xx·마감 초과 — 시트 반영 여부를 모른다(다시 보내지 않는다)
-- 앱 코드: lib/repositories/branch-sales-ledger-sheet-writes.ts, lib/branch/sheet-writeback/apply-service.ts
--
-- 기존 표(branch_sales_ledger_drafts/entries)·RPC(apply_branch_sales_ledger_draft)는 고치지 않는다. 시트 쓰기 반영은
-- 그 RPC 를 감싼 apply_branch_sales_ledger_draft_if_unchanged(아래)로 장부에 적는다 — 시트에 쓰는 사이 초안이 고쳐졌으면
-- 적지 않는다(시트에 쓴 값과 다른 금액을 장부에 남기지 않는다).
-- 전부 멱등(IF NOT EXISTS / DROP ... IF EXISTS / CREATE OR REPLACE) — 재실행은 무해하다.
-- 미적용 환경: 스위치가 꺼져 있으면 영향 없음. 켜져 있으면 감사 행을 못 남겨 시트 쓰기가 전부 500 으로 막힌다
-- (장부·시트 모두 그대로).

CREATE TABLE IF NOT EXISTS public.branch_sales_ledger_sheet_writes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL
    REFERENCES public.branch_sales_ledger_drafts(id)
    ON DELETE RESTRICT,
  -- 한 번의 반영 요청(시트 batchUpdate 한 번)에 묶인 시도들.
  batch_id UUID NOT NULL,
  status TEXT NOT NULL,
  -- lib/branch/sheet-writeback/messages.ts SheetWriteCode.
  code TEXT NOT NULL,
  -- '2. REV' 숨김 Row ID 열 값(r_ + Crockford base32 12자). 행을 못 찾은 거절은 NULL.
  row_id TEXT,
  sheet_row INTEGER,
  ledger_month TEXT,
  -- 계획한 칸: [{ a1, row, col, before{value,color}, after{value,color}, writeValue, writeColor }]
  cells JSONB NOT NULL DEFAULT '[]'::jsonb,
  actor TEXT NOT NULL,
  error TEXT,
  entry_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  written_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT branch_sales_ledger_sheet_writes_status_check
    CHECK (status IN ('sending', 'written', 'refused', 'failed', 'unknown')),
  CONSTRAINT branch_sales_ledger_sheet_writes_code_check
    CHECK (code ~ '^[a-z_]{1,40}$'),
  CONSTRAINT branch_sales_ledger_sheet_writes_row_id_check
    CHECK (row_id IS NULL OR row_id ~ '^r_[0-9a-hjkmnp-tv-z]{12}$'),
  CONSTRAINT branch_sales_ledger_sheet_writes_month_check
    CHECK (ledger_month IS NULL OR ledger_month ~ '^[0-9]{4}-[0-9]{2}$'),
  CONSTRAINT branch_sales_ledger_sheet_writes_cells_check
    CHECK (jsonb_typeof(cells) = 'array')
);

CREATE INDEX IF NOT EXISTS branch_sales_ledger_sheet_writes_draft_created_idx
  ON public.branch_sales_ledger_sheet_writes (draft_id, created_at DESC);

DROP TRIGGER IF EXISTS branch_sales_ledger_sheet_writes_updated_at ON public.branch_sales_ledger_sheet_writes;
CREATE TRIGGER branch_sales_ledger_sheet_writes_updated_at
  BEFORE UPDATE ON public.branch_sales_ledger_sheet_writes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 감사 기록은 지우지 않는다. UPDATE 는 상태 칸(status·code·written_at·entry_id·error·updated_at)만 바꿀 수 있고,
-- 끝난 시도를 다시 sending 으로 되돌리지 못한다.
CREATE OR REPLACE FUNCTION public.prevent_branch_sales_ledger_sheet_write_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'Sales ledger sheet write audit rows cannot be deleted';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id OR
     NEW.draft_id IS DISTINCT FROM OLD.draft_id OR
     NEW.batch_id IS DISTINCT FROM OLD.batch_id OR
     NEW.row_id IS DISTINCT FROM OLD.row_id OR
     NEW.sheet_row IS DISTINCT FROM OLD.sheet_row OR
     NEW.ledger_month IS DISTINCT FROM OLD.ledger_month OR
     NEW.cells IS DISTINCT FROM OLD.cells OR
     NEW.actor IS DISTINCT FROM OLD.actor OR
     NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Sales ledger sheet write audit rows only allow status/code/written_at/entry_id/error updates';
  END IF;

  IF NEW.status = 'sending' AND OLD.status IS DISTINCT FROM 'sending' THEN
    RAISE EXCEPTION 'Finished sales ledger sheet write attempts cannot return to sending';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS branch_sales_ledger_sheet_writes_guard ON public.branch_sales_ledger_sheet_writes;
CREATE TRIGGER branch_sales_ledger_sheet_writes_guard
  BEFORE UPDATE OR DELETE ON public.branch_sales_ledger_sheet_writes
  FOR EACH ROW EXECUTE FUNCTION public.prevent_branch_sales_ledger_sheet_write_mutation();

DROP TRIGGER IF EXISTS branch_sales_ledger_sheet_writes_no_truncate ON public.branch_sales_ledger_sheet_writes;
CREATE TRIGGER branch_sales_ledger_sheet_writes_no_truncate
  BEFORE TRUNCATE ON public.branch_sales_ledger_sheet_writes
  FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_branch_sales_ledger_sheet_write_mutation();

REVOKE EXECUTE ON FUNCTION public.prevent_branch_sales_ledger_sheet_write_mutation()
  FROM PUBLIC, anon, authenticated;

-- deny-all: 정책이 없으므로 service_role 만 읽고 쓴다(quote_team_templates·crm_saved_segments 관례).
-- 앱은 관리자 API(requireVerifiedAdminContext) 뒤의 service role 저장소로만 접근한다.
ALTER TABLE public.branch_sales_ledger_sheet_writes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.branch_sales_ledger_sheet_writes IS
  '매출 장부 반영 때 REV 시트(2. REV) 주차 칸 쓰기 시도 감사 기록. 지우지 않음, 상태 칸만 갱신.';

-- 시트 쓰기 반영 전용 장부 적용 — 시트 쓰기를 계획할 때 본 초안(updated_at)이 그대로일 때만 기존 apply RPC 를 부른다.
-- 초안 행을 FOR UPDATE 로 잠근 뒤 비교하고 같은 트랜잭션에서 적용하므로, 비교와 적용 사이에 고쳐질 틈이 없다.
--   checked 가 아니거나 없음 → NULL(기존 apply 와 같다)
--   updated_at 이 다름     → 예외 'branch_sales_ledger_draft_changed'(앱이 draft_changed 로 번역 — 장부에 적지 않는다)
CREATE OR REPLACE FUNCTION public.apply_branch_sales_ledger_draft_if_unchanged(
  p_draft_id UUID,
  p_actor TEXT,
  p_expected_updated_at TIMESTAMPTZ
)
RETURNS public.branch_sales_ledger_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draft public.branch_sales_ledger_drafts%ROWTYPE;
BEGIN
  SELECT *
    INTO v_draft
    FROM public.branch_sales_ledger_drafts
   WHERE id = p_draft_id
   FOR UPDATE;

  IF NOT FOUND OR v_draft.status IS DISTINCT FROM 'checked' THEN
    RETURN NULL;
  END IF;

  IF p_expected_updated_at IS NULL OR v_draft.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'branch_sales_ledger_draft_changed'
      USING DETAIL = 'draft ' || p_draft_id::text || ' changed after the sheet write was planned';
  END IF;

  SELECT * INTO v_draft FROM public.apply_branch_sales_ledger_draft(p_draft_id, p_actor);
  RETURN v_draft;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_branch_sales_ledger_draft_if_unchanged(UUID, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_branch_sales_ledger_draft_if_unchanged(UUID, TEXT, TIMESTAMPTZ)
  TO service_role;

COMMENT ON FUNCTION public.apply_branch_sales_ledger_draft_if_unchanged(UUID, TEXT, TIMESTAMPTZ) IS
  'REV 시트 쓰기 반영 전용: 초안 updated_at 이 기대값과 같을 때만 apply_branch_sales_ledger_draft 를 부른다(다르면 예외).';
