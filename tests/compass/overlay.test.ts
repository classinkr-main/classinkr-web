import { describe, expect, it } from "vitest"

import {
  buildCompassDuplicateReport,
  buildCompassOverlayMap,
  formatCompassDay,
  summarizeCompassEntry,
  toCompassPhoneKeys,
  type CompassOverlaySource,
} from "@/lib/compass/overlay"

function row(partial: Partial<CompassOverlaySource> & { id: number }): CompassOverlaySource {
  return { phone_key: "01012345678", ...partial }
}

describe("buildCompassOverlayMap", () => {
  it("전화 키가 없는 행은 버린다 — 조인 키가 없으면 겹칠 수 없다", () => {
    const overlay = buildCompassOverlayMap([
      row({ id: 1, phone_key: null }),
      row({ id: 2, phone_key: "   " }),
    ])
    expect(Object.keys(overlay)).toEqual([])
  })

  it("같은 전화 키에 여러 건이면 최근성 우선으로 대표 1건을 고른다", () => {
    const overlay = buildCompassOverlayMap([
      row({ id: 10, stage: "new", last_inflow_at: "2026-08-01T00:00:00Z" }),
      row({ id: 11, stage: "demo", last_inflow_at: "2026-08-20T00:00:00Z" }),
      row({ id: 12, stage: "lost", last_inflow_at: "2026-08-05T00:00:00Z" }),
    ])
    expect(overlay["01012345678"].compassLeadId).toBe(11)
    expect(overlay["01012345678"].stage).toBe("demo")
  })

  it("최근성이 동률이면 id가 큰 쪽 — 새로고침마다 칩이 바뀌면 안 된다", () => {
    const overlay = buildCompassOverlayMap([
      row({ id: 7, stage: "contact", updated_at: "2026-08-20T00:00:00Z" }),
      row({ id: 9, stage: "quote", updated_at: "2026-08-20T00:00:00Z" }),
    ])
    expect(overlay["01012345678"].compassLeadId).toBe(9)
  })

  it("last_inflow_at이 없으면 updated_at → created_at 순으로 떨어진다", () => {
    const overlay = buildCompassOverlayMap([
      row({ id: 1, stage: "new", created_at: "2026-08-01T00:00:00Z" }),
      row({ id: 2, stage: "won", updated_at: "2026-08-02T00:00:00Z", created_at: "2026-07-01T00:00:00Z" }),
    ])
    expect(overlay["01012345678"].stage).toBe("won")
  })

  it("딥링크 URL과 라벨 원천 필드를 함께 싣는다", () => {
    const overlay = buildCompassOverlayMap([
      row({ id: 771, academy: " 강남청담어학원 ", caller: "진소망", neocrm_registered_at: "2026-08-10T00:00:00Z" }),
    ])
    const entry = overlay["01012345678"]
    expect(entry.url).toBe("https://mkt.classin.co.kr/leads?open=771")
    expect(entry.academy).toBe("강남청담어학원")
    expect(entry.caller).toBe("진소망")
    expect(entry.neocrmRegisteredAt).toBe("2026-08-10T00:00:00Z")
  })
})

describe("summarizeCompassEntry", () => {
  const base = buildCompassOverlayMap([
    row({
      id: 771,
      academy: "강남청담어학원",
      stage: "contact",
      caller: "진소망",
      owner: "김담당",
      demo_at: "2026-09-01T02:00:00Z",
      neocrm_registered_at: "2026-08-10T00:00:00Z",
    }),
  ])["01012345678"]

  it("주 라벨은 한글 단계 — 예시 계약 그대로", () => {
    expect(summarizeCompassEntry(base).primary).toBe("Compass 컨택")
  })

  it("콜 담당이 있으면 오너 대신 콜 담당을 쓴다", () => {
    const summary = summarizeCompassEntry(base)
    expect(summary.details).toContain("콜 진소망")
    expect(summary.details).not.toContain("담당 김담당")
  })

  it("데모 일정은 KST M/D로 접는다", () => {
    // 2026-09-01T02:00Z = KST 11:00 → 9/1
    expect(summarizeCompassEntry(base).details).toContain("데모 9/1")
  })

  it("NeoCRM 등록 표식을 칩에 싣는다", () => {
    expect(summarizeCompassEntry(base).details).toContain("NeoCRM 등록됨")
  })

  it("없는 신호는 만들어 내지 않는다", () => {
    const bare = buildCompassOverlayMap([row({ id: 5, stage: "new" })])["01012345678"]
    expect(summarizeCompassEntry(bare).details).toEqual([])
    expect(summarizeCompassEntry(bare).primary).toBe("Compass 신규유입")
  })

  it("단계가 bd면 BD 담당을 중복해서 말하지 않는다", () => {
    const bd = buildCompassOverlayMap([row({ id: 6, stage: "bd", bd_owner: "박BD" })])["01012345678"]
    const summary = summarizeCompassEntry(bd)
    expect(summary.primary).toBe("Compass BD인계")
    expect(summary.details).not.toContain("BD 박BD")
  })

  it("사전에 없는 단계는 지어내지 않고 원값을 보여 준다", () => {
    const odd = buildCompassOverlayMap([row({ id: 8, stage: "unknown_stage" })])["01012345678"]
    expect(summarizeCompassEntry(odd).primary).toBe("Compass unknown_stage")
  })
})

describe("formatCompassDay", () => {
  it("KST 경계를 넘긴 UTC 시각을 다음 날로 접는다", () => {
    // 2026-08-31T16:00Z = KST 9/1 01:00
    expect(formatCompassDay("2026-08-31T16:00:00Z")).toBe("9/1")
  })

  it("빈 값·깨진 값은 null", () => {
    expect(formatCompassDay(null)).toBeNull()
    expect(formatCompassDay("not-a-date")).toBeNull()
  })
})

describe("buildCompassDuplicateReport", () => {
  const rows = [
    row({ id: 771, academy: "강남청담어학원", stage: "contact", caller: "진소망", phone_key: "01012345678" }),
  ]

  it("전화가 Compass에 있으면 대표 경고 1건과 건수를 함께 돌려준다", () => {
    const report = buildCompassDuplicateReport(
      [{ phone: "010-1234-5678" }, { phone: "+82 10-1234-5678" }],
      rows
    )
    expect(report.count).toBe(2)
    expect(report.first).toMatchObject({
      compassLeadId: 771,
      academy: "강남청담어학원",
      stageLabel: "컨택",
      caller: "진소망",
      url: "https://mkt.classin.co.kr/leads?open=771",
    })
  })

  it("전화가 없거나 매칭이 없으면 경고를 만들지 않는다", () => {
    expect(buildCompassDuplicateReport([{ phone: null }], rows)).toEqual({
      first: null,
      count: 0,
      down: false,
    })
    expect(buildCompassDuplicateReport([{ phone: "010-9999-0000" }], rows)).toEqual({
      first: null,
      count: 0,
      down: false,
    })
  })
})

describe("toCompassPhoneKeys", () => {
  it("중복을 접고 정렬해 요청을 안정화한다(같은 목록 = 같은 요청)", () => {
    const keys = toCompassPhoneKeys([
      { phone: "010-1111-2222" },
      { phone: "01011112222" },
      { phone: "+82 10-3333-4444" },
      { phone: null },
      { phone: "asdf" },
    ])
    expect(keys).toEqual(["01011112222", "01033334444"])
  })
})
