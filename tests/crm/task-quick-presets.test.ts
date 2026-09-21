import { describe, expect, it } from "vitest"

import {
  buildTaskPresetPayload,
  resolveTaskPresetDueAt,
  TASK_QUICK_PRESETS,
  type TaskQuickPreset,
} from "@/lib/crm/task-quick-presets"

// §13 Q2 — 고객 360 태스크 탭 빠른 추가 칩. 마감 계산은 KST 벽시계 기준으로 고정한다(호스트 타임존
// 무관). 기준 시각은 명시적 오프셋(+09:00) ISO 문자열로 줘서 실행 환경 타임존과 독립적으로 만든다.
//
// 요일 기준(2026-09-20 기준 코드 기준일):
//   2026-09-20 일요일 · 09-21 월요일 · 09-25 금요일 · 09-26 토요일 · 09-28(다음) 월요일 · 10-02 금요일.

function preset(id: string): TaskQuickPreset {
  const found = TASK_QUICK_PRESETS.find((p) => p.id === id)
  if (!found) throw new Error(`preset not found: ${id}`)
  return found
}

function ms(iso: string): number {
  return new Date(iso).getTime()
}

describe("TASK_QUICK_PRESETS", () => {
  it("정확히 4개 프리셋을 정의한다(내일 재통화·이번 주 견적·다음 주 데모·재계약 논의)", () => {
    expect(TASK_QUICK_PRESETS).toHaveLength(4)
    expect(TASK_QUICK_PRESETS.map((p) => p.id)).toEqual([
      "call_tomorrow",
      "quote_this_week",
      "demo_next_week",
      "renewal_talk",
    ])
  })

  it("각 프리셋의 taskType이 CRM_TASK_TYPES 표기와 일치한다", () => {
    expect(preset("call_tomorrow").taskType).toBe("call")
    expect(preset("quote_this_week").taskType).toBe("quote")
    expect(preset("demo_next_week").taskType).toBe("demo")
    expect(preset("renewal_talk").taskType).toBe("renewal")
  })
})

describe("resolveTaskPresetDueAt — tomorrow_10", () => {
  it("월요일 기준 내일(화) 10:00 KST", () => {
    expect(resolveTaskPresetDueAt(preset("call_tomorrow"), ms("2026-09-21T00:00:00+09:00"))).toBe(
      "2026-09-22T01:00:00.000Z"
    )
  })
})

describe("resolveTaskPresetDueAt — this_friday_18", () => {
  it("월요일이면 이번 주 금요일 18:00 KST", () => {
    expect(resolveTaskPresetDueAt(preset("quote_this_week"), ms("2026-09-21T00:00:00+09:00"))).toBe(
      "2026-09-25T09:00:00.000Z"
    )
  })

  it("금요일 18시 이전이면 오늘(이번 주 금요일) 18:00 KST을 그대로 쓴다", () => {
    expect(resolveTaskPresetDueAt(preset("quote_this_week"), ms("2026-09-25T10:00:00+09:00"))).toBe(
      "2026-09-25T09:00:00.000Z"
    )
  })

  it("금요일 18시가 지났으면 다음 주 금요일로 민다", () => {
    expect(resolveTaskPresetDueAt(preset("quote_this_week"), ms("2026-09-25T19:00:00+09:00"))).toBe(
      "2026-10-02T09:00:00.000Z"
    )
  })

  it("토요일이면(이번 주 금요일이 이미 지남) 다음 주 금요일 18:00 KST", () => {
    expect(resolveTaskPresetDueAt(preset("quote_this_week"), ms("2026-09-26T10:00:00+09:00"))).toBe(
      "2026-10-02T09:00:00.000Z"
    )
  })

  it("일요일이면 다가오는 금요일이 아직 지나지 않아 그대로 쓴다", () => {
    expect(resolveTaskPresetDueAt(preset("quote_this_week"), ms("2026-09-20T00:00:00+09:00"))).toBe(
      "2026-09-25T09:00:00.000Z"
    )
  })
})

describe("resolveTaskPresetDueAt — next_monday_10", () => {
  it("오늘이 월요일이면 오늘을 건너뛰고 다음 주 월요일 10:00 KST로 민다", () => {
    expect(resolveTaskPresetDueAt(preset("demo_next_week"), ms("2026-09-21T00:00:00+09:00"))).toBe(
      "2026-09-28T01:00:00.000Z"
    )
  })

  it("토요일이면 다가오는(다음 주) 월요일 10:00 KST", () => {
    expect(resolveTaskPresetDueAt(preset("demo_next_week"), ms("2026-09-26T10:00:00+09:00"))).toBe(
      "2026-09-28T01:00:00.000Z"
    )
  })

  it("일요일이면 내일이 이미 다음 주 월요일이다", () => {
    expect(resolveTaskPresetDueAt(preset("demo_next_week"), ms("2026-09-20T00:00:00+09:00"))).toBe(
      "2026-09-21T01:00:00.000Z"
    )
  })
})

describe("resolveTaskPresetDueAt — in3_10", () => {
  it("오늘부터 +3일 10:00 KST(요일 무관 단순 오프셋)", () => {
    expect(resolveTaskPresetDueAt(preset("renewal_talk"), ms("2026-09-21T00:00:00+09:00"))).toBe(
      "2026-09-24T01:00:00.000Z"
    )
  })
})

describe("buildTaskPresetPayload", () => {
  const target = { targetType: "lead" as const, targetId: "lead-42", label: "테스트 학원" }
  const nowMs = ms("2026-09-21T00:00:00+09:00")

  it("title·taskType·targetType·targetId·dueAt(ISO)·targetLabel을 채운다", () => {
    const payload = buildTaskPresetPayload(preset("call_tomorrow"), target, nowMs)
    expect(payload).toEqual({
      title: "내일 재통화",
      taskType: "call",
      dueAt: "2026-09-22T01:00:00.000Z",
      targetType: "lead",
      targetId: "lead-42",
      targetLabel: "테스트 학원",
    })
  })

  it("label이 없거나 공백이면 targetLabel 필드를 아예 넣지 않는다", () => {
    const withoutLabel = buildTaskPresetPayload(preset("renewal_talk"), { targetType: "neo_account", targetId: "acc-1" }, nowMs)
    expect(withoutLabel.targetLabel).toBeUndefined()
    expect("targetLabel" in withoutLabel).toBe(false)

    const blankLabel = buildTaskPresetPayload(
      preset("renewal_talk"),
      { targetType: "neo_account", targetId: "acc-1", label: "   " },
      nowMs
    )
    expect("targetLabel" in blankLabel).toBe(false)
  })

  it("targetType은 lead/neo_account 어느 쪽이든 그대로 옮긴다", () => {
    const neoPayload = buildTaskPresetPayload(preset("demo_next_week"), { targetType: "neo_account", targetId: "acc-9" }, nowMs)
    expect(neoPayload.targetType).toBe("neo_account")
    expect(neoPayload.targetId).toBe("acc-9")
  })
})
