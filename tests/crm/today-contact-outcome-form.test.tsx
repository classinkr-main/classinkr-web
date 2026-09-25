import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import TodayContactOutcomeForm, {
  applyOutcomeChannel,
  applyOutcomeResult,
  buildTodayContactOutcomeRequest,
  buildTodayContactSnoozeRequest,
  createOutcomeDraft,
  defaultOutcomeNextTitle,
  earliestOutcomeDateKey,
  formatOutcomeSummary,
  isOutcomeDraftDirty,
  isOutcomeDraftReady,
  kstDateKey,
  kstDateKeyToDueAt,
  outcomeDateProblem,
  outcomeNextAt,
  outcomeNextSchedule,
  outcomeTargetFor,
  resolveNextPresetAt,
  suggestNextForResult,
} from "@/components/admin/crm/home/TodayContactOutcomeForm"
import type { TodayContactReason, TodayContactRow } from "@/lib/crm/today-contact-types"

// 현황 "오늘 연락" 행 안 결과 폼(C안 ①) — 옛 CrmPriorityQueuePanel 리드 폼을 추출·일반화한 것.
// jsdom 이 없어 순수 헬퍼 + renderToStaticMarkup 으로 고정한다.

const NOW = Date.parse("2026-09-25T03:00:00.000Z") // 2026-09-25(금) 12:00 KST

function reason(overrides: Partial<TodayContactReason> = {}): TodayContactReason {
  return { kind: "account_expiry", label: "만료 D-5", detail: null, dueAt: null, overdue: false, sourceRef: "neo:acc-1", ...overrides }
}

function row(overrides: Partial<TodayContactRow> = {}): TodayContactRow {
  return {
    key: "neo:acc-1",
    entityType: "neo_account",
    entityId: "acc-1",
    title: "청담 브릿지영어",
    subtitle: null,
    ownerName: "박지훈",
    ownerKeys: ["박지훈"],
    lane: "money",
    laneLabel: "돈 임박",
    severity: "high",
    score: 70,
    reasons: [reason()],
    dueAt: null,
    overdue: false,
    groupedCount: 1,
    isMetaLead: false,
    lastContact: null,
    nextContact: null,
    compass: null,
    primaryAction: "record_outcome",
    openTaskIds: [],
    handled: null,
    href: "/admin/crm/customers/unified?key=neo%3Aacc-1",
    neoAsOf: "2026-08-28T00:00:00.000Z",
    ...overrides,
  }
}

