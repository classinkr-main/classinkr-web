import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import {
  HARDWARE_CATALOG,
  HARDWARE_QTY_MAX,
  buildHardwareRequestItems,
  clampHardwareQty,
  computeHardwareTotalKrw,
  countHardwareUnits,
  createEmptyHardwareQuantities,
  formatHardwareKrw,
  getHardwareItem,
} from "@/lib/billing/hardware-catalog"

/**
 * omo1 은 이 모듈을 import 하지 못하는 수기 정적 HTML 이라, 가격이 조용히 어긋나는 것을
 * 막으려면 테스트가 **HTML 원문을 직접 읽고 파싱**해야 한다(하드코딩 기대값 비교는
 * HTML 만 바뀌었을 때 그대로 통과해버린다).
 */
const OMO1_HTML = readFileSync(
  fileURLToPath(new URL("../../public/l/omo1/index.html", import.meta.url)),
  "utf8"
)

/** `<h4 class="item-name">…</h4> … <div class="item-price">540<span class="unit">만원</span>` */
const SINGLE_ITEM_PATTERN =
  /class="item-name">([^<]+)<[\s\S]*?class="item-price">\s*([\d,]+)\s*<span class="unit">만원/g

/** `<h4 class="pkg-name">…</h4> … <div class="pkg-price"><span class="num">830</span>` */
const PACKAGE_ITEM_PATTERN =
  /class="pkg-name">([^<]+)<[\s\S]*?class="pkg-price">\s*<span class="num">\s*([\d,]+)\s*<\/span>/g

function parseManwonPrices(pattern: RegExp) {
  const parsed: Array<{ name: string; manwon: number }> = []
  for (const match of OMO1_HTML.matchAll(pattern)) {
    parsed.push({ name: match[1].trim(), manwon: Number(match[2].replace(/,/g, "")) })
  }
  return parsed
}

describe("hardware catalog SSOT", () => {
  it("omo1 랜딩 HTML 을 파싱해 4개 가격이 카탈로그와 일치하는지 본다", () => {
    const singles = parseManwonPrices(SINGLE_ITEM_PATTERN)
    const packages = parseManwonPrices(PACKAGE_ITEM_PATTERN)

    // 파싱 자체가 깨지면(마크업 구조 변경) 여기서 먼저 실패해야 한다.
    expect(singles).toHaveLength(3)
    expect(packages).toHaveLength(1)

    const landingManwon = [...singles, ...packages].map((entry) => entry.manwon)
    expect(landingManwon).toEqual([540, 630, 120, 830])

    // 카탈로그 순서(75 → 86 → 카메라 → 패키지)와 랜딩 등장 순서가 같다는 전제까지 함께 고정한다.
    expect(HARDWARE_CATALOG).toHaveLength(4)
    expect(HARDWARE_CATALOG.map((item) => item.priceKrw)).toEqual(
      landingManwon.map((manwon) => manwon * 10_000)
    )
    for (const item of HARDWARE_CATALOG) {
      expect(item.priceKrw % 10_000).toBe(0)
    }
  })

  it("omo1 단품 이름도 카탈로그 이름과 같다", () => {
    const landingNames = parseManwonPrices(SINGLE_ITEM_PATTERN).map((entry) => entry.name)
    const catalogNames = HARDWARE_CATALOG.filter((item) => item.group === "single").map(
      (item) => item.name
    )
    expect(landingNames).toEqual(catalogNames)
  })

  it("omo1 의 도입 신청 CTA 가 패키지 구성을 실어 보낸다", () => {
    // 구성 없이 /checkout?type=hw 로만 보내면 빈 장바구니로 시작한다(P2-3 회귀).
    expect(OMO1_HTML).toContain("/checkout?type=hw&amp;sku=hw-package-ai-studio")
    expect(getHardwareItem("hw-package-ai-studio")).not.toBeNull()
  })

  it("sku 가 중복되지 않는다", () => {
    const skus = HARDWARE_CATALOG.map((item) => item.sku)
    expect(new Set(skus).size).toBe(skus.length)
  })

  it("getHardwareItem 은 미등록 sku 에 null 을 준다", () => {
    expect(getHardwareItem("hw-board-86")?.priceKrw).toBe(6_300_000)
    expect(getHardwareItem("hw-unknown")).toBeNull()
  })
})

