// 빠른 기록 시트의 순수 로직 — 견적 붙여넣기 줄 해석, 품목 매칭, 직전 기록 고르기(하드웨어 라운드 2 Q-3·Q-7·Q-8·Q-9).
// React 렌더 하네스가 없는 저장소라 동작을 순수 함수로 떼어 테스트로 고정한다(tests/admin/hardware-quick-record-model.test.ts).

import { normalizeHardwareText, type HardwareItem, type HardwareMovement, type HardwareStockRow } from "./shared"

/**
 * 붙여넣은 견적·CRM 한 줄 → { 품목 텍스트, 수량 }.
 * - 전각 숫자·전각 기호는 NFKC로 접는다(`２` → `2`, `＊` → `*`).
 * - 수량 표기: `x2`·`×2`·`*2`, `2대`·`2개`·`2ea`, 끝 칸 `, 2`·탭 2. 끝 칸의 천 단위(`1,200`)는 한 수로 읽는다.
 * - 수량을 못 읽으면 1로 두고 quantityGuessed=true 로 알린다 — 호출부가 "1로 담음 N줄"을 말하게.
 */
export function parseHardwareLineText(line: string): { productText: string; quantity: number; quantityGuessed: boolean } | null {
  // 탭은 칸 구분이라 남긴다(스프레드시트 붙여넣기) — 나머지 공백만 한 칸으로 접는다.
  const cleaned = line.normalize("NFKC").replace(/[•·]/g, " ").replace(/[^\S\t]+/g, " ").trim()
  if (!cleaned) return null
  const quantityMatch =
    cleaned.match(/(?:^|\s)(?:x|\*|×)\s*(\d{1,3}(?:,\d{3})+|\d+)\s*$/i) ??
    cleaned.match(/(?:^|\s)(\d{1,3}(?:,\d{3})+|\d+)\s*(?:대|ea|개)\s*$/i) ??
    cleaned.match(/(?:[,\t]|\s-\s)\s*(\d{1,3}(?:,\d{3})+|\d+)\s*$/)
  const parsedQuantity = quantityMatch ? Number(quantityMatch[1].replace(/,/g, "")) : NaN
  const quantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? Math.floor(parsedQuantity) : 1
  const productText = (quantityMatch ? cleaned.slice(0, quantityMatch.index) : cleaned)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[-–—:|,]+$/g, "")
    .trim()
  return productText ? { productText, quantity, quantityGuessed: !quantityMatch } : null
}

// 부분일치는 네 글자 이상일 때만 — `T1`이 `DT1`·`T1(promoted)`에 걸리지 않게(입고표 붙여넣기·CRM 대사와 같은 기준).
const PARTIAL_MATCH_MIN_LENGTH = 4

/**
 * 텍스트 → 재고 행. **완전일치(품목명·별칭)를 모든 행에서 먼저** 찾고, 없을 때만 네 글자 이상 부분일치를 본다.
 * 예전엔 한 번의 find 안에서 부분일치도 참이라, 이름순으로 앞에 오는 `DT1`이 `T1` 입력을 가로챘다(Q-3).
 */
export function matchStockRowByText(
  stock: readonly HardwareStockRow[],
  items: readonly Pick<HardwareItem, "id" | "source_aliases">[],
  text: string
): HardwareStockRow | null {
  const normalized = normalizeHardwareText(text)
  if (!normalized) return null
  const aliasesOf = (row: HardwareStockRow) =>
    (items.find((candidate) => candidate.id === row.itemId)?.source_aliases ?? []).map(normalizeHardwareText).filter(Boolean)

  const exact = stock.find((row) => normalizeHardwareText(row.product) === normalized || aliasesOf(row).includes(normalized))
  if (exact) return exact
  if (normalized.length < PARTIAL_MATCH_MIN_LENGTH) return null

  const partial = (candidate: string) =>
    candidate.length >= PARTIAL_MATCH_MIN_LENGTH && (candidate.includes(normalized) || normalized.includes(candidate))
  return stock.find((row) => partial(normalizeHardwareText(row.product)) || aliasesOf(row).some(partial)) ?? null
}

/**
 * "직전 기록 복제" 후보 — 어드민이 직접 만든 **출고 계열** 기록 중 가장 최근.
 * - 입고는 입고표, 예외 처리(반납·수리·조정·배정)는 상세 모드가 담당한다 — 복제가 빠른 시트를 입고 모드로 바꾸면
 *   입고표를 우회한 입고가 생긴다(Q-8).
 * - 처리일은 날짜 컬럼이라 같은 날이 흔하다 — 같은 날이면 생성 시각이 늦은 것(Q-7).
 */
export function pickLatestManualOutbound(movements: readonly HardwareMovement[]): HardwareMovement | null {
  let latest: HardwareMovement | null = null
  let latestDay = -Infinity
  let latestCreated = -Infinity
  for (const movement of movements) {
    if (movement.voided_at || movement.source !== "admin_manual" || movement.movement_type !== "outbound") continue
    const day = new Date(movement.occurred_at ?? movement.created_at).getTime()
    const created = new Date(movement.created_at).getTime()
    if (!Number.isFinite(day)) continue
    const createdTime = Number.isFinite(created) ? created : -Infinity
    if (day > latestDay || (day === latestDay && createdTime > latestCreated)) {
      latest = movement
      latestDay = day
      latestCreated = createdTime
    }
  }
  return latest
}

/** 샘플 대여 전환 때 도착 칸에 남은 값이 고객사인지(프리셋 기본 위치가 아닌지). */
export function customerFromDestination(toLocation: string, presetLocations: ReadonlySet<string>): string {
  const trimmed = toLocation.trim()
  return trimmed && !presetLocations.has(trimmed) ? trimmed : ""
}