describe("결과 초안 규칙", () => {
  it("기본 초안은 콜 · 결과 미선택 · 내일 09:00 · 할 일 함께 완료", () => {
    const draft = createOutcomeDraft("neo:acc-1")
    expect(draft).toMatchObject({ channel: "call", result: null, next: "tomorrow_9", closeTasks: true, memo: "" })
    expect(isOutcomeDraftDirty(draft)).toBe(false)
    expect(isOutcomeDraftDirty(null)).toBe(false)
    expect(isOutcomeDraftDirty({ ...draft, memo: " 메모 " })).toBe(true)
    expect(isOutcomeDraftDirty({ ...draft, result: "no_answer" })).toBe(true)
    expect(isOutcomeDraftDirty({ ...draft, next: "none" })).toBe(true)
  })

  it("콜·문자는 결과를 골라야 저장된다 — 기본값 '연결됨'으로 응대 통계가 부풀지 않게", () => {
    const draft = createOutcomeDraft("k")
    expect(isOutcomeDraftReady(draft, NOW)).toBe(false)
    expect(isOutcomeDraftReady({ ...draft, result: "answered" }, NOW)).toBe(true)
    // 카톡·이메일은 결과가 없다 — 바꾸면 결과를 비우고 바로 저장 가능
    const kakao = applyOutcomeChannel({ ...draft, result: "no_answer" }, "kakao")
    expect(kakao.result).toBeNull()
    expect(isOutcomeDraftReady(kakao, NOW)).toBe(true)
  })

  it("결과를 고르면 다음 일정이 추천값을 따라가고, 직접 고른 뒤에는 따라가지 않는다", () => {
    expect(suggestNextForResult("no_answer")).toBe("tomorrow_9")
    expect(suggestNextForResult("callback")).toBe("tomorrow_9")
    expect(suggestNextForResult("answered")).toBe("in3_10")
    expect(suggestNextForResult("meeting_set")).toBe("none")
    const draft = createOutcomeDraft("k")
    expect(applyOutcomeResult(draft, "answered").next).toBe("in3_10")
    const touched = { ...draft, next: "next_monday_10" as const, nextTouched: true }
    expect(applyOutcomeResult(touched, "answered").next).toBe("next_monday_10")
  })

  it("'날짜'는 오늘 이후의 유효한 날짜여야 한다(그날 10:00 KST)", () => {
    const draft = { ...createOutcomeDraft("k"), result: "answered" as const, next: "date" as const }
    expect(isOutcomeDraftReady({ ...draft, nextDate: "" }, NOW)).toBe(false)
    expect(isOutcomeDraftReady({ ...draft, nextDate: "2026-09-24" }, NOW)).toBe(false)
    expect(isOutcomeDraftReady({ ...draft, nextDate: "2026-02-30" }, NOW)).toBe(false)
    expect(isOutcomeDraftReady({ ...draft, nextDate: "2026-09-30" }, NOW)).toBe(true)
    expect(kstDateKeyToDueAt("2026-09-30")).toBe("2026-09-30T01:00:00.000Z")
    expect(kstDateKey(NOW)).toBe("2026-09-25")
  })

  it("'날짜'로 오늘을 골라도 그날 10:00 KST 가 지났으면 저장을 막는다(서버는 지난 시각을 400 으로 거절)", () => {
    const draft = { ...createOutcomeDraft("k"), result: "answered" as const, next: "date" as const, nextDate: "2026-09-25" }
    const at0900 = Date.parse("2026-09-25T00:00:00.000Z") // 09:00 KST — 오늘 10:00 은 아직 미래
    const at1000 = Date.parse("2026-09-25T01:00:00.000Z") // 정확히 10:00 KST — 이미 지난 것으로 본다
    const at1500 = Date.parse("2026-09-25T06:00:00.000Z") // 15:00 KST(리뷰 시나리오)
    expect(isOutcomeDraftReady(draft, at0900)).toBe(true)
    expect(outcomeDateProblem(draft, at0900)).toBeNull()
    expect(isOutcomeDraftReady(draft, at1000)).toBe(false)
    expect(isOutcomeDraftReady(draft, NOW)).toBe(false)
    expect(isOutcomeDraftReady(draft, at1500)).toBe(false)
    expect(outcomeDateProblem(draft, at1500)).toBe("past")
    expect(outcomeDateProblem({ ...draft, nextDate: "" }, at1500)).toBe("missing")
    expect(outcomeDateProblem({ ...draft, next: "tomorrow_9" }, at1500)).toBeNull()
    // 날짜 입력의 min — 오늘 10:00 전이면 오늘, 지났으면 내일
    expect(earliestOutcomeDateKey(at0900)).toBe("2026-09-25")
    expect(earliestOutcomeDateKey(at1000)).toBe("2026-09-26")
    expect(earliestOutcomeDateKey(at1500)).toBe("2026-09-26")
    // KST 자정 직전(23:59) → 내일 키는 다음 달력일
    expect(earliestOutcomeDateKey(Date.parse("2026-09-30T14:59:00.000Z"))).toBe("2026-10-01")
  })
})

describe("다음 일정 프리셋(KST, 영업일 보정 없음)", () => {
  it("내일 09:00 · 3일 뒤 10:00 · 다음 주 월 10:00", () => {
    expect(resolveNextPresetAt("tomorrow_9", NOW)).toBe("2026-09-26T00:00:00.000Z")
    expect(resolveNextPresetAt("in3_10", NOW)).toBe("2026-09-28T01:00:00.000Z")
    expect(resolveNextPresetAt("next_monday_10", NOW)).toBe("2026-09-28T01:00:00.000Z")
    // 월요일이면 다음 주 월요일(+7)
    const monday = Date.parse("2026-09-28T03:00:00.000Z")
    expect(resolveNextPresetAt("next_monday_10", monday)).toBe("2026-10-05T01:00:00.000Z")
    // KST 자정 직후(UTC 전날)도 KST 날짜 기준
    const kstEarly = Date.parse("2026-09-25T15:30:00.000Z") // 09-26 00:30 KST
    expect(resolveNextPresetAt("tomorrow_9", kstEarly)).toBe("2026-09-27T00:00:00.000Z")
  })

  it("초안 → 요청 계약 값: 프리셋·날짜·없음", () => {
    expect(outcomeNextSchedule({ next: "tomorrow_9", nextDate: "" })).toEqual({ preset: "tomorrow_9" })
    expect(outcomeNextSchedule({ next: "date", nextDate: "2026-09-30" })).toEqual({ dueAt: "2026-09-30T01:00:00.000Z" })
    expect(outcomeNextSchedule({ next: "none", nextDate: "" })).toBeNull()
    expect(outcomeNextAt({ next: "in3_10", nextDate: "" }, NOW)).toBe("2026-09-28T01:00:00.000Z")
  })
})

