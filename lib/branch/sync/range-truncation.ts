// Google Sheets 범위 문자열(A1 표기, 예: "'2. REV'!A1:CF1000")에서 절단 가능성을 판정하는
// 순수 함수. Sheets API는 범위를 넘는 데이터를 에러 없이 조용히 잘라내므로, 읽어온 행 수가
// 범위가 선언한 마지막 행 번호에 닿았다면(=더 이상 여유가 없다면) 시트가 범위보다 커져
// 뒷부분 데이터가 잘렸을 가능성이 있다는 신호로 삼는다.
const RANGE_LAST_ROW_RE = /![A-Z]+\d+:[A-Z]+(\d+)$/

/** "'2. REV'!A1:CF1000" → 1000. 범위 문자열을 해석하지 못하면 null. */
export function parseRangeLastRow(range: string): number | null {
  const m = range.match(RANGE_LAST_ROW_RE)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) ? n : null
}

/**
 * 읽어온 그리드 행 수(gridRowCount)가 범위의 마지막 행에 도달(또는 그 이상)했으면 true.
 * 헤더 행 포함 총 행 수를 그대로 넘기면 된다 — readRangeWithFormat은 시트가 범위보다 짧을 때
 * 결과를 트림하지 않으므로, gridRowCount가 범위 상한과 같다는 것은 "그 이상은 알 수 없다"는
 * 뜻이지 "시트가 정확히 그만큼"이라는 뜻은 아니다. 즉 오탐(false positive) 방향으로만 치우친
 * 보수적인 경고이며, 실제 절단 여부를 확정하지는 않는다.
 */
export function isRangeLikelyTruncated(gridRowCount: number, range: string): boolean {
  const lastRow = parseRangeLastRow(range)
  if (lastRow == null) return false
  return gridRowCount >= lastRow
}
