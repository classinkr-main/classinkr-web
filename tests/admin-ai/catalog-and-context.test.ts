import { describe, expect, it } from "vitest"

import {
  DEFAULT_LAUNCHER_BOTTOM,
  resolveLauncherBottom,
} from "@/components/admin/ai/floating-slots"
import { describeAdminPath, isAdminAiWidgetHidden } from "@/components/admin/ai/page-context"
import { buildDemoTurn, matchDemoScenario } from "@/lib/admin-ai/demo-scenarios"
import { formatAmountDelta, formatClock } from "@/lib/admin-ai/format"
import { FORBIDDEN_ORDER_LABELS, ORDER_CATALOG } from "@/lib/admin-ai/order-catalog"
import { resolveAdminAiSuggestions } from "@/lib/admin-ai/suggestions"

describe("오더 카탈로그 — 기획 §4 등급 계약", () => {
  it("오더 id 는 겹치지 않는다", () => {
    const ids = ORDER_CATALOG.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("금지(R4) 오더는 카탈로그에 실행 항목으로 들어가지 않는다", () => {
    expect(ORDER_CATALOG.some((entry) => entry.risk === "R4")).toBe(false)
    expect(FORBIDDEN_ORDER_LABELS).toContain("삭제")
    expect(FORBIDDEN_ORDER_LABELS).toContain("입출고 취소")
  })

  // 2026-09-28 결정 — 세 오더는 R4 가 아니라 R2 민감 변경이다.
  it("결제 확정 · 입출고 확정 · 금액 변경은 R2 민감 변경이다", () => {
    for (const id of ["payment.confirm", "hardware.movement.finalize", "quote.amount.update"]) {
      const entry = ORDER_CATALOG.find((item) => item.id === id)
      expect(entry, id).toMatchObject({ risk: "R2", sensitive: true })
      expect(entry?.roles, id).toContain("권한")
    }
  })

  it("조회(R0)는 확인 절차가 없다", () => {
    for (const entry of ORDER_CATALOG.filter((item) => item.risk === "R0")) {
      expect(entry.confirm, entry.id).toBe("없음")
    }
  })
})

describe("시안 시나리오", () => {
  it("삭제 요청은 다른 낱말이 섞여도 거절로 간다", () => {
    expect(matchDemoScenario("가온학원 기록 삭제해 줘")).toBe("delete")
    expect(matchDemoScenario("이 견적 지워")).toBe("delete")
  })

  it("모르는 말은 시나리오를 고르지 않는다", () => {
    expect(matchDemoScenario("안녕")).toBeNull()
    expect(matchDemoScenario("   ")).toBeNull()
  })

  it("거절·조회 시나리오는 오더 티켓을 만들지 않는다", () => {
    for (const key of ["delete", "stock", "summary", "today", "which"] as const) {
      expect(buildDemoTurn(key, { now: 1, orderId: "x" }).order, key).toBeUndefined()
    }
  })

  it("민감 변경 시나리오는 권한 이름을 달고 나온다", () => {
    for (const key of ["pay", "ship", "amount"] as const) {
      const { order } = buildDemoTurn(key, { now: 1, orderId: "x" })
      expect(order, key).toMatchObject({ risk: "R2", sensitive: true })
      expect(order?.capabilityLabel, key).toBeTruthy()
    }
  })

  it("금액이 있는 오더는 통화를 붙인다", () => {
    expect(buildDemoTurn("pay", { now: 1, orderId: "x" }).order?.amount?.currency).toBe("KRW")
    expect(buildDemoTurn("amount", { now: 1, orderId: "x" }).order?.amount?.currency).toBe("KRW")
  })

  // 카드에서 값을 고친 것이 시나리오 상수로 새면 다음 오더가 오염된다.
  it("오더마다 값을 따로 가진다", () => {
    const first = buildDemoTurn("task", { now: 1, orderId: "a" }).order
    const second = buildDemoTurn("task", { now: 1, orderId: "b" }).order
    expect(first?.fields).not.toBe(second?.fields)
    expect(first?.fields[0]).not.toBe(second?.fields[0])
  })
})

describe("표시 형식", () => {
  it("남은 시간은 올림해서 보인다", () => {
    expect(formatClock(15 * 60_000 - 1)).toBe("15:00")
    expect(formatClock(61_000)).toBe("1:01")
    expect(formatClock(400)).toBe("0:01")
    expect(formatClock(-5)).toBe("0:00")
  })

  it("금액 차이는 부호와 변동률을 함께 보인다", () => {
    expect(
      formatAmountDelta({ label: "합계", currency: "KRW", previous: 38_000_000, value: 34_200_000 })
    ).toBe("−3,800,000 (−10%)")
    expect(formatAmountDelta({ label: "합계", currency: "KRW", value: 1 })).toBeNull()
  })
})

describe("화면 맥락과 버튼 자리", () => {
  it("경로를 nav 의 화면 이름으로 바꾼다", () => {
    expect(describeAdminPath("/admin/crm/customers/unified")).toBe("CRM › 고객DB")
    expect(describeAdminPath("/admin/hardware")).toBe("하드웨어 재고")
    // 흡수된 자식 라우트는 부모 화면 이름을 쓴다.
    expect(describeAdminPath("/admin/cs-chatbot")).toBe("CS 콘솔")
    expect(describeAdminPath("/somewhere-else")).toBe("어드민")
  })

  it("AI 올인원 탭과 로그인에서는 위젯을 띄우지 않는다", () => {
    expect(isAdminAiWidgetHidden("/admin/ai")).toBe(true)
    expect(isAdminAiWidgetHidden("/admin/login")).toBe(true)
    expect(isAdminAiWidgetHidden("/admin/crm")).toBe(false)
    // "/admin/ai" 로 시작만 하는 다른 경로를 잘못 숨기지 않는다.
    expect(isAdminAiWidgetHidden("/admin/airport")).toBe(false)
  })

  it("우하단을 이미 쓰는 화면에서는 버튼이 위로 올라간다", () => {
    expect(resolveLauncherBottom("/admin/crm")).toBe(DEFAULT_LAUNCHER_BOTTOM)
    expect(resolveLauncherBottom("/admin/hardware")).toBeGreaterThan(DEFAULT_LAUNCHER_BOTTOM)
    expect(resolveLauncherBottom("/admin/branch/ledger")).toBeGreaterThan(DEFAULT_LAUNCHER_BOTTOM)
    expect(resolveLauncherBottom("/admin/branch")).toBe(DEFAULT_LAUNCHER_BOTTOM)
  })

  it("화면별 추천은 가장 길게 맞는 경로를 따른다", () => {
    expect(resolveAdminAiSuggestions("/admin/crm/customers/unified")[0].scenario).toBe("task")
    expect(resolveAdminAiSuggestions("/admin/hardware")[0].scenario).toBe("stock")
    expect(resolveAdminAiSuggestions("/admin/overview")).toHaveLength(3)
  })
})
