/**
 * hardware-catalog.ts — 공개 하드웨어 가격의 단일 진실원(SSOT).
 *
 * 가격 변경 시 `public/l/omo1/index.html`(수기 정적 랜딩의 가격 섹션)과 반드시 동기화한다.
 * omo1 는 React 가 아니라 손으로 관리하는 정적 HTML 이라 이 모듈을 import 하지 못한다 —
 * 한쪽만 고치면 랜딩 가격과 체크아웃 합계가 조용히 어긋난다.
 *
 * 표기 규칙: 랜딩은 "만원" 단위(540만원)로 읽히게 두고, 체크아웃은 합계 계산이 필요하므로
 * 원 단위 정수(5,400,000)로 다룬다. 두 표기는 같은 값이어야 한다.
 */

export type HardwareItemGroup = "single" | "package"

export interface HardwareCatalogItem {
  /** 주문 라인 식별자. 백엔드 신청 계약(items[].sku)에 그대로 실린다. */
  sku: string
  name: string
  /** 영문 스펙 한 줄 — 카드 부제. */
  spec: string
  /** 구성/설명 한 줄. 패키지는 포함 품목을 적는다. */
  description: string
  /** 원(KRW) 단위 정수. */
  priceKrw: number
  /** 카드 하단 보조 문구(설치·할부 등). 없으면 미표기. */
  note?: string
  group: HardwareItemGroup
  /** 카드 썸네일 — /product/hw 가 쓰는 public 자산을 재사용한다. */
  image?: { src: string; alt: string }
}

/** 하드웨어 주문 라인의 통화. 공개 하드웨어는 원화 고정. */
export const HARDWARE_CURRENCY = "KRW" as const

/** 수량 스테퍼 범위 — 0 은 "선택 안 함". */
export const HARDWARE_QTY_MIN = 0
export const HARDWARE_QTY_MAX = 99

/** 전 품목 공통 안내(패키지 비고에서 승격). 합계 카드 하단에 노출한다. */
export const HARDWARE_ORDER_NOTE = "설치 배송비 포함 · 12개월 할부 가능"

export const HARDWARE_CATALOG: readonly HardwareCatalogItem[] = [
  {
    sku: "hw-board-75",
    name: '75" Classin 전자칠판',
    spec: "75-inch Interactive Display",
    description: "교실의 새로운 기준이 되는 대형 인터랙티브 보드.",
    priceKrw: 5_400_000,
    group: "single",
    image: {
      src: "/images/product/hw/spaces/space-s75-seminar.webp",
      alt: '75" Classin 전자칠판이 설치된 세미나룸',
    },
  },
  {
    sku: "hw-board-86",
    name: '86" Classin 전자칠판',
    spec: "86-inch Flagship Display",
    description: "몰입형 수업과 시연에 최적화된 플래그십 디스플레이.",
    priceKrw: 6_300_000,
    group: "single",
    image: {
      src: "/images/product/hw/spaces/space-s86-classroom.webp",
      alt: '86" Classin 전자칠판이 설치된 교실',
    },
  },
  {
    sku: "hw-camera-t1",
    name: "AI Tracking Camera (T1)",
    spec: "Premium Lecture Camera",
    description: "자동 트래킹 기반의 프리미엄 강의 카메라.",
    priceKrw: 1_200_000,
    group: "single",
    image: {
      src: "/images/product/hw/camera/camera-dual-premium-blended.webp",
      alt: "AI Tracking Camera T1 듀얼 카메라 제품 컷",
    },
  },
  {
    sku: "hw-package-ai-studio",
    name: "올인원 녹화수업 세트 · Classin AI Studio",
    spec: "Package 1 · One-Stop Solution",
    description:
      '86" 전자칠판 + AI 카메라 + 벽걸이 + 자동 녹화 1년 이용권(약 1,200시간)',
    priceKrw: 8_300_000,
    note: HARDWARE_ORDER_NOTE,
    group: "package",
    image: {
      src: "/images/product/hw/hero/hero-board-stand.webp",
      alt: "Classin AI Studio 스탠드형 전자칠판 구성",
    },
  },
] as const

/** sku → 카탈로그 항목. 미등록 sku 는 null. */
export function getHardwareItem(sku: string): HardwareCatalogItem | null {
  return HARDWARE_CATALOG.find((item) => item.sku === sku) ?? null
}

/** sku → 수량 맵. 화면 상태의 형태이자 합계 계산의 입력. */
export type HardwareQuantities = Record<string, number>

/** 수량을 유효 범위(0~99) 정수로 강제한다. NaN·음수·소수는 전부 흡수. */
export function clampHardwareQty(value: number): number {
  if (!Number.isFinite(value)) return HARDWARE_QTY_MIN
  const rounded = Math.trunc(value)
  if (rounded < HARDWARE_QTY_MIN) return HARDWARE_QTY_MIN
  if (rounded > HARDWARE_QTY_MAX) return HARDWARE_QTY_MAX
  return rounded
}

/** 전 품목 수량 0 인 초기 상태. */
export function createEmptyHardwareQuantities(): HardwareQuantities {
  const quantities: HardwareQuantities = {}
  for (const item of HARDWARE_CATALOG) {
    quantities[item.sku] = HARDWARE_QTY_MIN
  }
  return quantities
}

/** 선택된 총 수량(점). 미등록 sku 는 무시. */
export function countHardwareUnits(quantities: HardwareQuantities): number {
  return HARDWARE_CATALOG.reduce(
    (total, item) => total + clampHardwareQty(quantities[item.sku] ?? 0),
    0
  )
}

/** 선택 합계(원). 미등록 sku 는 합계에 넣지 않는다. */
export function computeHardwareTotalKrw(quantities: HardwareQuantities): number {
  return HARDWARE_CATALOG.reduce((total, item) => {
    const qty = clampHardwareQty(quantities[item.sku] ?? 0)
    return total + qty * item.priceKrw
  }, 0)
}

/** 신청 계약(POST /api/checkout/request)의 items 라인. */
export interface CheckoutRequestItem {
  sku: string
  name: string
  qty: number
  unitAmount: number
  currency: "KRW" | "USD"
}

/** 수량 맵 → 계약 items. 수량 0 인 품목은 제외하고 카탈로그 순서를 유지한다. */
export function buildHardwareRequestItems(
  quantities: HardwareQuantities
): CheckoutRequestItem[] {
  const items: CheckoutRequestItem[] = []
  for (const item of HARDWARE_CATALOG) {
    const qty = clampHardwareQty(quantities[item.sku] ?? 0)
    if (qty <= 0) continue
    items.push({
      sku: item.sku,
      name: item.name,
      qty,
      unitAmount: item.priceKrw,
      currency: HARDWARE_CURRENCY,
    })
  }
  return items
}

/** 원 단위 콤마 표기. "만원" 축약을 쓰지 않는다(합계 오독 방지). */
export function formatHardwareKrw(amount: number): string {
  return `₩${Math.round(amount).toLocaleString("ko-KR")}`
}
