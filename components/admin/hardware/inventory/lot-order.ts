// 물량번호(lot) 정렬 — 입고 목록·내역의 물량번호 드롭다운이 같은 규칙을 쓴다(하드웨어 라운드 2 E-1).
//
// 예전 규칙은 "H 번호 내림차순 → 그 밖 가나다"였다. H8 다음 세대는 C1·C2(reference §3-4)라, 지금 쓰는 C 계열과
// 방금 저장한 C3가 H8~H0 뒤 맨 아래로 갔고, 목록 첫 lot("직전 구성 복사")이 H8이 됐다. 날짜가 정본이다.

import { formatLotLabel } from "./shared"

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

function hNumber(lot: string): number | null {
  const match = /^H(\d+)$/i.exec(formatLotLabel(lot) ?? lot)
  return match ? Number(match[1]) : null
}

function lotLabel(lot: string): string {
  return formatLotLabel(lot) ?? lot
}

/** 입고일(그 lot 의 첫 입고) 내림차순 → 같은 날이면 H 번호 내림차순 → 가나다. 날짜 없는 lot 은 맨 뒤. */
export function compareInboundLotGroups(a: { lot: string; date: string | null }, b: { lot: string; date: string | null }): number {
  const dateA = a.date && DATE_KEY.test(a.date) ? a.date : ""
  const dateB = b.date && DATE_KEY.test(b.date) ? b.date : ""
  if (dateA !== dateB) {
    if (!dateA) return 1
    if (!dateB) return -1
    return dateA < dateB ? 1 : -1
  }
  const hA = hNumber(a.lot)
  const hB = hNumber(b.lot)
  if (hA != null && hB != null && hA !== hB) return hB - hA
  if (hA != null && hB == null) return -1
  if (hB != null && hA == null) return 1
  return lotLabel(a.lot).localeCompare(lotLabel(b.lot), "ko")
}

/** lot 목록 → 최근 입고 순. lastDateByLot 은 lot 별 가장 늦은 원장 날짜(드롭다운용 — 최근 움직인 lot 이 위로). */
export function sortLotsByRecency(lots: Iterable<string>, lastDateByLot: ReadonlyMap<string, string>): string[] {
  return Array.from(lots).sort((a, b) =>
    compareInboundLotGroups({ lot: a, date: lastDateByLot.get(a) ?? null }, { lot: b, date: lastDateByLot.get(b) ?? null })
  )
}
