// 하드웨어 위치 정규화 — 서버 원장(lib/repositories/hardware-inventory.ts)과 화면(출고 기간 집계 등)이 같은 규칙을
// 쓴다. 순수 함수만 둔다(클라이언트 컴포넌트도 import 한다). 화면이 따로 만든 정규식이 고객사 이름
// ("대치수리학원")을 수리로 빼던 것을 이 한 곳으로 모은다(2026-11-05 점검).

export const WAREHOUSE_LOCATION = "창고"
export const REPAIR_LOCATION = "수리"
export const CUSTOMER_LOCATION = "고객"
export const SAMPLE_LOCATION = "샘플"
export const OFFICE_LOCATION = "사무실"

// 클래스인 본사(사무실·쇼룸) 보관분은 사무실 재고다(운영자 결정 2026-09-15). 시트 보관처에는 "클래스인"으로
// 적힌다. 영문 "ClassIn"은 아래 수리 규칙보다 먼저 판정해야 한다.
const OFFICE_LOCATION_PATTERN = /사무실|office|클래스인|class\s*in/i
// 수리 위치는 수리를 뜻하는 표기에만 맞춘다. 예전 /수리|a\/?s/ 는 단어 안의 "as"(ClassIn·Master)와
// 고객사 이름("대치수리학원"·"수리논술")까지 수리 위치로 보냈다.
const REPAIR_LOCATION_PATTERN =
  /repair|a\/s|(?:^|[^a-z])as(?:\s*센터)?(?:$|[^a-z])|수리(?!\s*(?:학원|논술|영역|수학|과학|탐구|교육|아카데미))/i

export type HardwareLocationClass = "warehouse" | "sample" | "office" | "repair" | "customer" | "other"

function clean(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text.length ? text : null
}

export function normalizeLocationName(value: unknown): string | null {
  const text = clean(value)
  if (!text) return null
  if (/샘플|대여|데모|demo|sample/i.test(text)) return SAMPLE_LOCATION
  if (OFFICE_LOCATION_PATTERN.test(text)) return OFFICE_LOCATION
  if (REPAIR_LOCATION_PATTERN.test(text)) return REPAIR_LOCATION
  if (/창고|warehouse/i.test(text)) return WAREHOUSE_LOCATION
  // FPL(풀필먼트) 위탁 창고 — 판매 가능한 창고 풀에 속한다(2026-08 운영 확정: 인천 더조은).
  // 시트에는 사이트명이 그대로 적히므로 창고로 정규화하고, 원문은 storage_location·raw에 보존한다.
  if (/인천\s*더조은|\bfpl\b/i.test(text)) return WAREHOUSE_LOCATION
  if (/^외부\/?고객$|^고객$|고객사/i.test(text)) return CUSTOMER_LOCATION
  return text
}

export function classifyDestination(value: unknown): HardwareLocationClass {
  const location = normalizeLocationName(value)
  if (!location) return "other"
  if (location === WAREHOUSE_LOCATION) return "warehouse"
  if (location === SAMPLE_LOCATION) return "sample"
  if (location === OFFICE_LOCATION) return "office"
  if (location === REPAIR_LOCATION) return "repair"
  if (location === CUSTOMER_LOCATION) return "customer"
  return "other"
}

/** 내부 위치(창고·샘플·사무실·수리) — 고객사로 나간 것이 아니다. */
export function isInternalLocation(value: unknown): boolean {
  const kind = classifyDestination(value)
  return kind === "warehouse" || kind === "sample" || kind === "office" || kind === "repair"
}
