import { describe, expect, it } from "vitest"

import { buildReinflowIndex } from "@/lib/crm/lead-reinflow"
import {
  LEAD_ACTION_FALLBACK_MESSAGE,
  describeLeadActionError,
  countBySourceGroup,
  countNewLeadReinflow,
  filterNewLeadRows,
  filterNewLeads,
  kstDateKey,
  leadDateRangeWindow,
  newLeadReinflowKind,
  resolveLeadDateRange,
} from "@/lib/marketing/new-leads"
import type { LeadRecord } from "@/lib/repositories/leads"

function makeLead(patch: Partial<LeadRecord> = {}): LeadRecord {
  return {
    id: patch.id ?? "lead-1",
    source: "contact_page",
    status: "new",
    timestamp: "2026-08-20T03:00:00.000Z",
    ...patch,
  } as LeadRecord
}

describe("kstDateKey", () => {
  it("UTC 시각을 KST 일자로 접는다 — 자정 직전 UTC는 다음 날이다", () => {
    // 2026-08-25 15:30 UTC = 2026-08-26 00:30 KST. UTC 일자로 자르면 하루 밀린다.
    expect(kstDateKey("2026-08-25T15:30:00.000Z")).toBe("2026-08-26")
    expect(kstDateKey("2026-08-25T14:59:00.000Z")).toBe("2026-08-25")
  })

  it("깨진 timestamp 는 null — 임의 일자를 만들지 않는다", () => {
    expect(kstDateKey("not-a-date")).toBeNull()
    expect(kstDateKey("")).toBeNull()
  })
})

describe("resolveLeadDateRange", () => {
  it("프리셋은 오늘을 끝점으로 하는 inclusive 구간이다", () => {
    expect(resolveLeadDateRange("7d", null, "2026-08-26")).toEqual({
      since: "2026-08-20",
      until: "2026-08-26",
    })
    expect(resolveLeadDateRange("30d", null, "2026-08-26")).toEqual({
      since: "2026-07-28",
      until: "2026-08-26",
    })
    expect(resolveLeadDateRange("90d", null, "2026-08-26")).toEqual({
      since: "2026-05-29",
      until: "2026-08-26",
    })
  })

  it("커스텀 범위는 양끝을 그대로 쓴다(하루짜리 포함)", () => {
    expect(
      resolveLeadDateRange("custom", { from: "2026-08-01", to: "2026-08-15" }, "2026-08-26")
    ).toEqual({ since: "2026-08-01", until: "2026-08-15" })
    expect(
      resolveLeadDateRange("custom", { from: "2026-08-03", to: "2026-08-03" }, "2026-08-26")
    ).toEqual({ since: "2026-08-03", until: "2026-08-03" })
  })

  it("시작이 종료보다 뒤이거나 형식이 깨진 커스텀은 null — 호출부가 직전 유효 범위를 유지한다", () => {
    expect(
      resolveLeadDateRange("custom", { from: "2026-08-20", to: "2026-08-01" }, "2026-08-26")
    ).toBeNull()
    expect(resolveLeadDateRange("custom", { from: "2026-08-20", to: "" }, "2026-08-26")).toBeNull()
    expect(resolveLeadDateRange("custom", null, "2026-08-26")).toBeNull()
    expect(
      resolveLeadDateRange("custom", { from: "20260820", to: "2026-08-21" }, "2026-08-26")
    ).toBeNull()
  })
})

