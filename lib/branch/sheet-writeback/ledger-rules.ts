// 시트 쓰기 감사 행으로 장부 화면·매출시트 배너·되돌리기 가드가 같이 쓰는 판정 — 순수 모듈(클라이언트 겸용 — server-only 금지).
//
// 정본은 여기 하나다. 서버(lib/admin-crm-revenue-sheet.ts 미반영 배너, app/api/admin/branch/ledger-drafts/[id] 되돌리기)와
// 화면(components/admin/branch/ledger/sheet-write-view.ts)은 이 함수를 가져다 쓴다 — 규칙을 따로 짜지 않는다.

/**
 * 감사 행(public.branch_sales_ledger_sheet_writes)의 status — 닫힌 목록의 정본. 마이그레이션 CHECK 제약과 같고,
 * 저장소(SHEET_WRITE_STATUSES)와 화면(GET sheetWrites 판독)이 이 배열을 쓴다.
 */
export const SHEET_WRITE_ATTEMPT_STATUSES = ["sending", "written", "refused", "failed", "unknown"] as const
export type SheetWriteAttemptStatus = (typeof SHEET_WRITE_ATTEMPT_STATUSES)[number]

/**
 * 시트에 쓴 정정을 미러가 이미 읽었는가 — 시도가 written 이고, 그 뒤에 시작한 REV 동기화가 성공했으면
 * branch_rev_deals(미러)가 그 값을 갖고 있다. 그 초안을 장부 오버레이·미반영 배너에 또 세면 같은 금액이
 * 시트 행 값과 적용 초안 양쪽에서 읽힌다(시트가 정본 — 미러를 믿는다). 시각을 해석하지 못하면 false(기존 동작 쪽).
 * 경계는 엄격한 < 다 — 같은 시각에 시작한 동기화는 그 쓰기를 읽었다고 보장하지 못한다.
 */
export function isSheetWriteAbsorbed(
  sw: { status: string; writtenAt: string | null } | null | undefined,
  lastRevSyncStartedAt: string | null,
): boolean {
  if (!sw || sw.status !== "written" || !sw.writtenAt || !lastRevSyncStartedAt) return false
  const writtenAt = Date.parse(sw.writtenAt)
  const syncStartedAt = Date.parse(lastRevSyncStartedAt)
  return Number.isFinite(writtenAt) && Number.isFinite(syncStartedAt) && writtenAt < syncStartedAt
}

/**
 * 장부 되돌리기(PATCH action=reverse)를 막는가 — 시트에 쓴 정정을 장부에서만 상쇄하면 시트에는 새 값이 남는다.
 * written, 그리고 sending(장부 항목은 시트 되읽기 확인 뒤에만 생기므로 항목이 있는데 sending 이면 시트에는 쓰였고
 * 감사 행 갱신만 못 한 것)이면 막는다. 그 밖·기록 없음은 기존 동작.
 */
export function sheetWriteBlocksReverse(status: string | null | undefined): boolean {
  return status === "written" || status === "sending"
}
