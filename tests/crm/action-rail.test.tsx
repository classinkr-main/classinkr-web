import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import CrmActionRail from "@/components/admin/crm/rail/CrmActionRail"
import ActivityQuickForm from "@/components/admin/crm/rail/ActivityQuickForm"
import { MODE_FIELDS, MODE_OPTIONS, isActivityTargetType } from "@/components/admin/crm/rail/activity-contract"
import {
  activityDeepLink,
  isSnoozeResumed,
  rankRailTasks,
  taskDueLabel,
} from "@/components/admin/crm/rail/rail-utils"
import type { CrmTaskRecord } from "@/lib/repositories/crm-tasks"

const NOW = new Date("2026-07-11T05:00:00.000Z") // KST 2026-07-11 14:00

function makeTask(overrides: Partial<CrmTaskRecord> = {}): CrmTaskRecord {
  return {
    id: overrides.id ?? "t1",
    targetType: "lead",
    targetId: "lead-1",
    targetLabel: "테스트 학원",
    ownerKey: "owner-a",
    ownerNameSnapshot: "김지사",
    taskType: "call",
    title: "첫 응대 전화",
    detail: null,
    dueAt: null,
    snoozedUntil: null,
    priority: "normal",
    status: "open",
    sourceEventId: null,
    createdBy: "김지사",
    assignedBy: "김지사",
    completedAt: null,
    completedBy: null,
    outcome: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
    ...overrides,
  }
}

describe("rail-utils · rankRailTasks", () => {
  it("orders overdue → due-today → resumed-snooze → rest, and cuts at limit", () => {
    const overdue = makeTask({ id: "overdue", dueAt: "2026-07-10T01:00:00.000Z" })
    const dueToday = makeTask({ id: "today", dueAt: "2026-07-11T09:00:00.000Z" })
    const resumed = makeTask({ id: "resumed", status: "snoozed", snoozedUntil: "2026-07-11T00:00:00.000Z" })
    const plain = makeTask({ id: "plain", dueAt: "2026-07-20T00:00:00.000Z" })
    const noDue = makeTask({ id: "no-due" })

    const ranked = rankRailTasks([noDue, plain, resumed, dueToday, overdue], NOW, 4)
    expect(ranked.map((task) => task.id)).toEqual(["overdue", "today", "resumed", "plain"])
  })

  it("hides future-snoozed tasks (deliberately deferred) and non-active statuses", () => {
    const futureSnooze = makeTask({ id: "future", status: "snoozed", snoozedUntil: "2026-07-12T00:00:00.000Z" })
    const done = makeTask({ id: "done", status: "done" })
    const canceled = makeTask({ id: "canceled", status: "canceled" })
    const open = makeTask({ id: "open" })

    const ranked = rankRailTasks([futureSnooze, done, canceled, open], NOW)
    expect(ranked.map((task) => task.id)).toEqual(["open"])
  })

  it("breaks ties inside a group by priority then due date", () => {
    const urgentLater = makeTask({ id: "urgent", priority: "urgent", dueAt: "2026-07-19T00:00:00.000Z" })
    const normalSooner = makeTask({ id: "normal", priority: "normal", dueAt: "2026-07-13T00:00:00.000Z" })
    const highSoon = makeTask({ id: "high-soon", priority: "high", dueAt: "2026-07-13T00:00:00.000Z" })
    const highLater = makeTask({ id: "high-later", priority: "high", dueAt: "2026-07-18T00:00:00.000Z" })

    const ranked = rankRailTasks([normalSooner, highLater, urgentLater, highSoon], NOW)
    expect(ranked.map((task) => task.id)).toEqual(["urgent", "high-soon", "high-later", "normal"])
  })

  it("treats snoozed tasks without a resume date as resumed", () => {
    expect(isSnoozeResumed(makeTask({ status: "snoozed", snoozedUntil: null }), NOW)).toBe(true)
    expect(isSnoozeResumed(makeTask({ status: "snoozed", snoozedUntil: "2026-08-01T00:00:00.000Z" }), NOW)).toBe(false)
    expect(isSnoozeResumed(makeTask({ status: "open" }), NOW)).toBe(false)
  })
})

