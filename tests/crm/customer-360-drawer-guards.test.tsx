import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import Customer360Drawer, {
  buildDerivedSummary,
  buildDrawerHealthInput,
  isDrawerFormDirty,
} from "@/components/admin/crm/Customer360Drawer"
import { isActivityFormDirty } from "@/components/admin/crm/rail/ActivityQuickForm"
import { computeCustomerHealth } from "@/lib/crm/customer-health"
import type { Customer360 } from "@/lib/repositories/crm-customer-360"

function make360(overrides: Partial<Customer360> = {}): Customer360 {
  return {
    generatedAt: "2026-09-15T03:02:00.000Z",
    key: "neo:acc-1",
    source: "neo_account",
    entityId: "acc-1",
    found: true,
    health: { ok: true, warnings: [] },
    header: {
      key: "neo:acc-1",
      source: "neo_account",
      sourceLabel: "NEO 고객",
      name: "테스트 학원",
      statusLabel: "활성",
      ownerName: "김담당",
      ownerKeys: ["kim"],
      region: "강남",
      score: null,
      priorityReason: null,
      nextActionLabel: null,
      createdAt: null,
      updatedAt: null,
    },
    contacts: null,
    money: {
      available: true,
      label: null,
      totalBalance: 1_500,
      totalOrderAmount: null,
      orders: [],
      collections: [],
      performances: [],
      eeoAccounts: [],
    },
    risk: { severity: "low", reasons: [], overdueTaskCount: 0, riskEventCount: 0, nearestExpireAt: null, totalBalance: 1_500 },
    serviceRisk: null,
    ...overrides,
  } as unknown as Customer360
}

// c360-04 — 같은 NEO 잔액이 요약에선 '미수'(부정), 서비스 위험에선 '충전 잔액'(긍정)으로 반대로 읽히고
// 건강도까지 12점 깎이던 결함. 잔액이 많을수록 실제 서비스 위험은 낮다.
describe("c360-04 충전 잔액 의미", () => {
  it("요약 문장은 '충전 잔액 ¥…'으로 적고 '미수'라는 말을 쓰지 않는다", () => {
    const summary = buildDerivedSummary(make360(), "neo_account")
    expect(summary).toContain("충전 잔액")
    expect(summary).toContain("1,500")
    expect(summary).not.toContain("미수")
  })

  it("건강도 입력의 hasOutstanding은 잔액과 무관하게 null이라 감점되지 않는다", () => {
    const input = buildDrawerHealthInput(make360(), null)
    expect(input.hasOutstanding).toBeNull()
    expect(computeCustomerHealth(input).score).toBe(100)
    // 잔액 0(소진)이어도 여기서 '미수'를 지어내지 않는다 — 소진 신호 승격은 별도 변경.
    const depleted = buildDrawerHealthInput(make360({ money: { ...make360().money, totalBalance: 0 } }), null)
    expect(depleted.hasOutstanding).toBeNull()
  })
})

// c360-05 — 닫기 가드가 컴포저 본문·제목만 보던 것을 할 일/딜/라벨 입력과 컴포저 상세 필드까지 넓혔다.
describe("c360-05 닫기 가드 dirty 집합", () => {
  const clean = {
    composerDirty: false,
    taskFormOpen: false,
    taskTitle: "",
    taskDue: "",
    dealFormOpen: false,
    dealTitle: "",
    dealAmount: null,
    tagInput: "",
  }

  it("드로어: 열린 할 일/딜 폼의 입력·라벨 입력이 있으면 dirty, 닫힌 폼의 잔여값은 무시", () => {
    expect(isDrawerFormDirty(clean)).toBe(false)
    expect(isDrawerFormDirty({ ...clean, composerDirty: true })).toBe(true)
    expect(isDrawerFormDirty({ ...clean, taskFormOpen: true, taskTitle: "  전화 " })).toBe(true)
    expect(isDrawerFormDirty({ ...clean, taskFormOpen: true, taskDue: "2026-09-20" })).toBe(true)
    expect(isDrawerFormDirty({ ...clean, taskFormOpen: false, taskTitle: "남은 값" })).toBe(false)
    expect(isDrawerFormDirty({ ...clean, dealFormOpen: true, dealAmount: 100 })).toBe(true)
    expect(isDrawerFormDirty({ ...clean, dealFormOpen: true, dealTitle: "   " })).toBe(false)
    expect(isDrawerFormDirty({ ...clean, tagInput: " VIP " })).toBe(true)
  })

  it("컴포저: 제출 허용 집합(제목·요약·본문·다음 액션·녹음)과 상세 서술 필드가 모두 dirty로 잡힌다", () => {
    const empty = {
      body: "",
      title: "",
      summary: "",
      nextActionTitle: "",
      decisions: "",
      blockers: "",
      attendees: "",
      meetingPurpose: "",
      recordingName: null,
    }
    expect(isActivityFormDirty(empty)).toBe(false)
    for (const key of ["body", "title", "summary", "nextActionTitle", "decisions", "blockers", "attendees", "meetingPurpose"] as const) {
      expect(isActivityFormDirty({ ...empty, [key]: "x" })).toBe(true)
      expect(isActivityFormDirty({ ...empty, [key]: "   " })).toBe(false)
    }
    expect(isActivityFormDirty({ ...empty, recordingName: "call.m4a" })).toBe(true)
  })
})

describe("Customer360Drawer 정적 마크업 계약", () => {
  it("기준 시각 캡션·저장 토스트 aria-live 영역이 항상 마운트되고, 은퇴한 #B85C33 리터럴이 없다", () => {
    const html = renderToStaticMarkup(
      <Customer360Drawer customerKey="lead:lead-9" name="프리셋 학원" onClose={() => undefined} />
    )
    expect(html).toContain('data-testid="c360-basis-caption"')
    expect(html).not.toContain("#B85C33")
    // 성공 토스트 영역은 메시지가 없어도 마운트돼 있어 상태 전이가 통지된다(UX 규약 7).
    expect((html.match(/aria-live="polite"/g) ?? []).length).toBeGreaterThanOrEqual(2)
    // 닫기 확인은 열리기 전엔 그리지 않는다.
    expect(html).not.toContain("버리고 닫기")
  })
})
