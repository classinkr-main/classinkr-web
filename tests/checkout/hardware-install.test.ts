import { describe, expect, it } from "vitest"

import {
  HARDWARE_INSTALL_OPTIONS,
  HARDWARE_INSTALL_PRICE_KRW,
  HARDWARE_ORDER_NOTE,
  HARDWARE_PACKAGE_NOTE,
  buildHardwareRequestItems,
  buildInstallRequestItem,
  computeHardwareTotalKrw,
  computeInstallTotalKrw,
  countInstallRequiredUnits,
  createEmptyHardwareQuantities,
  getHardwareInstallOption,
  getHardwareItem,
  HARDWARE_CATALOG,
} from "@/lib/billing/hardware-catalog"

/**
 * 설치비는 전자칠판 단품 가격에 들어 있지 않다(운영 확인, 2026-08-29).
 *
 * 예전에는 패키지 전용 문구 "설치 배송비 포함"을 합계 카드에 그대로 달아, 86" 단품만
 * 담은 사람에게도 설치가 포함된다고 말했다. 견적 카탈로그(lib/product-templates.ts)는
 * 같은 설치를 50만원으로 잡고 있어 실제 청구와 어긋났다. 이 테스트가 그 회귀를 막는다.
 */
function quantities(entries: Record<string, number>) {
  return { ...createEmptyHardwareQuantities(), ...entries }
}

describe("설치비 안내 문구", () => {
  it("전 품목에 붙는 안내는 설치 포함을 주장하지 않는다", () => {
    expect(HARDWARE_ORDER_NOTE).not.toContain("설치")
    expect(HARDWARE_ORDER_NOTE).toContain("할부")
  })

  it("설치 포함 주장은 패키지 전용 문구에만 남는다", () => {
    expect(HARDWARE_PACKAGE_NOTE).toContain("설치 배송비 포함")
  })

  it("패키지만 그 문구를 카드 비고로 갖는다", () => {
    for (const item of HARDWARE_CATALOG) {
      if (item.note === undefined) continue
      expect(item.group, `${item.sku} 가 설치 포함을 주장한다`).toBe("package")
    }
  })
})

describe("설치가 필요한 대수", () => {
  it("전자칠판 단품만 센다", () => {
    expect(countInstallRequiredUnits(quantities({ "hw-board-86": 2 }))).toBe(2)
    expect(countInstallRequiredUnits(quantities({ "hw-board-75": 1, "hw-board-86": 3 }))).toBe(4)
  })

  it("패키지는 벽걸이를 이미 포함해 세지 않는다 — 이중 과금 방지", () => {
    expect(countInstallRequiredUnits(quantities({ "hw-package-ai-studio": 3 }))).toBe(0)
  })

  it("카메라 단품은 설치 대상이 아니다", () => {
    expect(countInstallRequiredUnits(quantities({ "hw-camera-t1": 5 }))).toBe(0)
  })

  it("빈 선택은 0 이다", () => {
    expect(countInstallRequiredUnits(createEmptyHardwareQuantities())).toBe(0)
  })
})

describe("설치 합계", () => {
  it("대당 단가 × 설치 필요 대수다", () => {
    expect(computeInstallTotalKrw("wall", quantities({ "hw-board-86": 2 }))).toBe(
      HARDWARE_INSTALL_PRICE_KRW * 2
    )
  })

  it("방식을 안 골랐거나 미등록 값이면 0 이다", () => {
    const qty = quantities({ "hw-board-86": 2 })
    expect(computeInstallTotalKrw("", qty)).toBe(0)
    expect(computeInstallTotalKrw("엉터리", qty)).toBe(0)
    expect(computeInstallTotalKrw(null, qty)).toBe(0)
  })

  it("설치가 필요 없는 구성이면 방식을 골라도 0 이다", () => {
    expect(computeInstallTotalKrw("wall", quantities({ "hw-package-ai-studio": 1 }))).toBe(0)
  })
})

