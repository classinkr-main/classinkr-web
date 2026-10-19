// 매출시트 '확정 예정' 분해 — REV 파서가 raw에 실은 예정분(ADR-0062: 아직 오지 않은 주차의 빨간 금액)을
// 행·월 금액으로 바꾼다. 서버(lib/admin-crm-revenue-sheet.ts)에서만 부른다 — 파서 모듈을 클라이언트
// 번들에 끌어들이지 않게 화면용 문구 헬퍼(formatPendingTransition)는 revenue-sheet-view.ts에 둔다.

import { ledgerCellStart } from "@/lib/branch/parsers/rev"

export interface RevPendingSource {
  pending?: Record<string, number> | null
  pending_weeks?: Record<string, number[]> | null
}

/**
 * 한 달 미확정분(uncolored = 합계 − 확정 − 임박) 중 '확정 예정' 몫.
 * 예정분은 캐논(rev-confirmed.ts)에서 확정이 아니라 예상 몫으로 남으므로 그 안에서만 떼어 낸다(이중 계상 없음).
 * 지난달 이전(동기화가 멈춰 예정이 지나간 경우)은 전환 대기로 두기 위해 0.
 */
export function pendingMonthAmount(source: RevPendingSource, month: string, uncolored: number, currentMonth: string): number {
  if (month < currentMonth || !(uncolored > 0)) return 0
  const raw = Number(source.pending?.[month] ?? 0)
  if (!Number.isFinite(raw) || raw <= 0) return 0
  return Math.min(uncolored, raw)
}

/** 가장 이른 예정 칸 — 주차 번호(월 합계 칸 = 0)와 그 시작일(YYYY-MM-DD). 금액이 남은 달만 본다. */
export function nextPendingTransition(
  source: RevPendingSource,
  months: Iterable<string>,
): { week: number; start: string } | null {
  let best: { week: number; start: string } | null = null
  for (const month of months) {
    for (const week of source.pending_weeks?.[month] ?? []) {
      if (!Number.isInteger(week) || week < 0 || week > 5) continue
      const start = ledgerCellStart(month, week)
      if (!best || start < best.start) best = { week, start }
    }
  }
  return best
}
