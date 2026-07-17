-- 웨이브 7 (I5) — branch_sales_ledger_drafts.amount 서버 검증의 DB 레벨 방어선.
--
-- 배경: 초안 API(app/api/admin/branch/ledger-drafts)가 amount<=0을 그대로 저장할 수 있었다.
-- 이 저장소의 "정정(edit-row)"은 원 셀 값을 대체(절대값)하는 방식이라(SalesLedgerWorkbench 관례:
-- amount-change=대체) 음수/0은 유효한 표현이 아니다. 감액(decrease)은 amount를 음수로 넣는 게
-- 아니라 장부 가감(반전 후 재적용 등)으로 표현해야 한다. 이번 웨이브에서 admin API POST/PATCH가
-- amount<=0을 400으로 거부하도록 막았고, 이 마이그레이션은 그 불변식을 DB 레벨에서도 강제한다.
--
-- 예외(중요): lib/admin/handoff/contract-to-ledger-draft.ts가 V2 계약 양측 서명 완료 직후
-- kind='new-row', status='draft', amount=0(CNY)으로 forecast 초안을 자동 제안한다. 계약 금액은
-- KRW 추정이라 임의 CNY 환산을 금지하고(통화 환산 금지 원칙), 검수자가 실제 CNY 금액을 채워 넣게
-- 설계돼 있다 — 이 흐름은 admin API를 거치지 않고 repository 함수를 직접 호출하므로 이번 웨이브의
-- POST/PATCH amount<=0 거부의 영향을 받지 않는다. 만약 CHECK를 무조건 amount>0으로 걸면 매 계약
-- 서명마다 이 자동 제안 INSERT가 23514로 실패해 핸드오프 기능 전체가 죽는다.
--
-- 따라서 CHECK는 "status가 checked/applied로 전이될 때"만 amount>0을 강제한다:
--   - status='draft'인 동안은 0원 플레이스홀더(자동 제안)가 계속 허용된다.
--   - 검수자가 실제 금액을 입력한 뒤 'checked'로 전이하려는 순간부터는 amount>0이 아니면
--     DB가 이 CHECK로 막는다(적용 전 마지막 방어선 — apply RPC는 status='checked'만 소비하므로
--     이 시점 이후로 흘러들어가는 모든 내부 원장 entry는 amount>0이 보장된다).
--
-- 2026-07-18 프로브(tmp/db-probe-ledger-amount-check.mjs): branch_sales_ledger_drafts는 2행,
-- branch_sales_ledger_entries는 0행이며 둘 다 amount<=0 위반 없음(무조건부 amount>0 기준으로도
-- 위반 0건이었으므로, 이보다 느슨한 아래 조건부 CHECK는 당연히 위반 없음) — VALID 제약으로 즉시
-- 적용 가능(NOT VALID로 미루지 않음).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.branch_sales_ledger_drafts'::regclass
      AND conname = 'branch_sales_ledger_drafts_amount_positive_check'
  ) THEN
    ALTER TABLE public.branch_sales_ledger_drafts
      ADD CONSTRAINT branch_sales_ledger_drafts_amount_positive_check
      CHECK (status NOT IN ('checked', 'applied') OR amount > 0);
  END IF;
END $$;

COMMENT ON CONSTRAINT branch_sales_ledger_drafts_amount_positive_check
  ON public.branch_sales_ledger_drafts IS
  '체크 완료(checked)/적용(applied) 상태에서는 금액이 반드시 양수 — draft 상태의 0원 플레이스홀더(계약 서명 자동 제안, lib/admin/handoff/contract-to-ledger-draft.ts)는 허용한다. 감액은 amount 음수화가 아니라 장부 가감(반전/재적용)으로 표현한다.';