describe("설치 주문 라인", () => {
  it("고른 방식으로 라인을 만든다", () => {
    const line = buildInstallRequestItem("stand", quantities({ "hw-board-75": 2 }))
    expect(line).toEqual({
      sku: "hw-install-stand",
      name: "이동형 스탠드 설치",
      qty: 2,
      unitAmount: HARDWARE_INSTALL_PRICE_KRW,
      currency: "KRW",
    })
  })

  it("설치가 필요 없으면 라인을 만들지 않는다", () => {
    expect(buildInstallRequestItem("wall", quantities({ "hw-package-ai-studio": 1 }))).toBeNull()
    expect(buildInstallRequestItem("wall", createEmptyHardwareQuantities())).toBeNull()
  })

  it("방식을 안 골랐으면 라인을 만들지 않는다", () => {
    expect(buildInstallRequestItem("", quantities({ "hw-board-86": 1 }))).toBeNull()
  })

  it("구성 라인과 합치면 실제 청구 합계가 된다", () => {
    const qty = quantities({ "hw-board-86": 2 })
    const lines = [...buildHardwareRequestItems(qty), buildInstallRequestItem("wall", qty)!]
    const total = lines.reduce((sum, line) => sum + line.unitAmount * line.qty, 0)

    // 630만원 × 2 + 설치 50만원 × 2
    expect(total).toBe(computeHardwareTotalKrw(qty) + HARDWARE_INSTALL_PRICE_KRW * 2)
  })
})

describe("서버 단가 핀", () => {
  /**
   * 서버(lib/checkout-requests.ts)는 하드웨어 라인의 단가를 getHardwareItem 으로
   * 카탈로그 값에 핀한다. 설치 sku 가 여기서 안 잡히면 라인이 통째로 버려진다.
   */
  it("설치 sku 도 getHardwareItem 으로 찾힌다", () => {
    for (const option of HARDWARE_INSTALL_OPTIONS) {
      const item = getHardwareItem(option.sku)
      expect(item, `${option.sku} 가 서버 검증에서 버려진다`).not.toBeNull()
      expect(item?.priceKrw).toBe(option.priceKrw)
    }
  })

  it("설치 sku 는 화면 카드 목록에는 없다", () => {
    // 설치는 수량으로 담는 물건이 아니라 신청 단계에서 고르는 방식이다.
    const catalogSkus = new Set(HARDWARE_CATALOG.map((item) => item.sku))
    for (const option of HARDWARE_INSTALL_OPTIONS) {
      expect(catalogSkus.has(option.sku)).toBe(false)
    }
  })

  it("설치 sku 는 화면 합계에 섞이지 않는다", () => {
    // computeHardwareTotalKrw 는 카드 수량만 본다 — 설치는 따로 더한다.
    expect(computeHardwareTotalKrw(quantities({ "hw-install-wall": 3 }))).toBe(0)
  })

  it("미등록 값은 옵션으로 인정하지 않는다", () => {
    expect(getHardwareInstallOption("stand")?.sku).toBe("hw-install-stand")
    expect(getHardwareInstallOption("wall")?.sku).toBe("hw-install-wall")
    expect(getHardwareInstallOption("floor")).toBeNull()
    expect(getHardwareInstallOption(null)).toBeNull()
    expect(getHardwareInstallOption(500_000)).toBeNull()
  })
})

describe("견적 카탈로그와의 정합", () => {
  it("설치 단가가 어드민 견적 템플릿과 같다", async () => {
    // 공개 신청 금액과 어드민 견적 금액이 어긋나면 상담에서 말이 달라진다.
    const { PRODUCT_TEMPLATES } = await import("@/lib/product-templates")
    const stand = PRODUCT_TEMPLATES.find((item) => item.key === "stand")
    const wall = PRODUCT_TEMPLATES.find((item) => item.key === "wall-mount")

    expect(stand?.unit_price).toBe(HARDWARE_INSTALL_PRICE_KRW)
    expect(wall?.unit_price).toBe(HARDWARE_INSTALL_PRICE_KRW)
  })
})
