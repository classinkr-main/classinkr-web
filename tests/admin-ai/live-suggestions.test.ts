// 서버 1단계 검토(2026-11) 동작-5·안전-4 재현 시험 — 실제 모드 첫 화면 추천은 실제로 되는 일만, 기관 이름 없이.
import { describe, expect, it, vi } from "vitest"

import { routeMessage } from "@/lib/admin-ai/server/router"
import { homeSuggestions } from "@/lib/admin-ai/suggestions"

const PATHS = ["/admin", "/admin/overview", "/admin/hardware", "/admin/quotes", "/admin/crm/deals", "/admin/crm/customers/unified"]
/** 시안 시나리오의 표본 기관 이름 — 실제 모드 문장에 들어가면 같은 이름의 실제 고객을 찾는다. */
const SAMPLE_ORG = /가온학원|한빛수학학원|도담영어|새움에듀|학원/

function liveItems() {
  return PATHS.flatMap((path) => {
    const { screen, ask } = homeSuggestions(path, "live")
    return [...screen, ...ask]
  })
}

describe("실제 모드 첫 화면 추천", () => {
  it("추천 문장에 표본 기관 이름이 없고 시나리오 키도 없다", () => {
    for (const item of liveItems()) {
      expect(item.text, item.label).not.toMatch(SAMPLE_ORG)
      expect(item.scenario, item.label).toBeUndefined()
    }
  })

  it("추천 문장은 모두 서버가 실제로 하는 갈래로 간다(준비 중 거절·되묻기·모름 없음)", () => {
    for (const item of liveItems()) {
      const decisions = routeMessage(item.text)
      expect(decisions, item.text).toHaveLength(1)
      const [decision] = decisions
      expect(decision.clarify, item.text).toBeUndefined()
      expect(decision.branch, item.text).not.toBe("unknown")
      if (decision.branch === "write") expect(["quote_draft", "hw_plan"], item.text).toContain(decision.write)
      if (decision.branch === "read") expect(decision.read?.kind, item.text).toBe("tool")
    }
  })

  it("시안 모드는 지금처럼 시나리오 문장을 보낸다", () => {
    const { screen } = homeSuggestions("/admin/hardware", "demo")
    expect(screen[0].scenario).toBe("stock")
  })
})

describe("사이드바 AI 올인원 배지(안전-4)", () => {
  it("시안 모드는 '시안' 배지, 실제 모드는 배지 없음", async () => {
    vi.resetModules()
    vi.stubEnv("NEXT_PUBLIC_ADMIN_AI_LIVE", "")
    vi.stubEnv("NEXT_PUBLIC_ADMIN_AI_PREVIEW", "1")
    const demo = (await import("@/components/admin/admin-nav")).ADMIN_NAV.find((item) => item.href === "/admin/ai")
    expect(demo?.badge).toBe("시안")
    vi.resetModules()
    vi.stubEnv("NEXT_PUBLIC_ADMIN_AI_LIVE", "1")
    const live = (await import("@/components/admin/admin-nav")).ADMIN_NAV.find((item) => item.href === "/admin/ai")
    expect(live).toBeDefined()
    expect(live?.badge).toBeUndefined()
    vi.unstubAllEnvs()
    vi.resetModules()
  })
})
