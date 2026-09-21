import { describe, expect, it } from "vitest"

import {
  buildReinflowIndex,
  countReinflow,
  leadInflowInWindow,
  tallyLeadInflow,
  type ReinflowLead,
} from "@/lib/crm/lead-reinflow"

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

  // 2026-09-14 E2(normalizePhoneKey = Compass normPhone 등가)의 정정 효과를 고정한다. 옛 키는 '+82 010-…'·'0082-010-…' 를
  // '001012345678', '10-…' 를 '1012345678' 로 만들어 '010-…' 와 다른 사람으로 갈랐다 — 캠페인 허브 신규 리드 탭의
  // 재유입 수가 이런 쌍에서 늘어나는 것은 의도한 정정이다.
  it.each([
    ["+82 010-1234-5678", "010-1234-5678"],
    ["0082-010-1234-5678", "010-1234-5678"],
    ["10-1234-5678", "010-1234-5678"],
  ])("국가번호 뒤 0 유지·앞 0 탈락 표기 %j 와 %j 는 같은 연락처 — 나중 리드가 재유입", (earlier, later) => {
    const index = buildReinflowIndex([
      lead({ id: "first", phone: earlier, timestamp: "2026-09-01T00:00:00Z" }),
      lead({ id: "again", phone: later, timestamp: "2026-09-10T00:00:00Z" }),
    ])
    expect(index.has("first")).toBe(false)
    expect(index.get("again")).toBe("repeat_contact")
    expect(countReinflow([{ id: "first" }, { id: "again" }], index)).toBe(1)
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

// 2026-09-21 — 응대 대상 소스의 재문의는 새 행 대신 기존 행의 last_inflow_at 만 갱신한다(lib/server/lead-capture.ts).
// 기간 유입을 생성 시각만으로 세면 재문의가 빠지므로 유입 축 max(created_at, last_inflow_at)으로 센다.
describe("leadInflowInWindow", () => {
  const from = Date.parse("2026-09-14T00:00:00Z")
  const to = Date.parse("2026-09-21T00:00:00Z")

  it("창 안에 생성된 리드는 신규 — 시각은 생성 시각", () => {
    expect(
      leadInflowInWindow({ timestamp: "2026-09-15T00:00:00Z", last_inflow_at: "2026-09-15T00:00:00Z" }, from, to)
    ).toEqual({ kind: "new", at: "2026-09-15T00:00:00Z", atMs: Date.parse("2026-09-15T00:00:00Z") })
  })

  it("창 밖에 생성되고 창 안에 재문의한 리드는 재유입 — 시각은 재문의 시각", () => {
    expect(
      leadInflowInWindow({ timestamp: "2026-08-01T00:00:00Z", last_inflow_at: "2026-09-16T03:00:00Z" }, from, to)
    ).toEqual({ kind: "reinflow", at: "2026-09-16T03:00:00Z", atMs: Date.parse("2026-09-16T03:00:00Z") })
  })

  it("생성과 재문의가 모두 창 안이면 신규 1건으로만 센다(이중 집계 금지)", () => {
    const event = leadInflowInWindow(
      { timestamp: "2026-09-15T00:00:00Z", last_inflow_at: "2026-09-18T00:00:00Z" },
      from,
      to
    )
    expect(event?.kind).toBe("new")
    expect(event?.at).toBe("2026-09-15T00:00:00Z")
  })

  it("재문의가 없는 옛 리드(백필로 두 값이 같다)·오차 이내 스탬프는 창 밖이면 세지 않는다", () => {
    expect(
      leadInflowInWindow({ timestamp: "2026-08-01T00:00:00Z", last_inflow_at: "2026-08-01T00:00:00Z" }, from, to)
    ).toBeNull()
    // 창 시작 직전 생성 + 저장 지연 30초(허용 오차 60초 이내) — 재유입으로 승격하지 않는다.
    expect(
      leadInflowInWindow({ timestamp: "2026-09-13T23:59:50Z", last_inflow_at: "2026-09-14T00:00:20Z" }, from, to)
    ).toBeNull()
  })

  it("last_inflow_at 이 없으면(컬럼 미선택·미적용) 생성 시각 축으로만 센다", () => {
    expect(leadInflowInWindow({ timestamp: "2026-09-15T00:00:00Z" }, from, to)?.kind).toBe("new")
    expect(leadInflowInWindow({ timestamp: "2026-08-01T00:00:00Z", last_inflow_at: null }, from, to)).toBeNull()
  })

  it("기본은 반열린 창 [from, to) — 끝 경계는 다음 창의 몫, inclusiveEnd 면 포함", () => {
    const atEnd = { timestamp: "2026-08-01T00:00:00Z", last_inflow_at: "2026-09-21T00:00:00Z" }
    expect(leadInflowInWindow(atEnd, from, to)).toBeNull()
    expect(leadInflowInWindow(atEnd, from, to, { inclusiveEnd: true })?.kind).toBe("reinflow")
    expect(leadInflowInWindow({ timestamp: "2026-09-14T00:00:00Z" }, from, to)?.kind).toBe("new")
  })

  it("깨진 시각은 창에 넣지 않는다", () => {
    expect(leadInflowInWindow({ timestamp: "nonsense", last_inflow_at: "2026-09-16T00:00:00Z" }, from, to)).toBeNull()
    expect(leadInflowInWindow({ timestamp: "2026-08-01T00:00:00Z", last_inflow_at: "nonsense" }, from, to)).toBeNull()
  })
})

describe("tallyLeadInflow", () => {
  it("창 안 유입을 신규/재유입으로 가르고 한 리드는 한 번만 센다", () => {
    const leads = [
      lead({ id: "new", timestamp: "2026-09-15T00:00:00Z", last_inflow_at: "2026-09-15T00:00:00Z" }),
      lead({ id: "re", timestamp: "2026-08-01T00:00:00Z", last_inflow_at: "2026-09-16T00:00:00Z" }),
      lead({ id: "both", timestamp: "2026-09-17T00:00:00Z", last_inflow_at: "2026-09-19T00:00:00Z" }),
      lead({ id: "old", timestamp: "2026-08-01T00:00:00Z", last_inflow_at: "2026-08-01T00:00:00Z" }),
      lead({ id: "re-later", timestamp: "2026-08-01T00:00:00Z", last_inflow_at: "2026-09-25T00:00:00Z" }),
    ]
    const tally = tallyLeadInflow(leads, Date.parse("2026-09-14T00:00:00Z"), Date.parse("2026-09-21T00:00:00Z"))
    expect(tally.leads.map((item) => item.id)).toEqual(["new", "re", "both"])
    expect(tally.newCount).toBe(2)
    expect(tally.reinflowCount).toBe(1)
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
