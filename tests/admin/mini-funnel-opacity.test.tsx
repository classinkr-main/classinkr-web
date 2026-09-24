import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  MINI_FUNNEL_MIN_OPACITY,
  MiniFunnel,
  miniFunnelBarOpacity,
  type FunnelStage,
} from "@/components/admin/viz/MiniFunnel"

// F9 — bar 변형의 단계별 불투명도 `1 - i*0.14`가 9단계에서 음수가 돼 막대가 사라지던 결함.
// 하한(0.35)에서 멈추는지를 순수 함수와 실제 정적 마크업 양쪽으로 고정한다.

function opacitiesOf(html: string): number[] {
  return Array.from(html.matchAll(/opacity:\s*([-\d.]+)/g)).map((match) => Number(match[1]))
}

describe("miniFunnelBarOpacity", () => {
  it("단계가 깊을수록 옅어지되 하한 아래로 내려가지 않는다", () => {
    expect(miniFunnelBarOpacity(0)).toBe(1)
    expect(miniFunnelBarOpacity(1)).toBe(0.86)
    expect(miniFunnelBarOpacity(4)).toBe(0.44)
    expect(miniFunnelBarOpacity(5)).toBe(MINI_FUNNEL_MIN_OPACITY)
    expect(miniFunnelBarOpacity(8)).toBe(MINI_FUNNEL_MIN_OPACITY)
    expect(miniFunnelBarOpacity(20)).toBe(MINI_FUNNEL_MIN_OPACITY)
  })

  it("단조 비증가다", () => {
    for (let i = 1; i < 12; i += 1) {
      expect(miniFunnelBarOpacity(i)).toBeLessThanOrEqual(miniFunnelBarOpacity(i - 1))
    }
  })
})

describe("MiniFunnel bar 변형 정적 마크업", () => {
  it("9단계에서도 모든 막대 불투명도가 하한 이상이다(음수·0 없음)", () => {
    const stages: FunnelStage[] = Array.from({ length: 9 }, (_, index) => ({
      label: `단계${index + 1}`,
      value: 900 - index * 90,
    }))
    const html = renderToStaticMarkup(<MiniFunnel stages={stages} />)
    const opacities = opacitiesOf(html)

    expect(opacities).toHaveLength(9)
    for (const value of opacities) {
      expect(value).toBeGreaterThanOrEqual(MINI_FUNNEL_MIN_OPACITY)
      expect(value).toBeLessThanOrEqual(1)
    }
    expect(opacities[0]).toBe(1)
    expect(opacities[8]).toBe(MINI_FUNNEL_MIN_OPACITY)
  })
})