describe("filterNewLeads", () => {
  const range = { since: "2026-08-01", until: "2026-08-10" }

  it("커스텀 범위의 양끝 일자를 포함한다(KST 기준)", () => {
    const leads = [
      makeLead({ id: "start", timestamp: "2026-07-31T15:00:00.000Z" }), // KST 08-01 00:00
      makeLead({ id: "end", timestamp: "2026-08-10T14:59:00.000Z" }), // KST 08-10 23:59
      makeLead({ id: "before", timestamp: "2026-07-31T14:00:00.000Z" }), // KST 07-31
      makeLead({ id: "after", timestamp: "2026-08-10T15:00:00.000Z" }), // KST 08-11
    ]
    expect(filterNewLeads(leads, range).map((lead) => lead.id)).toEqual(["end", "start"])
  })

  it("테스트 리드는 범위 안이어도 제외한다", () => {
    const leads = [
      makeLead({ id: "real", timestamp: "2026-08-05T03:00:00.000Z" }),
      makeLead({ id: "meta-test", timestamp: "2026-08-05T03:00:00.000Z", email: "test@meta.com" }),
      makeLead({ id: "e2e", timestamp: "2026-08-05T03:00:00.000Z", email: "test+abc@classin.com" }),
      makeLead({ id: "dummy", timestamp: "2026-08-05T03:00:00.000Z", name: "<test lead: dummy>" }),
    ]
    expect(filterNewLeads(leads, range).map((lead) => lead.id)).toEqual(["real"])
  })

  it("깨진 timestamp 는 조용히 제외한다(1970년으로 떨어뜨리지 않는다)", () => {
    const leads = [
      makeLead({ id: "ok", timestamp: "2026-08-05T03:00:00.000Z" }),
      makeLead({ id: "broken", timestamp: "언젠가" }),
      makeLead({ id: "empty", timestamp: "" }),
    ]
    expect(filterNewLeads(leads, range).map((lead) => lead.id)).toEqual(["ok"])
  })

  it("소스 그룹 필터는 선택한 묶음만 남기고, 비어 있으면 전체다", () => {
    const leads = [
      makeLead({ id: "meta", source: "meta_lead_ads", timestamp: "2026-08-05T03:00:00.000Z" }),
      makeLead({ id: "home", source: "demo_modal", timestamp: "2026-08-05T03:00:00.000Z" }),
      makeLead({ id: "news", source: "newsletter", timestamp: "2026-08-05T03:00:00.000Z" }),
    ]
    expect(filterNewLeads(leads, { ...range, groups: ["meta"] }).map((l) => l.id)).toEqual(["meta"])
    expect(
      filterNewLeads(leads, { ...range, groups: ["meta", "newsletter"] }).map((l) => l.id).sort()
    ).toEqual(["meta", "news"])
    expect(filterNewLeads(leads, { ...range, groups: [] })).toHaveLength(3)
  })

  it("검색은 공백 구분 AND 토큰이다 — 두 조건을 모두 만족해야 남는다", () => {
    const leads = [
      makeLead({ id: "both", org: "강남 수학학원", size: "300", timestamp: "2026-08-05T03:00:00.000Z" }),
      makeLead({ id: "one", org: "강남 영어학원", size: "50", timestamp: "2026-08-05T03:00:00.000Z" }),
    ]
    expect(filterNewLeads(leads, { ...range, query: "강남 300" }).map((l) => l.id)).toEqual(["both"])
    expect(filterNewLeads(leads, { ...range, query: "강남" })).toHaveLength(2)
    expect(filterNewLeads(leads, { ...range, query: "   " })).toHaveLength(2)
  })

  it("검색은 Meta 광고명(구버전 message 표기 포함)까지 훑는다", () => {
    const leads = [
      makeLead({
        id: "ad",
        source: "meta_lead_ads",
        message: "campaign=8월전자칠판\nad=업그레이드소재A",
        timestamp: "2026-08-05T03:00:00.000Z",
      }),
      makeLead({ id: "plain", timestamp: "2026-08-05T03:00:00.000Z" }),
    ]
    expect(filterNewLeads(leads, { ...range, query: "업그레이드소재A" }).map((l) => l.id)).toEqual(["ad"])
  })

  it("미연락만 보기는 status 가 new 인 리드만 남긴다", () => {
    const leads = [
      makeLead({ id: "new", status: "new", timestamp: "2026-08-05T03:00:00.000Z" }),
      makeLead({ id: "contacted", status: "contacted", timestamp: "2026-08-05T03:00:00.000Z" }),
      makeLead({ id: "converted", status: "converted", timestamp: "2026-08-05T03:00:00.000Z" }),
    ]
    expect(filterNewLeads(leads, { ...range, onlyUncontacted: true }).map((l) => l.id)).toEqual(["new"])
    expect(filterNewLeads(leads, { ...range, onlyUncontacted: false })).toHaveLength(3)
  })

  it("반환은 최신 유입순이다", () => {
    const leads = [
      makeLead({ id: "old", timestamp: "2026-08-02T03:00:00.000Z" }),
      makeLead({ id: "newest", timestamp: "2026-08-09T03:00:00.000Z" }),
      makeLead({ id: "mid", timestamp: "2026-08-05T03:00:00.000Z" }),
    ]
    expect(filterNewLeads(leads, range).map((lead) => lead.id)).toEqual(["newest", "mid", "old"])
  })
})

