import { describe, expect, it } from "vitest"

import { buildCrmCustomerEventInsert, parseLooseList } from "@/lib/repositories/crm-events"

const NOW = new Date("2026-06-26T09:00:00.000Z")

describe("CRM customer events", () => {
  it("parses comma and newline separated quick-entry fields", () => {
    expect(parseLooseList("김담당, 박원장\n이실장")).toEqual(["김담당", "박원장", "이실장"])
    expect(parseLooseList(["견적", "  갱신  ", ""])).toEqual(["견적", "갱신"])
  })

  it("normalizes meeting notes into a durable CRM event insert", () => {
    const insert = buildCrmCustomerEventInsert(
      {
        targetType: "lead",
        targetId: "lead-1",
        targetLabel: "테스트 학원",
        sourceType: "meeting_minutes",
        occurredAt: "2026-06-26T01:30:00.000Z",
        title: "도입 상담",
        summary: "7월 도입 검토",
        attendees: ["김담당", "박원장"],
        decisions: ["데모 일정 확정"],
        blockers: ["예산 승인 필요"],
        nextActions: [
          {
            title: "견적서 발송",
            ownerName: "김담당",
            dueAt: "2026-06-27T00:00:00.000Z",
            done: false,
          },
        ],
        sentiment: "positive",
        tags: ["견적", "견적", "도입"],
      },
      NOW
    )

    expect(insert).toMatchObject({
      target_type: "lead",
      target_id: "lead-1",
      target_label: "테스트 학원",
      source_type: "meeting_minutes",
      title: "도입 상담",
      summary: "7월 도입 검토",
      sentiment: "positive",
      tags: ["견적", "도입"],
    })
    expect(insert.attendees).toEqual([{ name: "김담당" }, { name: "박원장" }])
    expect(insert.decisions).toEqual([{ title: "데모 일정 확정" }])
    expect(insert.blockers).toEqual([{ title: "예산 승인 필요" }])
    expect(insert.next_actions).toEqual([
      {
        title: "견적서 발송",
        ownerName: "김담당",
        dueAt: "2026-06-27T00:00:00.000Z",
        done: false,
      },
    ])
  })

  it("falls back to a safe title and timestamp for sparse quick notes", () => {
    const insert = buildCrmCustomerEventInsert(
      {
        sourceType: "manual_note",
        occurredAt: "not-a-date",
        body: "전화 후 간단 메모",
      },
      NOW
    )

    expect(insert.title).toBe("제목 없는 CRM 기록")
    expect(insert.occurred_at).toBe(NOW.toISOString())
    expect(insert.body).toBe("전화 후 간단 메모")
  })
})
