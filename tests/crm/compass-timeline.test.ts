import { describe, expect, it } from "vitest"

import {
  COMPASS_ACTIVITY_KIND_LABEL,
  compassActivityKindLabel,
  compassTimelineGroup,
  mergeCompassTimeline,
  toCompassTimelineEntries,
  type CompassActivityLike,
} from "@/lib/crm/compass-timeline"

function activity(overrides: Partial<CompassActivityLike> & { id: number }): CompassActivityLike {
  return {
    lead_id: 42,
    kind: "call",
    body: "통화 완료",
    actor: "진소망",
    created_at: "2026-08-20T02:00:00.000Z",
    ...overrides,
  }
}

describe("toCompassTimelineEntries", () => {
  it("system(폼 답변 제외)·빈 종류·모르는 종류는 빼고 나머지 9종을 올린다", () => {
    const entries = toCompassTimelineEntries([
      activity({ id: 1, kind: "call" }),
      activity({ id: 2, kind: "note" }),
      activity({ id: 3, kind: "meeting" }),
      activity({ id: 4, kind: "inflow" }),
      activity({ id: 5, kind: "stage_change" }),
      activity({ id: 6, kind: "system" }),
      activity({ id: 7, kind: null }),
      activity({ id: 8, kind: "unknown_future_kind" }),
      activity({ id: 9, kind: "sms", body: "문자 · 자료 링크 보냄" }),
      activity({ id: 10, kind: "memo", body: "원장님 다음 주 복귀" }),
      activity({ id: 11, kind: "action", body: "견적서 발송 (기한 09/16 10:00)" }),
      activity({ id: 12, kind: "alimtalk", body: "1영업일 내 연락 안내 발송 · 카카오 알림톡", actor: "Claude" }),
    ])

    expect(entries.map((entry) => entry.kind).sort()).toEqual([
      "action",
      "alimtalk",
      "call",
      "inflow",
      "meeting",
      "memo",
      "note",
      "sms",
      "stage_change",
    ])
  })

  it("2026-09-14 추가 종류 라벨 — 문자·메모·액션·알림톡 (예전엔 사전에 없어 조용히 버려졌다)", () => {
    const labels = Object.fromEntries(
      toCompassTimelineEntries([
        activity({ id: 1, kind: "sms" }),
        activity({ id: 2, kind: "memo" }),
        activity({ id: 3, kind: "action" }),
        activity({ id: 4, kind: "alimtalk" }),
      ]).map((entry) => [entry.kind, entry.kindLabel])
    )
    expect(labels).toEqual({ sms: "문자", memo: "메모", action: "액션", alimtalk: "알림톡" })
  })

  it("기존 종류 라벨은 그대로다", () => {
    expect(COMPASS_ACTIVITY_KIND_LABEL).toMatchObject({
      call: "콜",
      meeting: "미팅",
      note: "메모",
      inflow: "재유입",
      stage_change: "단계 변경",
    })
    expect(COMPASS_ACTIVITY_KIND_LABEL.system).toBeUndefined()
  })

  it("system 은 본문이 '폼 답변\\n' 으로 시작할 때만 '폼 답변'으로 올리고 머리 줄을 뗀다", () => {
    const entries = toCompassTimelineEntries([
      activity({ id: 1, kind: "system", body: "폼 답변\n방문 목적: 도입 상담\n상담 희망 시간: 오후", actor: null }),
      // 머리만 같고 줄바꿈이 없으면 정비 로그로 본다
      activity({ id: 2, kind: "system", body: "폼 답변 보강 백필" }),
      activity({ id: 3, kind: "system", body: "알림톡 발송 실패 · timeout", actor: "Claude" }),
      activity({ id: 4, kind: "system", body: "지역 라벨 정리 · 서울" }),
      activity({ id: 5, kind: "system", body: null }),
      // 머리 뒤가 비었으면 본문 null
      activity({ id: 6, kind: "system", body: "폼 답변\n   " }),
    ])

    expect(entries.map((entry) => entry.id).sort()).toEqual(["compass:1", "compass:6"])
    const answers = entries.find((entry) => entry.id === "compass:1")
    expect(answers?.kind).toBe("system")
    expect(answers?.kindLabel).toBe("폼 답변")
    expect(answers?.body).toBe("방문 목적: 도입 상담\n상담 희망 시간: 오후")
    expect(entries.find((entry) => entry.id === "compass:6")?.body).toBeNull()
  })

  it("폼 답변이 아닌 종류는 본문을 그대로 둔다(머리를 떼지 않는다)", () => {
    const [entry] = toCompassTimelineEntries([activity({ id: 1, kind: "sms", body: "문자 · 폼 답변\n처럼 보여도" })])
    expect(entry.body).toBe("문자 · 폼 답변\n처럼 보여도")
  })

  it("한글 라벨과 Compass 리드 딥링크를 붙인다", () => {
    const [entry] = toCompassTimelineEntries([activity({ id: 1, kind: "stage_change", lead_id: 77 })])

    expect(entry.kindLabel).toBe("단계 변경")
    expect(entry.href).toBe("https://mkt.classin.co.kr/leads?open=77")
    expect(entry.id).toBe("compass:1")
  })

  it("최신순으로 돌려주고 빈 본문은 null 로 눕힌다", () => {
    const entries = toCompassTimelineEntries([
      activity({ id: 1, created_at: "2026-08-01T00:00:00.000Z" }),
      activity({ id: 2, created_at: "2026-08-25T00:00:00.000Z", body: "   " }),
    ])

    expect(entries.map((entry) => entry.id)).toEqual(["compass:2", "compass:1"])
    expect(entries[0].body).toBeNull()
  })
})