describe("rail-utils · taskDueLabel", () => {
  it("labels overdue / today / future / none with matching tones", () => {
    expect(taskDueLabel(makeTask({ dueAt: "2026-07-10T01:00:00.000Z" }), NOW).tone).toBe("danger")
    expect(taskDueLabel(makeTask({ dueAt: "2026-07-11T10:00:00.000Z" }), NOW)).toMatchObject({ tone: "caution" })
    expect(taskDueLabel(makeTask({ dueAt: "2026-07-20T00:00:00.000Z" }), NOW).tone).toBe("neutral")
    expect(taskDueLabel(makeTask({ dueAt: null }), NOW)).toEqual({ text: "기한 없음", tone: "neutral" })
  })

  it("uses 미루기 재개 wording for snoozed tasks", () => {
    const snoozed = taskDueLabel(
      makeTask({ status: "snoozed", snoozedUntil: "2026-07-12T00:00:00.000Z" }),
      NOW
    )
    expect(snoozed.text).toContain("재개")
    expect(snoozed.tone).toBe("caution")
  })
})

describe("rail-utils · activityDeepLink", () => {
  it("builds a target-scoped timeline link with type and label", () => {
    const href = activityDeepLink({ targetId: "acc 1", targetType: "neo_account", targetLabel: "테스트 학원" })
    expect(href.startsWith("/admin/crm/activity?")).toBe(true)
    expect(href).toContain("targetId=acc+1")
    expect(href).toContain("targetType=neo_account")
    // URLSearchParams는 공백을 +로 직렬화한다
    expect(href).toContain(`targetLabel=${encodeURIComponent("테스트 학원").replace(/%20/g, "+")}`)
  })

  it("drops unknown/all target types and falls back without targetId", () => {
    expect(activityDeepLink({ targetId: "x", targetType: "unknown" })).toBe("/admin/crm/activity?targetId=x")
    expect(activityDeepLink({ targetId: "" })).toBe("/admin/crm/activity")
    expect(activityDeepLink({ targetId: null })).toBe("/admin/crm/activity")
  })
})

describe("activity-contract", () => {
  it("keeps the mode-field SSOT contract for the five creation modes", () => {
    expect(MODE_OPTIONS.map((option) => option.key)).toEqual([
      "manual_note",
      "call",
      "sms",
      "meeting_minutes",
      "recording",
    ])
    expect(MODE_FIELDS.manual_note.primary).toEqual(["body"])
    // 콜/문자 — 간단 메모와 같은 컴팩트 계약(본문만 필수, 나머지는 상세 토글).
    expect(MODE_FIELDS.call.primary).toEqual(["body"])
    expect(MODE_FIELDS.sms.primary).toEqual(["body"])
    expect(MODE_FIELDS.call.advanced).toEqual(MODE_FIELDS.manual_note.advanced)
    expect(MODE_FIELDS.sms.advanced).toEqual(MODE_FIELDS.manual_note.advanced)
    expect(MODE_FIELDS.recording.primary).toEqual(["recording"])
    expect(MODE_FIELDS.meeting_minutes.advanced).toEqual([])
    // 회의록 모드는 다음 액션·단계 신호를 항상 노출한다(액션 누락 방지).
    expect(MODE_FIELDS.meeting_minutes.primary).toContain("nextAction")
    expect(MODE_FIELDS.meeting_minutes.primary).toContain("stageSignal")
  })

  it("validates activity target types against the shared option list", () => {
    expect(isActivityTargetType("neo_account")).toBe(true)
    expect(isActivityTargetType("all")).toBe(false)
    expect(isActivityTargetType("bogus")).toBe(false)
  })
})

