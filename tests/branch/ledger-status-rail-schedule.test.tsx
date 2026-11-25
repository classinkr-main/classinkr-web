import { describe, expect, it, vi } from "vitest"

// 장부 상태 줄(LedgerStatusRail) 동기화 칸의 일정 한 줄.
//  - F-47: 시각은 크론 일정 상수(lib/branch/sync/schedule.ts — vercel.json 과 schedule.test.ts 가 대조)에서 만든다.
//    예전 글자 "매일 17:38(KST)"는 실제 일정(09·13·17시 KST)과 달랐다.
//  - 시트 고정(revLockedDayLabel)이면 "REV는 12월 1일 기준 고정 · DSH·KPI·하드웨어는 매일 09·13·17시(KST) 자동 동기화".
// 동기화 칸 상세는 누른 뒤에만 펼쳐져서 helpers/hook-runner 의 미니 런타임으로 눌러 본다. 정합 체크·CRM 칸의 요청 훅은 끈다.

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>()
  const { hookImplsWithFallback } = await import("@/tests/branch/helpers/hook-runner")
  return { ...actual, ...hookImplsWithFallback(actual as unknown as Record<string, unknown>) }
})
vi.mock("@/components/admin/branch/IntegrityStrip", () => ({
  IntegrityDetail: () => null,
  useIntegrityData: () => ({ data: null, error: null, loading: true, actionable: [], warnCount: 0, errorCount: 0, total: 0, retry: () => {} }),
}))

import LedgerStatusRail, { ledgerSyncHealthyCopy, ledgerSyncScheduleCopy } from "@/components/admin/branch/ledger/LedgerStatusRail"
import { formatBranchSyncSchedule } from "@/lib/branch/sync/schedule"
import { formatLockDayLabel } from "@/lib/branch/rev-sheet-lock"
import { findElements, renderHook, textOf } from "@/tests/branch/helpers/hook-runner"

type RailProps = Parameters<typeof LedgerStatusRail>[0]

function railProps(props: Partial<RailProps> = {}): RailProps {
  return {
    syncHealth: undefined,
    lastSyncAttemptLabel: "3분 전",
    now: Date.parse("2026-11-25T03:00:00Z"),
    crmCoverage: { data: null, loading: false, error: null },
    refreshKey: 0,
    canRunAdminOperations: false,
    ...props,
  }
}

/** 동기화 칸을 눌러 펼친 뒤의 상세 글자. */
async function openSyncDetail(props: Partial<RailProps> = {}): Promise<string> {
  const view = renderHook(() => LedgerStatusRail(railProps(props)))
  const segments = findElements(view.current, (element) => element.type === "button" && element.props["aria-expanded"] !== undefined)
  expect(segments.length).toBeGreaterThan(0)
  ;(segments[0].props.onClick as () => void)()
  await view.settle(2)
  const detail = findElements(view.current, (element) => typeof element.props.id === "string" && element.props.className === "border-t border-[rgba(0,0,0,0.08)]")[0]
  view.unmount()
  return textOf(detail)
}

describe("F-47 — 일정 문구는 크론 상수에서", () => {
  it("고정 전: '매일 09·13·17시(KST) 자동 동기화, 2일 연속 실패 시 운영방 알림'", () => {
    expect(formatBranchSyncSchedule()).toBe("매일 09·13·17시(KST)")
    expect(ledgerSyncScheduleCopy()).toBe("매일 09·13·17시(KST) 자동 동기화, 2일 연속 실패 시 운영방 알림")
    expect(ledgerSyncScheduleCopy(null)).toBe(ledgerSyncScheduleCopy())
    expect(ledgerSyncScheduleCopy("  ")).toBe(ledgerSyncScheduleCopy())
    expect(ledgerSyncScheduleCopy()).not.toContain("17:38")
  })

  it("고정 뒤: 'REV는 12월 1일 기준 고정 · DSH·KPI·하드웨어는 매일 09·13·17시(KST) 자동 동기화'", () => {
    expect(ledgerSyncScheduleCopy(formatLockDayLabel("2026-12-01"))).toBe(
      "REV는 12월 1일 기준 고정 · DSH·KPI·하드웨어는 매일 09·13·17시(KST) 자동 동기화",
    )
  })

  it("정상 문구도 고정 뒤에는 이 칸이 보는 DSH·KPI 읽기를 말한다", () => {
    expect(ledgerSyncHealthyCopy()).toBe("매출 시트가 정상적으로 동기화되고 있습니다.")
    expect(ledgerSyncHealthyCopy("12월 1일")).toBe("KR Team 시트(DSH·KPI)가 정상적으로 동기화되고 있습니다.")
  })
})

describe("LedgerStatusRail — 동기화 칸 상세", () => {
  it("revLockedDayLabel 이 없으면 지금 그대로(일정만 실제 시각으로)", async () => {
    const text = await openSyncDetail()
    expect(text).toContain("매출 시트가 정상적으로 동기화되고 있습니다.")
    expect(text).toContain("마지막 시도 3분 전 · 매일 09·13·17시(KST) 자동 동기화, 2일 연속 실패 시 운영방 알림")
    expect(text).not.toContain("17:38")
    expect(text).not.toContain("기준 고정")
  })

  it("revLockedDayLabel 이 있으면 'REV는 12월 1일 기준 고정 · …' 일정 줄", async () => {
    const text = await openSyncDetail({ revLockedDayLabel: "12월 1일" })
    expect(text).toContain("KR Team 시트(DSH·KPI)가 정상적으로 동기화되고 있습니다.")
    expect(text).toContain("마지막 시도 3분 전 · REV는 12월 1일 기준 고정 · DSH·KPI·하드웨어는 매일 09·13·17시(KST) 자동 동기화")
    expect(text).not.toContain("운영방 알림")
  })
})