describe("compassActivityKindLabel", () => {
  it("빈 값·모르는 종류는 null — 지어내지 않는다", () => {
    expect(compassActivityKindLabel(null, "x")).toBeNull()
    expect(compassActivityKindLabel("  ", "x")).toBeNull()
    expect(compassActivityKindLabel("payment", "x")).toBeNull()
    expect(compassActivityKindLabel(" sms ", null)).toBe("문자")
  })

  it("system 은 폼 답변 머리 + 줄바꿈일 때만", () => {
    expect(compassActivityKindLabel("system", "폼 답변\n질문: 답")).toBe("폼 답변")
    expect(compassActivityKindLabel("system", "폼 답변")).toBeNull()
    expect(compassActivityKindLabel("system", " 폼 답변\n질문: 답")).toBeNull()
    expect(compassActivityKindLabel("system", null)).toBeNull()
  })
})

describe("compassTimelineGroup", () => {
  it("메모·회의록·유입 축에 눕히고 나머지는 other", () => {
    expect(compassTimelineGroup("note")).toBe("memo")
    expect(compassTimelineGroup("memo")).toBe("memo")
    expect(compassTimelineGroup("meeting")).toBe("meeting")
    expect(compassTimelineGroup("inflow")).toBe("inflow")
    expect(compassTimelineGroup("system")).toBe("inflow")
    for (const kind of ["call", "sms", "action", "alimtalk", "stage_change", "unknown"]) {
      expect(compassTimelineGroup(kind)).toBe("other")
    }
  })

  it("타임라인에 올라가는 모든 종류가 묶음을 가진다(기존 화면 매핑과 같다)", () => {
    // 2026-09-14 이전 Customer360DetailActivity 매핑: note→메모, meeting→회의록, inflow→CS·웹유입, call·stage_change→통화·기타
    const before: Record<string, string> = { note: "memo", meeting: "meeting", inflow: "inflow", call: "other", stage_change: "other" }
    for (const [kind, group] of Object.entries(before)) expect(compassTimelineGroup(kind)).toBe(group)
  })
})

describe("mergeCompassTimeline", () => {
  const crmRows = [
    { id: "crm-old", occurredAt: "2026-08-10T00:00:00.000Z" },
    { id: "crm-new", occurredAt: "2026-08-26T00:00:00.000Z" },
  ]

  it("우리 기록과 Compass 기록을 시간 역순 한 줄로 합친다", () => {
    const compass = toCompassTimelineEntries([
      activity({ id: 1, created_at: "2026-08-20T00:00:00.000Z" }),
      activity({ id: 2, created_at: "2026-08-01T00:00:00.000Z" }),
    ])

    const merged = mergeCompassTimeline(crmRows, compass)

    expect(
      merged.map((item) => (item.kind === "crm" ? item.event.id : item.entry.id))
    ).toEqual(["crm-new", "compass:1", "crm-old", "compass:2"])
  })

  it("동시각이면 우리 원장 기록을 먼저 둔다", () => {
    const compass = toCompassTimelineEntries([activity({ id: 9, created_at: "2026-08-26T00:00:00.000Z" })])
    const merged = mergeCompassTimeline(crmRows, compass)

    expect(merged[0].kind).toBe("crm")
    expect(merged[1].kind).toBe("compass")
  })

  it("Compass 가 비어 있으면 기존 타임라인이 그대로 남는다", () => {
    const merged = mergeCompassTimeline(crmRows, [])
    expect(merged.map((item) => item.kind)).toEqual(["crm", "crm"])
  })
})