describe("clampHardwareQty", () => {
  it("0~99 범위로 강제한다", () => {
    expect(clampHardwareQty(-3)).toBe(0)
    expect(clampHardwareQty(0)).toBe(0)
    expect(clampHardwareQty(7)).toBe(7)
    expect(clampHardwareQty(HARDWARE_QTY_MAX)).toBe(99)
    expect(clampHardwareQty(120)).toBe(99)
  })

  it("소수·NaN 을 흡수한다", () => {
    expect(clampHardwareQty(2.9)).toBe(2)
    expect(clampHardwareQty(Number.NaN)).toBe(0)
    expect(clampHardwareQty(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe("합계 계산", () => {
  it("빈 상태의 합계는 0 이다", () => {
    const quantities = createEmptyHardwareQuantities()
    expect(computeHardwareTotalKrw(quantities)).toBe(0)
    expect(countHardwareUnits(quantities)).toBe(0)
    expect(buildHardwareRequestItems(quantities)).toEqual([])
  })

  it("수량 × 단가를 합산한다", () => {
    const quantities = {
      "hw-board-86": 2,
      "hw-camera-t1": 3,
    }
    expect(computeHardwareTotalKrw(quantities)).toBe(6_300_000 * 2 + 1_200_000 * 3)
    expect(countHardwareUnits(quantities)).toBe(5)
  })

  it("범위 밖 수량도 clamp 한 뒤 합산한다", () => {
    expect(computeHardwareTotalKrw({ "hw-camera-t1": 500 })).toBe(1_200_000 * 99)
    expect(computeHardwareTotalKrw({ "hw-camera-t1": -4 })).toBe(0)
  })

  it("미등록 sku 는 합계와 라인에서 무시한다", () => {
    const quantities = { "hw-ghost-item": 9, "hw-board-75": 1 }
    expect(computeHardwareTotalKrw(quantities)).toBe(5_400_000)
    expect(buildHardwareRequestItems(quantities).map((line) => line.sku)).toEqual([
      "hw-board-75",
    ])
  })
})

describe("buildHardwareRequestItems", () => {
  it("수량 0 인 품목은 빼고 카탈로그 순서를 유지한다", () => {
    const items = buildHardwareRequestItems({
      "hw-package-ai-studio": 1,
      "hw-board-75": 2,
      "hw-camera-t1": 0,
    })

    expect(items).toEqual([
      {
        sku: "hw-board-75",
        name: '75" Classin 전자칠판',
        qty: 2,
        unitAmount: 5_400_000,
        currency: "KRW",
      },
      {
        sku: "hw-package-ai-studio",
        name: "올인원 녹화수업 세트 · Classin AI Studio",
        qty: 1,
        unitAmount: 8_300_000,
        currency: "KRW",
      },
    ])
  })

  it("라인 합계는 computeHardwareTotalKrw 와 일치한다", () => {
    const quantities = { "hw-board-86": 1, "hw-camera-t1": 2, "hw-package-ai-studio": 1 }
    const lineTotal = buildHardwareRequestItems(quantities).reduce(
      (sum, line) => sum + line.qty * line.unitAmount,
      0
    )
    expect(lineTotal).toBe(computeHardwareTotalKrw(quantities))
  })
})

describe("formatHardwareKrw", () => {
  it("만원이 아니라 원 단위 콤마로 표기한다", () => {
    expect(formatHardwareKrw(5_400_000)).toBe("₩5,400,000")
    expect(formatHardwareKrw(0)).toBe("₩0")
    expect(formatHardwareKrw(14_900_000)).toBe("₩14,900,000")
  })
})
