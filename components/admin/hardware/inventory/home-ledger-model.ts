// 홈 원장(고객별 · 전체 목록) 순수 모델 — 묶기·필터·검색·부호·제품 요약. HomeLedgerSection 이 메모로 부른다.
// 입력은 대시보드 movements(처리일 내림차순 · 2000건 캡) 그대로다. 순서를 바꾸지 않는다.
import {
  customerLabel,
  formatLotLabel,
  isPlannedMovement,
  MOVEMENT_LABEL,
  normalizeHardwareText,
  outboundSaleType,
  type HardwareMovement,
} from "./shared"

export type LedgerFilter = "all" | "planned" | "outbound" | "inbound" | "sample"

// 포매터는 한 번만 만든다 — 묶음 요약·줄마다 새로 만들면 칩 클릭마다 수백 번 생성된다.
const KO_NUMBER = new Intl.NumberFormat("ko-KR")

// 물류번호 — 수기 행은 lot_no, 시트 이관 행은 reference_no. HardwareInventoryClient 도 여기서 import 한다(단일 정본).
export function movementLot(movement: Pick<HardwareMovement, "lot_no" | "source" | "reference_no">): string | null {
  if (movement.lot_no && movement.lot_no.trim()) return movement.lot_no.trim()
  if (movement.source === "sheet_import" && movement.reference_no && movement.reference_no.trim()) {
    return movement.reference_no.trim()
  }
  return null
}

// 제품 칩용 단축명 — HardwareInventoryClient(기간 집계 칩)와 같이 쓴다.
export function shortProductName(name: string): string {
  return name
    .replace(/\s*전자칠판/g, "")
    .replace(/\s*추적 카메라/g, "")
    .replace(/\s*광각 카메라/g, "")
    .replace(/\s*이동형 스탠드/g, " 스탠드")
    .replace(/\s*윈도우 모듈/g, "")
    .trim()
}

// 물류번호(로트) 잔량 기준 부호 — 서버 lotDeltaOf(lib/repositories/hardware-inventory.ts, server-only 라 복사)와 같은 규칙:
// 입고·회수 +, 출고(예정 포함) −, 조정은 방향대로(출발만 있으면 감소), 이동·수리 0.
// 창고 숫자 증감과는 다르다 — 창고→사무실 이동은 창고가 줄어도 0, 사무실발 샘플 대여는 창고가 그대로여도 −.
export function signedQuantity(
  movement: Pick<HardwareMovement, "movement_type" | "quantity" | "from_location" | "to_location">
): number {
  if (movement.movement_type === "inbound" || movement.movement_type === "return") return movement.quantity
  if (movement.movement_type === "outbound") return -movement.quantity
  if (movement.movement_type === "adjust") {
    return movement.from_location && !movement.to_location ? -movement.quantity : movement.quantity
  }
  return 0
}

/** "+12" · "−2"(유니코드 마이너스) · 로트 잔량을 바꾸지 않는 이동·수리는 부호 없이 수량만. */
export function formatSignedQuantity(
  movement: Pick<HardwareMovement, "movement_type" | "quantity" | "from_location" | "to_location">
): string {
  const delta = signedQuantity(movement)
  const qty = KO_NUMBER.format(movement.quantity)
  if (delta > 0) return `+${qty}`
  if (delta < 0) return `−${qty}`
  return qty
}

// 묶음 상대 — 입고는 물류번호별, 출고는 도착지·회수는 돌아온 곳(from)을 customerLabel 로.
// 조정·이동·수리는 내부 기록이라 고객으로 묶지 않고 유형 이름으로 모은다(창고 증가 조정이 "고객(미지정)"에 섞이지 않게).
export function ledgerPartyLabel(
  movement: Pick<HardwareMovement, "movement_type" | "from_location" | "to_location" | "lot_no" | "source" | "reference_no">
): string {
  if (movement.movement_type === "inbound") {
    return `입고 · ${formatLotLabel(movementLot(movement)) ?? "물류번호 미지정"}`
  }
  if (movement.movement_type === "outbound") return customerLabel(movement.to_location)
  if (movement.movement_type === "return") return customerLabel(movement.from_location)
  return MOVEMENT_LABEL[movement.movement_type]
}

export function matchesLedgerFilter(movement: HardwareMovement, filter: LedgerFilter): boolean {
  if (filter === "planned") return isPlannedMovement(movement)
  if (filter === "outbound" || filter === "inbound") return movement.movement_type === filter
  // 샘플 = 내역 탭 "샘플" 유형과 같은 판정(출고 중 판매유형 샘플).
  if (filter === "sample") return outboundSaleType(movement) === "sample"
  return true
}