describe("CrmActionRail (static render)", () => {
  it("renders the three sections with an independent sticky scroll shell", () => {
    const html = renderToStaticMarkup(<CrmActionRail />)
    expect(html).toContain("기록 빠른 생성")
    expect(html).toContain("오늘 할 일")
    expect(html).toContain("최근 기록")
    // 독립 스크롤 레일: sticky + max-h + overflow-y-auto (xl 전용)
    expect(html).toContain("xl:sticky")
    expect(html).toContain("xl:max-h-[calc(100dvh-3rem)]")
    expect(html).toContain("xl:overflow-y-auto")
    // 미루기 용어(스누즈 아님) — 기준 캡션에 노출
    expect(html).toContain("미루기")
    expect(html).not.toContain("스누즈")
  })

  it("pre-labels the quick form with the preselected customer", () => {
    const html = renderToStaticMarkup(
      <CrmActionRail defaultTargetType="neo_account" defaultTargetId="acc-1" customerName="테스트 학원" />
    )
    expect(html).toContain("테스트 학원 대상으로 저장")
    // CrmCustomerPicker가 연결됨 배지를 보여준다(linkedId 프리셀렉트)
    expect(html).toContain("연결됨")
  })

  it("drops the quick-form card with hideForm while keeping tasks and recent sections", () => {
    const html = renderToStaticMarkup(<CrmActionRail hideForm />)
    expect(html).not.toContain("기록 빠른 생성")
    expect(html).toContain("오늘 할 일")
    expect(html).toContain("최근 기록")
  })

  // CRM 홈은 본문 주간 조망(CrmWeekAheadPanel)이 같은 crm_tasks를 상위집합으로 다뤄
  // 레일의 '오늘 할 일'을 끈다 — 폼·최근 기록은 그대로 남아야 한다.
  it("drops the tasks card with hideTasks while keeping form and recent sections", () => {
    const html = renderToStaticMarkup(<CrmActionRail hideTasks />)
    expect(html).not.toContain("오늘 할 일")
    expect(html).toContain("기록 빠른 생성")
    expect(html).toContain("최근 기록")
  })

  it("can drop both optional cards at once", () => {
    const html = renderToStaticMarkup(<CrmActionRail hideForm hideTasks />)
    expect(html).not.toContain("기록 빠른 생성")
    expect(html).not.toContain("오늘 할 일")
    expect(html).toContain("최근 기록")
  })
})

describe("ActivityQuickForm (static render)", () => {
  it("keeps the API-contract fields visible in compact mode", () => {
    const html = renderToStaticMarkup(<ActivityQuickForm compact />)
    expect(html).toContain("간단 메모")
    expect(html).toContain("콜")
    expect(html).toContain("문자")
    expect(html).toContain("회의록")
    expect(html).toContain("녹음")
    expect(html).toContain("기록 시각")
    expect(html).toContain("한 줄 요약")
    expect(html).toContain("원문 메모 / 회의록")
    expect(html).toContain("저장")
  })

  it("presets the linked target from props", () => {
    const html = renderToStaticMarkup(
      <ActivityQuickForm compact defaultTargetType="lead" defaultTargetId="lead-9" defaultTargetLabel="프리셋 학원" />
    )
    expect(html).toContain("프리셋 학원")
    expect(html).toContain("연결됨")
  })

  it("renders the one-line composer variant with body-first placeholder and detail toggle", () => {
    const html = renderToStaticMarkup(<ActivityQuickForm variant="composer" />)
    expect(html).toContain("무슨 일이 있었나요? (본문만 적어도 저장됩니다)")
    expect(html).toContain("+ 상세 (제목·다음 액션 등)")
    expect(html).toContain("저장")
    // 한 줄 컴포저는 full/compact 필드 스택을 접어둔다
    expect(html).not.toContain("기록 시각")
  })

  it("hides the target picker in composer when lockTarget is set", () => {
    const withPicker = renderToStaticMarkup(<ActivityQuickForm variant="composer" />)
    const locked = renderToStaticMarkup(
      <ActivityQuickForm variant="composer" lockTarget defaultTargetType="lead" defaultTargetId="lead-9" defaultTargetLabel="프리셋 학원" />
    )
    expect(withPicker).toContain("고객/리드 검색 또는 직접 입력")
    expect(locked).not.toContain("고객/리드 검색 또는 직접 입력")
    // 고정 대상 라벨은 placeholder로 노출된다
    expect(locked).toContain("프리셋 학원 기록 남기기")
  })
})
