import { describe, expect, it } from "vitest"

import { buildReinflowIndex, countReinflow, type ReinflowLead } from "@/lib/crm/lead-reinflow"

function lead(partial: Partial<ReinflowLead> & { id: string }): ReinflowLead {
  return { timestamp: "2026-08-01T00:00:00Z", ...partial }
}

describe("buildReinflowIndex", () => {
  it("같은 전화의 나중 리드만 재유입 — 최초 유입은 재유입이 아니다", () => {
    const index = buildReinflowIndex([
      lead({ id: "a", phone: "010-1234-5678", timestamp: "2026-08-01T00:00:00Z" }),
      lead({ id: "b", phone: "01012345678", timestamp: "2026-08-10T00:00:00Z" }),
    ])
    expect(index.has("a")).toBe(false)
    expect(index.get("b")).toBe("repeat_contact")
  })

  it("표기가 달라도 같은 번호로 본다(+82·0082 정규화)", () => {
    const index = buildReinflowIndex([
      lead({ id: "a", phone: "+82 10-1234-5678", timestamp: "2026-08-01T00:00:00Z" }),
      lead({ id: "b", phone: "0082-1012345678", timestamp: "2026-08-10T00:00:00Z" }),
    ])
    expect(index.get("b")).toBe("repeat_contact")
  })

  it("이메일만 겹쳐도 재유입 — 대소문자·공백은 무시한다", () => {
    const index = buildReinflowIndex([
      lead({ id: "a", email: "Lee@Example.com", timestamp: "2026-08-01T00:00:00Z" }),
      lead({ id: "b", email: " lee@example.com ", timestamp: "2026-08-10T00:00:00Z" }),
    ])
    expect(index.get("b")).toBe("repeat_contact")
  })

  it("입력 순서가 아니라 시각으로 최초를 정한다", () => {
    const index = buildReinflowIndex([
      lead({ id: "late", phone: "01012345678", timestamp: "2026-08-10T00:00:00Z" }),
      lead({ id: "early", phone: "01012345678", timestamp: "2026-08-01T00:00:00Z" }),
    ])
    expect(index.has("early")).toBe(false)
    expect(index.get("late")).toBe("repeat_contact")
  })

  it("전화·이메일이 모두 없으면 판정 대상이 아니다 — 숫자를 만들지 않는다", () => {
    const index = buildReinflowIndex([lead({ id: "a" }), lead({ id: "b" })])
    expect(index.size).toBe(0)
  })

  it("한 리드가 두 키를 들면 나머지 키도 최초 등록으로 남는다", () => {
    // a가 전화 중복이라 재유입이어도, a의 이메일은 아직 처음 본 키다.
    const index = buildReinflowIndex([
      lead({ id: "first", phone: "01012345678", timestamp: "2026-08-01T00:00:00Z" }),
      lead({ id: "a", phone: "01012345678", email: "x@example.com", timestamp: "2026-08-02T00:00:00Z" }),
      lead({ id: "b", email: "x@example.com", timestamp: "2026-08-03T00:00:00Z" }),
    ])
    expect(index.get("a")).toBe("repeat_contact")
    expect(index.get("b")).toBe("repeat_contact")
  })

  it("last_inflow_at이 생성 시각보다 유의미하게 뒤면 재유입으로 본다", () => {
    const index = buildReinflowIndex([
      lead({
        id: "stamped",
        phone: "01099998888",
        timestamp: "2026-08-01T00:00:00Z",
        last_inflow_at: "2026-08-20T00:00:00Z",
      }),
    ])
    expect(index.get("stamped")).toBe("inflow_stamp")
  })

  it("백필로 둘이 같은 행(또는 초 단위 오차)은 재유입이 아니다", () => {
    const index = buildReinflowIndex([
      lead({
        id: "backfilled",
        phone: "01099998888",
        timestamp: "2026-08-01T00:00:00Z",
        last_inflow_at: "2026-08-01T00:00:00Z",
      }),
      lead({
        id: "jitter",
        phone: "01077776666",
        timestamp: "2026-08-01T00:00:00Z",
        last_inflow_at: "2026-08-01T00:00:30Z",
      }),
    ])
    expect(index.size).toBe(0)
  })

  it("깨진 시각은 재유입으로 승격하지 않는다", () => {
    const index = buildReinflowIndex([
      lead({ id: "broken", phone: "01055554444", timestamp: "nonsense", last_inflow_at: "nonsense" }),
    ])
    expect(index.size).toBe(0)
  })
})

describe("countReinflow", () => {
  it("화면에 보이는 부분집합에서만 센다", () => {
    const all = [
      lead({ id: "a", phone: "01012345678", timestamp: "2026-08-01T00:00:00Z" }),
      lead({ id: "b", phone: "01012345678", timestamp: "2026-08-10T00:00:00Z" }),
      lead({ id: "c", phone: "01012345678", timestamp: "2026-08-20T00:00:00Z" }),
    ]
    const index = buildReinflowIndex(all)
    expect(countReinflow(all, index)).toBe(2)
    expect(countReinflow([{ id: "c" }], index)).toBe(1)
    expect(countReinflow([{ id: "a" }], index)).toBe(0)
  })
})