// F12 — 창은 생성 시각이 아니라 유입 시각(생성 또는 재문의 last_inflow_at)으로 자른다.
describe("filterNewLeadRows — 유입 시각 창(재문의 병합 반영)", () => {
  const range = { since: "2026-08-01", until: "2026-08-10" }

  it("기간 전에 생성되고 기간 안에 재문의한 리드를 재유입 행으로 포함하고, 재문의 시각으로 정렬한다", () => {
    const leads = [
      makeLead({ id: "fresh", timestamp: "2026-08-05T03:00:00.000Z" }),
      makeLead({
        id: "reinquiry",
        timestamp: "2026-07-10T03:00:00.000Z", // 기간 전 생성
        last_inflow_at: "2026-08-08T03:00:00.000Z", // 기간 안 재문의
      }),
      makeLead({
        id: "old-only",
        timestamp: "2026-07-10T03:00:00.000Z",
        last_inflow_at: "2026-07-10T03:00:00.000Z", // 백필(생성과 같음) — 재문의 아님
      }),
    ]
    const rows = filterNewLeadRows(leads, range)
    expect(rows.map((row) => row.lead.id)).toEqual(["reinquiry", "fresh"])
    expect(rows[0].inflow).toMatchObject({ kind: "reinflow", at: "2026-08-08T03:00:00.000Z" })
    expect(rows[1].inflow).toMatchObject({ kind: "new", at: "2026-08-05T03:00:00.000Z" })
    // 호환 래퍼도 같은 집합·순서
    expect(filterNewLeads(leads, range).map((lead) => lead.id)).toEqual(["reinquiry", "fresh"])
  })

  it("재문의가 기간 밖이면 제외하고, KST 하루 경계를 반열린 창으로 자른다", () => {
    const leads = [
      makeLead({
        id: "reinquiry-after",
        timestamp: "2026-07-10T03:00:00.000Z",
        last_inflow_at: "2026-08-10T15:00:00.000Z", // KST 08-11 00:00 — 창 밖
      }),
      makeLead({
        id: "reinquiry-edge",
        timestamp: "2026-07-10T03:00:00.000Z",
        last_inflow_at: "2026-08-10T14:59:59.000Z", // KST 08-10 23:59:59 — 창 안
      }),
    ]
    expect(filterNewLeadRows(leads, range).map((row) => row.lead.id)).toEqual(["reinquiry-edge"])
  })

  it("기간 안에 생성되고 기간 안에 재문의까지 한 리드는 1행(신규, 생성 시각)이다", () => {
    const leads = [
      makeLead({
        id: "both",
        timestamp: "2026-08-02T03:00:00.000Z",
        last_inflow_at: "2026-08-09T03:00:00.000Z",
      }),
    ]
    const rows = filterNewLeadRows(leads, range)
    expect(rows).toHaveLength(1)
    expect(rows[0].inflow).toMatchObject({ kind: "new", at: "2026-08-02T03:00:00.000Z" })
  })

  it("깨진 범위는 빈 목록 — 임의 보정하지 않는다", () => {
    const leads = [makeLead({ id: "x", timestamp: "2026-08-05T03:00:00.000Z" })]
    expect(filterNewLeadRows(leads, { since: "2026-08-10", until: "2026-08-01" })).toEqual([])
    expect(filterNewLeadRows(leads, { since: "20260801", until: "2026-08-10" })).toEqual([])
  })
})

