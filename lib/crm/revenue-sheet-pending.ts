// 매출시트 '확정 예정' 분해 — REV 파서가 raw에 실은 예정분(ADR-0062: 아직 오지 않은 주차의 빨간 금액)을
// 행·월 금액으로 바꾼다. 서버(lib/admin-crm-revenue-sheet.ts)에서만 부른다 — 파서 모듈을 클라이언트
// 번들에 끌어들이지 않게 화면용 문구 헬퍼(formatPendingTransition)는 revenue-sheet-view.ts에 둔다.

import { readRevPendingCells, type RevPendingCell } from "@/lib/branch/computations/rev-confirmed"
import { ledgerCellStart } from "@/lib/branch/parsers/rev"

export interface RevPendingSource {
  pending?: Record<string, number> | null
  pending_weeks?: Record<string, number[]> | null
  /**
   * 읽는 시점 판정 재료(raw.pendingCells — 빨간 예정 칸 {week, start, amount}). 있으면(그리고 today 를 주면) 이것만 본다 —
   * 캐논(rev-confirmed.ts)이 시작일(KST)이 온 칸을 이미 확정으로 읽으므로, '확정 예정'은 시작일이 오늘 뒤인 칸만이다(F-08).
   * 없으면 파싱 시점 맵(pending·pending_weeks — 예전 동기화분).
   */
  pending_cells?: unknown
}

/** 읽는 시점 예정 칸 — 시작일이 today 뒤인 것만. 재료(pendingCells)가 없으면 null(파싱 시점 맵으로 판정). */
function upcomingCells(source: RevPendingSource, month: string, today: string | undefined): RevPendingCell[] | null {
  if (!today || source.pending_cells == null) return null
  const cells = readRevPendingCells({ pendingCells: source.pending_cells })
  if (!cells) return null
  return (cells[month] ?? []).filter((cell) => cell.start > today)
}

/**
 * 한 달 미확정분(uncolored = 합계 − 확정 − 임박) 중 '확정 예정' 몫.
 * 예정분은 캐논(rev-confirmed.ts)에서 확정이 아니라 예상 몫으로 남으므로 그 안에서만 떼어 낸다(이중 계상 없음).
 * 지난달 이전(동기화가 멈춰 예정이 지나간 경우)은 전환 대기로 두기 위해 0.
 */
export function pendingMonthAmount(
  source: RevPendingSource,
  month: string,
  uncolored: number,
  currentMonth: string,
  /** 읽는 날(KST 'YYYY-MM-DD') — 주면 raw.pendingCells 로 시작일이 오늘 뒤인 칸만 센다. */
  today?: string,
): number {
  if (month < currentMonth || !(uncolored > 0)) return 0
  const cells = upcomingCells(source, month, today)
  const raw = cells ? cells.reduce((sum, cell) => sum + cell.amount, 0) : Number(source.pending?.[month] ?? 0)
  if (!Number.isFinite(raw) || raw <= 0) return 0
  return Math.min(uncolored, raw)
}

/** 가장 이른 예정 칸 — 주차 번호(월 합계 칸 = 0)와 그 시작일(YYYY-MM-DD). 금액이 남은 달만 본다. */
export function nextPendingTransition(
  source: RevPendingSource,
  months: Iterable<string>,
  /** 읽는 날(KST 'YYYY-MM-DD') — 주면 raw.pendingCells 의 시작일이 오늘 뒤인 칸만 본다. */
  today?: string,
): { week: number; start: string } | null {
  let best: { week: number; start: string } | null = null
  for (const month of months) {
    const cells = upcomingCells(source, month, today)
    if (cells) {
      for (const cell of cells) {
        if (!best || cell.start < best.start) best = { week: cell.week, start: cell.start }
      }
      continue
    }
    for (const week of source.pending_weeks?.[month] ?? []) {
      if (!Number.isInteger(week) || week < 0 || week > 5) continue
      const start = ledgerCellStart(month, week)
      if (!best || start < best.start) best = { week, start }
    }
  }
  return best
}
