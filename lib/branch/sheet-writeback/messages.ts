// REV 시트 쓰기 결과 코드 → 고정 한국어 문구 — 순수 모듈(클라이언트 겸용).
//
// 코드 목록은 닫혀 있다. 화면(배지·결과 줄·칸 아래 힌트)과 API 응답이 같은 문구를 쓴다.
// 문구에 시트 값·고객명·오류 원문을 섞지 않는다(오류 원문은 감사 표의 error 칸에만).

export const SHEET_WRITE_CODES = [
  "written",
  "already_written",
  "conflict",
  "past_week",
  "week_ambiguous",
  "clear_not_supported",
  "amount_invalid",
  "no_row_id",
  "row_not_found",
  "row_id_duplicate",
  "identity_changed",
  "formula_cell",
  "month_formula_irregular",
  "no_baseline",
  "layout_changed",
  "not_allowed",
  "sheet_permission",
  "sheet_error",
  "outcome_unknown",
  "row_shifted",
  "verify_mismatch",
  "db_apply_failed",
  "new_row_app_only",
  "disabled",
  "month_not_in_sheet",
  "not_applied",
] as const

export type SheetWriteCode = (typeof SHEET_WRITE_CODES)[number]

export const SHEET_WRITE_MESSAGES: Record<SheetWriteCode, string> = {
  written: "시트에 반영됨",
  already_written: "이미 시트에 같은 값이 있어 장부만 기록",
  conflict: "시트가 바뀌었습니다 — 새로고침 뒤 다시 입력해 주세요",
  past_week: "지난 주차는 시트에서 직접 고쳐 주세요",
  week_ambiguous: "주차가 여럿인 달 — ⋯에서 주차별로 고쳐 주세요",
  clear_not_supported: "칸 비우기·달 삭제는 시트에서 직접 해 주세요",
  amount_invalid: "정수 금액만 쓸 수 있습니다",
  no_row_id: "행 ID 없음 — 관리자가 행 ID 스크립트를 다시 돌려야 합니다",
  row_not_found: "시트에서 이 행을 찾지 못했습니다 — 새로고침해 주세요",
  row_id_duplicate: "같은 행 ID 가 여러 행에 있습니다 — 관리자 확인 필요",
  identity_changed: "시트의 이 행 고객이 바뀌었습니다 — 새로고침해 주세요",
  formula_cell: "수식이 든 칸 — 시트에서 직접 고쳐 주세요",
  month_formula_irregular: "이 달 합계 수식이 다른 칸을 더합니다 — 시트 수식부터 고쳐 주세요",
  no_baseline: "예전 방식으로 만든 초안 — 칸을 다시 입력해 주세요",
  layout_changed: "시트 머리 구조가 바뀌었습니다 — 관리자 확인 필요",
  not_allowed: "허용되지 않은 시트 대상",
  sheet_permission: "시트 쓰기 권한이 없습니다",
  sheet_error: "시트 호출 실패 — 바뀐 것은 없습니다",
  outcome_unknown: "시트 반영 여부 확인 중 — 잠시 뒤 다시 반영을 눌러 주세요",
  row_shifted: "쓰는 사이 시트 행이 움직였습니다 — 되돌렸습니다, 관리자 확인",
  verify_mismatch: "쓴 값이 확인과 다릅니다 — 관리자 확인",
  db_apply_failed: "시트에는 반영됐지만 장부 기록 실패 — 다시 반영을 눌러 주세요",
  new_row_app_only: "새 행은 장부에만 반영됨(시트 쓰기 대상 아님)",
  disabled: "시트 쓰기 꺼짐 — 장부에만 반영됨",
  // target.ts WriteRefusal 의 한 갈래 — 그 달 블록이 시트 머리에 없다(회계연도가 다른 달 등).
  month_not_in_sheet: "이 달은 시트에 없습니다 — 시트에서 직접 고쳐 주세요",
  // 시트에 손대기 전에 멈춘 경우(체크 완료가 아닌 초안·초안 조회 실패·감사 기록 실패·한 번에 50건 초과).
  not_applied: "장부 반영 안 됨 — 시트는 그대로입니다",
}

export function isSheetWriteCode(v: unknown): v is SheetWriteCode {
  return typeof v === "string" && (SHEET_WRITE_CODES as readonly string[]).includes(v)
}

export function sheetWriteMessage(code: SheetWriteCode): string {
  return SHEET_WRITE_MESSAGES[code]
}