describe("leadDateRangeWindow", () => {
  it("KST 00:00 시작 ~ 종료 다음날 KST 00:00(반열린)", () => {
    expect(leadDateRangeWindow({ since: "2026-08-01", until: "2026-08-10" })).toEqual({
      fromMs: Date.parse("2026-07-31T15:00:00.000Z"),
      toMs: Date.parse("2026-08-10T15:00:00.000Z"),
    })
  })
})

describe("newLeadReinflowKind / countNewLeadReinflow", () => {
  const range = { since: "2026-08-01", until: "2026-08-10" }

  it("재문의 행은 reinquiry, 같은 연락처의 더 이른 행이 있으면 repeat_contact, 첫 유입이면 null", () => {
    const leads = [
      makeLead({
        id: "reinquiry",
        phone: "010-1111-1111",
        timestamp: "2026-07-10T03:00:00.000Z",
        last_inflow_at: "2026-08-08T03:00:00.000Z",
      }),
      makeLead({ id: "earlier", phone: "010-2222-2222", timestamp: "2026-07-01T03:00:00.000Z" }),
      makeLead({ id: "repeat", phone: "010-2222-2222", timestamp: "2026-08-04T03:00:00.000Z" }),
      makeLead({ id: "first", phone: "010-3333-3333", timestamp: "2026-08-03T03:00:00.000Z" }),
      makeLead({
        id: "new-then-again",
        phone: "010-4444-4444",
        timestamp: "2026-08-02T03:00:00.000Z",
        last_inflow_at: "2026-08-09T03:00:00.000Z",
      }),
    ]
    const index = buildReinflowIndex(leads)
    const rows = filterNewLeadRows(leads, range)
    const kinds = Object.fromEntries(rows.map((row) => [row.lead.id, newLeadReinflowKind(row, index)]))

    expect(kinds).toEqual({
      reinquiry: "reinquiry",
      repeat: "repeat_contact",
      first: null,
      // 생성이 기간 안이면 이 기간의 첫 유입이다 — 같은 기간 안의 재문의는 한 행(신규)으로 접힌다
      // (leadInflowInWindow·tallyLeadInflow 와 같은 축). "재유입 N 포함"에도 세지 않는다.
      "new-then-again": null,
    })
    expect(countNewLeadReinflow(rows, index)).toBe(2)
  })

  it("기간 안 생성·기간 뒤 재문의한 리드는 그 기간에서 첫 유입 — '재문의' 배지·재유입 건수에 넣지 않는다(리뷰 2026-09-25)", () => {
    const leads = [
      makeLead({
        id: "later-reinquiry",
        phone: "010-5555-5555",
        timestamp: "2026-09-03T03:00:00.000Z", // 09-03 생성(기간 안)
        last_inflow_at: "2026-09-20T03:00:00.000Z", // 09-20 재문의(기간 밖)
      }),
    ]
    const index = buildReinflowIndex(leads)
    expect(index.get("later-reinquiry")).toBe("inflow_stamp")

    const firstWeek = filterNewLeadRows(leads, { since: "2026-09-01", until: "2026-09-07" })
    expect(firstWeek).toHaveLength(1)
    expect(firstWeek[0].inflow.kind).toBe("new")
    expect(newLeadReinflowKind(firstWeek[0], index)).toBeNull()
    expect(countNewLeadReinflow(firstWeek, index)).toBe(0)

    // 재문의가 들어온 기간에서는 그 행이 재문의다.
    const reinquiryWeek = filterNewLeadRows(leads, { since: "2026-09-15", until: "2026-09-21" })
    expect(reinquiryWeek[0].inflow).toMatchObject({ kind: "reinflow", at: "2026-09-20T03:00:00.000Z" })
    expect(newLeadReinflowKind(reinquiryWeek[0], index)).toBe("reinquiry")
    expect(countNewLeadReinflow(reinquiryWeek, index)).toBe(1)
  })

  it("같은 연락처의 더 이른 행이 있는 기간 안 생성 행은 여전히 '재유입'(repeat_contact)", () => {
    const leads = [
      makeLead({ id: "old", phone: "010-6666-6666", timestamp: "2026-08-15T03:00:00.000Z" }),
      makeLead({
        id: "again",
        phone: "010-6666-6666",
        timestamp: "2026-09-03T03:00:00.000Z",
        last_inflow_at: "2026-09-20T03:00:00.000Z",
      }),
    ]
    const index = buildReinflowIndex(leads)
    const rows = filterNewLeadRows(leads, { since: "2026-09-01", until: "2026-09-07" })
    expect(rows.map((row) => row.lead.id)).toEqual(["again"])
    expect(newLeadReinflowKind(rows[0], index)).toBe("repeat_contact")
  })
})