describe("결과 요청 조립", () => {
  it("대상 — NEO·고객·딜은 record_outcome, Compass 없는 리드는 record_outcome_lead, Compass·할 일 행은 쓰지 않는다", () => {
    expect(outcomeTargetFor(row())).toEqual({ type: "neo_account", id: "acc-1", label: "청담 브릿지영어" })
    expect(outcomeTargetFor(row({ entityType: "lead", entityId: "L1", key: "lead:L1", primaryAction: "record_outcome_lead" }))).toEqual({
      type: "lead",
      id: "L1",
      label: "청담 브릿지영어",
    })
    expect(outcomeTargetFor(row({ entityType: "lead", primaryAction: "open_compass" }))).toBeNull()
    expect(outcomeTargetFor(row({ entityType: "compass_lead", primaryAction: "open_compass" }))).toBeNull()
    expect(outcomeTargetFor(row({ entityType: "task", primaryAction: "complete_task" }))).toBeNull()
  })

  it("NEO 계정: 채널·결과·메모·다음 일정·사유 기반 제목·열린 할 일(≤10) 함께 완료", () => {
    const draft = {
      ...createOutcomeDraft("neo:acc-1"),
      result: "no_answer" as const,
      memo: "  원장 부재, 오후 재통화  ",
    }
    const request = buildTodayContactOutcomeRequest({
      row: row({ openTaskIds: Array.from({ length: 12 }, (_, i) => `t${i}`) }),
      draft,
      requestId: "req-1",
      nowMs: NOW,
    })
    expect(request).toEqual({
      requestId: "req-1",
      mode: "contact",
      target: { type: "neo_account", id: "acc-1", label: "청담 브릿지영어" },
      channel: "call",
      result: "no_answer",
      next: { preset: "tomorrow_9" },
      memo: "원장 부재, 오후 재통화",
      nextTitle: "연장 제안 후속",
      closeTaskIds: ["t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9"],
    })
  })

  it("카톡·이메일은 결과를 싣지 않고, 할 일 함께 완료를 끄면 closeTaskIds 가 없다", () => {
    const draft = { ...applyOutcomeChannel(createOutcomeDraft("k"), "email"), closeTasks: false }
    const request = buildTodayContactOutcomeRequest({ row: row({ openTaskIds: ["t1"] }), draft, requestId: "r", nowMs: NOW })
    expect(request?.result).toBeNull()
    expect(request?.closeTaskIds).toBeUndefined()
    expect(request?.memo).toBeUndefined()
  })

  it("리드는 다음 일정 제목을 보내지 않는다(서버가 follow_up_at 만 바꾼다) · '없음'은 next null", () => {
    const leadRow = row({ entityType: "lead", entityId: "L1", key: "lead:L1", primaryAction: "record_outcome_lead" })
    const draft = { ...createOutcomeDraft("lead:L1"), result: "answered" as const, next: "none" as const }
    const request = buildTodayContactOutcomeRequest({ row: leadRow, draft, requestId: "r", nowMs: NOW })
    expect(request?.target.type).toBe("lead")
    expect(request?.next).toBeNull()
    expect(request?.nextTitle).toBeUndefined()
  })

  it("미루기 — 기록 없이 내일 09:00(snooze)", () => {
    expect(buildTodayContactSnoozeRequest({ row: row({ reasons: [reason({ kind: "account_balance", label: "잔액 소진 5일" })] }), requestId: "s", nowMs: NOW })).toEqual({
      requestId: "s",
      mode: "snooze",
      target: { type: "neo_account", id: "acc-1", label: "청담 브릿지영어" },
      next: { preset: "tomorrow_9" },
      nextTitle: "재충전 안내 후속",
    })
    expect(buildTodayContactSnoozeRequest({ row: row({ primaryAction: "open_compass" }), requestId: "s", nowMs: NOW })).toBeNull()
  })

  it("NEO 다음 일정 기본 제목 — 만료 회복·연장·재충전·그 외 재연락", () => {
    expect(defaultOutcomeNextTitle({ reasons: [reason({ dueAt: "2026-09-10T00:00:00.000Z" })] }, NOW)).toBe("만료 회복 연락")
    expect(defaultOutcomeNextTitle({ reasons: [reason({ label: "만료 회복 · 20일" })] }, NOW)).toBe("만료 회복 연락")
    expect(defaultOutcomeNextTitle({ reasons: [reason({ dueAt: "2026-09-30T00:00:00.000Z" })] }, NOW)).toBe("연장 제안 후속")
    expect(defaultOutcomeNextTitle({ reasons: [reason({ kind: "account_balance" })] }, NOW)).toBe("재충전 안내 후속")
    expect(defaultOutcomeNextTitle({ reasons: [reason({ kind: "task" })] }, NOW)).toBe("재연락")
  })

  it("처리됨 접힘 요약 — '콜 · 부재 → 다음 09/26'", () => {
    expect(formatOutcomeSummary({ channel: "call", result: "no_answer" }, "2026-09-26T00:00:00.000Z")).toBe("콜 · 부재 → 다음 09/26")
    expect(formatOutcomeSummary({ channel: "kakao", result: null }, null)).toBe("카톡 · 다음 일정 없음")
    expect(formatOutcomeSummary({ channel: "sms", result: "answered" }, null, { lead: true })).toBe("문자 · 연결됨 · 팔로업 그대로")
  })
})