/** 검색 — 고객사(묶음 라벨)·제품·위치·물류번호(원본 + 표시 라벨 H0). 공백·따옴표 차이는 무시한다(86 ifp = 86" IFP). */
export function matchesLedgerSearch(movement: HardwareMovement, query: string): boolean {
  const needle = normalizeHardwareText(query)
  if (!needle) return true
  return [
    ledgerPartyLabel(movement),
    movement.product_name,
    movement.to_location,
    movement.from_location,
    movementLot(movement),
    formatLotLabel(movementLot(movement)),
    movement.reference_no,
  ].some((value) => value != null && normalizeHardwareText(value).includes(needle))
}

/**
 * 취소 기록 제외 + 칩 + 검색, 날짜 내림차순. 날짜 없는 줄(시트 기초 입고 H0·조정·날짜 미기입 예정)은 맨 뒤 —
 * 서버 정렬은 이들을 맨 앞에 두어 고객별 목록 상단을 차지했다(2026-11-25 실측 445건 중 50건). 같은 날짜는 입력 순서 유지.
 */
export function filterLedgerRows(movements: readonly HardwareMovement[], filter: LedgerFilter, query: string): HardwareMovement[] {
  const dateKey = (movement: HardwareMovement) => movement.occurred_at?.slice(0, 10) || ""
  return movements
    .filter((movement) => !movement.voided_at && matchesLedgerFilter(movement, filter) && matchesLedgerSearch(movement, query))
    .sort((a, b) => {
      const ka = dateKey(a)
      const kb = dateKey(b)
      if (!ka || !kb) return ka ? -1 : kb ? 1 : 0
      return ka < kb ? 1 : ka > kb ? -1 : 0
    })
}

/** 제품별 수량 합 상위 limit 개 + "외 N"(나머지 제품 수). 같은 수량이면 먼저 나온 제품이 앞. */
export function summarizeProducts(movements: readonly HardwareMovement[], limit = 3): string {
  const tally = new Map<string, number>()
  for (const movement of movements) {
    const name = shortProductName(movement.product_name) || movement.product_name
    tally.set(name, (tally.get(name) ?? 0) + movement.quantity)
  }
  const sorted = Array.from(tally).sort((a, b) => b[1] - a[1])
  const head = sorted
    .slice(0, limit)
    .map(([name, qty]) => `${name} ${KO_NUMBER.format(qty)}`)
    .join(" · ")
  const rest = sorted.length - limit
  return rest > 0 ? `${head} 외 ${rest}` : head
}

export interface LedgerGroup {
  key: string
  label: string
  movements: HardwareMovement[]
  plannedCount: number
  /** 예정이 아닌 기록 중 가장 늦은 날짜(YYYY-MM-DD) — 예정 줄의 날짜는 앞으로의 배송일이라 "최근"에 넣지 않는다. */
  lastDate: string | null
  /** 예정 줄 중 가장 이른 배송 예정일. 예정 줄이 없으면 null. */
  nextPlannedDate: string | null
  summary: string
}

/** 상대별 묶음 — 처음 나온 순서(=최신순) 그대로. */
export function groupLedgerRows(rows: readonly HardwareMovement[]): LedgerGroup[] {
  const groups = new Map<string, LedgerGroup>()
  for (const movement of rows) {
    const label = ledgerPartyLabel(movement)
    let group = groups.get(label)
    if (!group) {
      group = { key: label, label, movements: [], plannedCount: 0, lastDate: null, nextPlannedDate: null, summary: "" }
      groups.set(label, group)
    }
    group.movements.push(movement)
    const date = movement.occurred_at?.slice(0, 10) || null
    if (isPlannedMovement(movement)) {
      group.plannedCount += 1
      if (date && (!group.nextPlannedDate || date < group.nextPlannedDate)) group.nextPlannedDate = date
    } else if (date && (!group.lastDate || date > group.lastDate)) {
      group.lastDate = date
    }
  }
  const result = Array.from(groups.values())
  for (const group of result) group.summary = summarizeProducts(group.movements)
  return result
}

/** 표 날짜 — 올해는 "MM/DD", 다른 해는 "YY/MM/DD", 없으면 "-". today 는 YYYY-MM-DD. */
export function ledgerDate(value: string | null, today: string): string {
  if (!value) return "-"
  const key = value.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key
  const monthDay = `${key.slice(5, 7)}/${key.slice(8, 10)}`
  return key.slice(0, 4) === today.slice(0, 4) ? monthDay : `${key.slice(2, 4)}/${monthDay}`
}