describe("countBySourceGroup", () => {
  it("전 그룹 키를 항상 채운다 — 0건 그룹도 null 이 아니라 0으로 보인다", () => {
    const counts = countBySourceGroup([
      makeLead({ id: "a", source: "meta_lead_ads" }),
      makeLead({ id: "b", source: "meta_lead_ads" }),
      makeLead({ id: "c", source: "demo_modal" }),
      // 매핑에 없는 source 는 수기·기타로 흡수된다(칩에서 리드가 새지 않게).
      makeLead({ id: "d", source: "무언가_새_채널" }),
      // 접수 두 갈래는 전용 그룹으로 갈린다 — 방문·주문을 실제로 잡은 리드라
      // 문의와 같은 칩에 섞이면 큐에서 구분이 안 된다.
      makeLead({ id: "e", source: "showroom_booking" }),
      makeLead({ id: "f", source: "checkout_request" }),
    ])
    expect(counts).toEqual({
      meta: 2,
      homepage: 1,
      intake: 2,
      resources: 0,
      newsletter: 0,
      channel_talk: 0,
      chatbot: 0,
      manual_etc: 1,
    })
  })

  it("빈 배열이면 전 그룹 0", () => {
    expect(Object.values(countBySourceGroup([])).every((count) => count === 0)).toBe(true)
  })
})

describe("describeLeadActionError — 실패 문구", () => {
  it("서버가 준 한국어 메시지는 그대로 쓴다", () => {
    expect(describeLeadActionError(new Error("리드를 수정하지 못했습니다."))).toBe(
      "리드를 수정하지 못했습니다."
    )
  })

  it("fetch 자체 실패는 네트워크 문구로 옮긴다 — 브라우저별 원문 3종", () => {
    for (const raw of ["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource."]) {
      expect(describeLeadActionError(new Error(raw)), raw).toBe(
        "네트워크 연결을 확인해 주세요."
      )
    }
  })

  it("상태코드 폴백은 코드별 한국어로 바꾼다", () => {
    expect(describeLeadActionError(new Error("404 Not Found"))).toContain("삭제된 리드")
    expect(describeLeadActionError(new Error("403 Forbidden"))).toContain("권한")
    expect(describeLeadActionError(new Error("500 Internal Server Error"))).toContain("서버 오류")
    expect(describeLeadActionError(new Error("503 Service Unavailable"))).toContain("서버 오류")
  })

  it("모르는 상태코드는 지어내지 않고 일반 문구로 떨어뜨린다", () => {
    expect(describeLeadActionError(new Error("418 I am a teapot"))).toBe(LEAD_ACTION_FALLBACK_MESSAGE)
  })

  it("숫자로 시작하는 한국어 메시지를 상태코드로 오인하지 않는다", () => {
    expect(describeLeadActionError(new Error("500건을 넘겨 저장할 수 없습니다."))).toBe(
      "500건을 넘겨 저장할 수 없습니다."
    )
  })

  it("빈 값·Error 아닌 값도 문구를 돌려준다", () => {
    expect(describeLeadActionError(new Error("   "))).toBe(LEAD_ACTION_FALLBACK_MESSAGE)
    expect(describeLeadActionError(null)).toBe(LEAD_ACTION_FALLBACK_MESSAGE)
    expect(describeLeadActionError(undefined)).toBe(LEAD_ACTION_FALLBACK_MESSAGE)
    expect(describeLeadActionError("직접 던진 문자열")).toBe("직접 던진 문자열")
  })
})