describe("결과 폼 마크업", () => {
  const noop = () => {}

  it("채널·결과·다음 일정 칩은 aria-pressed 선택 상태이고, 결과를 고르기 전에는 저장이 막힌다", () => {
    const html = renderToStaticMarkup(
      <TodayContactOutcomeForm
        row={row({ openTaskIds: ["t1", "t2"] })}
        draft={createOutcomeDraft("neo:acc-1")}
        onChange={noop}
        onSubmit={noop}
        onCancel={noop}
        pending={false}
        basisMs={NOW}
        formId="f1"
      />
    )
    expect(html).toContain('aria-label="청담 브릿지영어 연락 결과 입력"')
    expect(html).toContain('role="group" aria-label="연락 채널"')
    expect(html).toMatch(/aria-pressed="true"[^>]*>콜</)
    expect(html).toContain("내일 09:00")
    expect(html).toContain("09/26")
    expect(html).toContain("열린 할 일 2건 함께 완료")
    expect(html).toContain("결과를 고르면 저장할 수 있습니다")
    expect(html).toMatch(/<button type="submit" disabled=""/)
    expect(html).toContain("외부 NeoCRM·Compass 에는 쓰지 않습니다")
    // 채움은 CTA(저장)만 Classin Green — 파랑·보라 없음
    expect(html).not.toMatch(/#(2563eb|3b82f6|7c3aed|8b5cf6)/i)
  })

  it("리드 폼은 '없음' 대신 '팔로업 그대로'를 쓰고, 카톡은 결과 칩을 끈다", () => {
    const html = renderToStaticMarkup(
      <TodayContactOutcomeForm
        row={row({ key: "lead:L1", primaryAction: "record_outcome_lead" })}
        draft={applyOutcomeChannel(createOutcomeDraft("lead:L1"), "kakao")}
        onChange={noop}
        onSubmit={noop}
        onCancel={noop}
        pending={false}
        basisMs={NOW}
        formId="f2"
      />
    )
    expect(html).toContain("팔로업 그대로")
    expect(html).toContain("카톡·이메일은 결과 없이 기록만 남습니다")
    expect(html).toMatch(/aria-pressed="false" disabled=""[^>]*>연결됨</)
    expect(html).toContain("Compass 에는 쓰지 않습니다")
  })

  it("'날짜' 입력의 min 은 오늘 10:00 이 지났으면 내일 — 지난 날짜를 고르면 경고하고 저장을 막는다", () => {
    const draft = { ...createOutcomeDraft("neo:acc-1"), result: "answered" as const, next: "date" as const, nextTouched: true }
    const pastHtml = renderToStaticMarkup(
      <TodayContactOutcomeForm
        row={row()}
        draft={{ ...draft, nextDate: "2026-09-25" }}
        onChange={noop}
        onSubmit={noop}
        onCancel={noop}
        pending={false}
        basisMs={NOW}
        formId="f4"
      />
    )
    expect(pastHtml).toContain('min="2026-09-26"')
    expect(pastHtml).toContain('aria-invalid="true"')
    expect(pastHtml).toContain("그날 10:00 이 이미 지났습니다")
    expect(pastHtml).toMatch(/<button type="submit" disabled=""/)
    const okHtml = renderToStaticMarkup(
      <TodayContactOutcomeForm
        row={row()}
        draft={{ ...draft, nextDate: "2026-09-26" }}
        onChange={noop}
        onSubmit={noop}
        onCancel={noop}
        pending={false}
        basisMs={NOW}
        formId="f5"
      />
    )
    expect(okHtml).not.toContain("이미 지났습니다")
    expect(okHtml).not.toMatch(/<button type="submit" disabled=""/)
  })

  it("버리기 확인은 alertdialog 로 '계속 작성 / 버리고 닫기'를 준다", () => {
    const html = renderToStaticMarkup(
      <TodayContactOutcomeForm
        row={row()}
        draft={{ ...createOutcomeDraft("neo:acc-1"), memo: "작성 중" }}
        onChange={noop}
        onSubmit={noop}
        onCancel={noop}
        pending={false}
        basisMs={NOW}
        formId="f3"
        discardPrompt={{ onKeep: noop, onDiscard: noop }}
      />
    )
    expect(html).toContain('role="alertdialog"')
    expect(html).toContain("계속 작성")
    expect(html).toContain("버리고 닫기")
  })
})
