import { describe, expect, it } from "vitest"

import {
  DORMANT_CONTACT_DAYS,
  EXPIRING_SOON_DAYS,
  NEO_SOURCE_EXPIRING_WINDOW_DAYS,
  SEGMENT_NONE_TOKEN,
  activeSegmentConditionKeys,
  assignedOwnerKeys,
  buildSegmentMatchers,
  describeSegmentSpec,
  isExpired,
  isExpiringSoon,
  isExpiringSoonInDays,
  isNoContactForDays,
  isSegmentSpecEmpty,
  isUnassignedOwnerKey,
  normalizeSegmentSpec,
  parseSegmentSpec,
  rowMatchesSegmentSpec,
  segmentChipOptions,
  segmentOptionKey,
  segmentOwnerFacetValues,
  segmentSpecQueryString,
  segmentTagMode,
  singleOptionSpec,
  switchSegmentTagMode,
  toggleSegmentListValue,
  toggleSegmentNumber,
  writeSegmentSpecParams,
  type SegmentRowInput,
} from "@/lib/crm/customer-segment-spec"
import { deriveCustomerFlags } from "@/lib/crm/customer-flags"
import { matchesSavedView, type CrmUnifiedCustomerRow } from "@/lib/crm/unified-view-rules"
import { buildRenewalAlertDigests } from "@/lib/crm/renewal-alerts"

const NOW = new Date("2026-09-25T00:00:00.000Z").getTime()
const DAY = 86_400_000
const iso = (days: number) => new Date(NOW + days * DAY).toISOString()

function row(partial: Partial<SegmentRowInput> = {}): SegmentRowInput {
  return {
    source: "neo_account",
    expireAt: null,
    depletionInDays: null,
    lastContactAt: null,
    balance: null,
    riskLevel: null,
    billingMode: null,
    ownerKeys: [],
    regionLabel: null,
    tags: [],
    ...partial,
  }
}

describe("기준일 SSOT(F1) — 만료 임박은 한 가지 뜻", () => {
  it("상수: 만료 임박 30일 · 원천 화면 60일(다른 이름) · 미접촉 30일", () => {
    expect(EXPIRING_SOON_DAYS).toBe(30)
    expect(NEO_SOURCE_EXPIRING_WINDOW_DAYS).toBe(60)
    expect(DORMANT_CONTACT_DAYS).toBe(30)
  })

  it("오늘~30일만 만료 임박, 지난 만료는 '만료'로 따로", () => {
    expect(isExpiringSoon(iso(0.5), NOW)).toBe(true)
    expect(isExpiringSoon(iso(30), NOW)).toBe(true)
    expect(isExpiringSoon(iso(30.5), NOW)).toBe(false)
    expect(isExpiringSoon(iso(-1), NOW)).toBe(false)
    expect(isExpired(iso(-1), NOW)).toBe(true)
    expect(isExpired(null, NOW)).toBe(false)
    expect(isExpiringSoonInDays(0)).toBe(true)
    expect(isExpiringSoonInDays(30)).toBe(true)
    expect(isExpiringSoonInDays(31)).toBe(false)
    expect(isExpiringSoonInDays(-2)).toBe(false)
  })

  it("통합 뷰·행 플래그·재연락 알림이 같은 경계를 쓴다 — 25일 남은 고객은 셋 다 '만료 임박'", () => {
    const expireAt = iso(25)
    const unifiedRow = { source: "neo_account", expireAt, lifecycle: "active_account" } as unknown as CrmUnifiedCustomerRow
    expect(matchesSavedView(unifiedRow, "expiring", new Set(), NOW)).toBe(true)
    expect(deriveCustomerFlags({ source: "neo_account", expireAt, nowMs: NOW })).toContain("expiring")
    const digests = buildRenewalAlertDigests([
      {
        accountId: "a",
        accountName: "A",
        ownerId: "o",
        ownerName: "담당",
        billingMode: "subscription",
        balance: null,
        expireInDays: 25,
        depletionInDays: null,
        riskReasons: [],
      },
    ])
    expect(digests[0]?.items[0]?.kind).toBe("expiring")
  })

  it("35일 남은 고객은 셋 다 아니다 · 이미 지난 고객은 플래그가 '만료'", () => {
    const expireAt = iso(35)
    const unifiedRow = { source: "neo_account", expireAt, lifecycle: "active_account" } as unknown as CrmUnifiedCustomerRow
    expect(matchesSavedView(unifiedRow, "expiring", new Set(), NOW)).toBe(false)
    expect(deriveCustomerFlags({ source: "neo_account", expireAt, nowMs: NOW })).not.toContain("expiring")
    expect(buildRenewalAlertDigests([{ accountId: "a", accountName: "A", ownerId: "o", ownerName: "담당", billingMode: "subscription", balance: null, expireInDays: 35, depletionInDays: null, riskReasons: [] }])).toEqual([])
    const expiredFlags = deriveCustomerFlags({ source: "neo_account", expireAt: iso(-3), nowMs: NOW })
    expect(expiredFlags).toContain("expired")
    expect(expiredFlags).not.toContain("expiring")
  })
})

describe("URL 직렬화·파싱 — ?view=·?tag= 규약처럼 모르는 값은 버린다", () => {
  it("숫자·목록 조건을 읽고 범위 밖·모르는 값·빈 값은 버린다", () => {
    const params = new URLSearchParams(
      "expDays=30&depDays=0&noContactDays=abc&minBalanceCny=50000&kinds=lead&kinds=bogus&risk=urgent&risk=soon&billing=consumption&billing=nope&owners=%20김담당%20&owners=&regions=부산&tagsAll=VIP&tagsAny=%20재계약%20%20확인"
    )
    expect(parseSegmentSpec(params)).toEqual({
      expDays: 30,
      minBalanceCny: 50000,
      kinds: ["lead"],
      risk: ["urgent", "soon"],
      billing: ["consumption"],
      owners: ["김담당"],
      regions: ["부산"],
      // tagsAll 과 tagsAny 가 함께 오면 tagsAll 하나로 합친다(화면은 한 방식만 표시 — 아래 라벨 방식 테스트).
      tagsAll: ["VIP", "재계약 확인"],
    })
  })

  it("정규형 직렬화 — 키 순서·enum 순서·자유 텍스트 정렬 고정, 같은 조건이면 같은 문자열", () => {
    const a = segmentSpecQueryString({ risk: ["soon", "urgent"], expDays: 14, owners: ["박", "김"] })
    const b = segmentSpecQueryString({ owners: ["김", "박"], expDays: 14, risk: ["urgent", "soon"] })
    expect(a).toBe(b)
    expect(a).toBe(new URLSearchParams([["expDays", "14"], ["risk", "urgent"], ["risk", "soon"], ["owners", "김"], ["owners", "박"]]).toString())
  })

  it("빈 조건은 URL 에 아무것도 싣지 않는다(기본 URL·프리페치 시드 불변)", () => {
    expect(segmentSpecQueryString({})).toBe("")
    expect(isSegmentSpecEmpty({ kinds: [], expDays: undefined })).toBe(true)
    const params = new URLSearchParams("view=priority&expDays=30")
    writeSegmentSpecParams(params, {})
    expect(params.toString()).toBe("view=priority")
  })

  it("파싱 → 직렬화 왕복이 같은 조건을 낸다", () => {
    const spec = { expDays: 60, kinds: ["neo_account" as const], tagsAny: ["A&B", "#1 고객"] }
    const round = parseSegmentSpec(new URLSearchParams(segmentSpecQueryString(spec)))
    expect(round).toEqual(normalizeSegmentSpec(spec))
  })

  it("대소문자만 다른 자유 텍스트는 하나로 접고, 목록은 상한 20개", () => {
    expect(normalizeSegmentSpec({ tagsAny: ["vip", "VIP", "Vip"] }).tagsAny).toHaveLength(1)
    const many = Array.from({ length: 30 }, (_, index) => `태그${index}`)
    expect(normalizeSegmentSpec({ tagsAny: many }).tagsAny).toHaveLength(20)
  })
})

describe("행 판정 — 조건끼리 AND, 한 조건 안의 값은 OR", () => {
  it("만료 N일 이내 — 지난 만료 제외", () => {
    const [matcher] = buildSegmentMatchers({ expDays: 14 }, NOW)
    expect(matcher.test(row({ expireAt: iso(10) }))).toBe(true)
    expect(matcher.test(row({ expireAt: iso(20) }))).toBe(false)
    expect(matcher.test(row({ expireAt: iso(-2) }))).toBe(false)
  })

  it("소진 N일 이내 — 예상일이 없으면 제외", () => {
    const [matcher] = buildSegmentMatchers({ depDays: 14 }, NOW)
    expect(matcher.test(row({ depletionInDays: 7 }))).toBe(true)
    expect(matcher.test(row({ depletionInDays: 20 }))).toBe(false)
    expect(matcher.test(row({ depletionInDays: null }))).toBe(false)
  })

  it("무연락 N일+ — 연락 기록 없는 행도 포함", () => {
    const [matcher] = buildSegmentMatchers({ noContactDays: 30 }, NOW)
    expect(matcher.test(row({ lastContactAt: iso(-40) }))).toBe(true)
    expect(matcher.test(row({ lastContactAt: iso(-3) }))).toBe(false)
    expect(matcher.test(row({ lastContactAt: null }))).toBe(true)
  })

  it("무연락 N일+ 은 종료 행을 뺀다 — '30일+ 미접촉' 저장 뷰와 같은 정의(isNoContactForDays)라 같은 건수", () => {
    const [matcher] = buildSegmentMatchers({ noContactDays: DORMANT_CONTACT_DAYS }, NOW)
    expect(matcher.test(row({ lifecycle: "closed", lastContactAt: null }))).toBe(false)
    expect(matcher.test(row({ lifecycle: "closed", lastContactAt: iso(-90) }))).toBe(false)
    expect(isNoContactForDays({ lifecycle: "closed", lastContactAt: null }, 30, NOW)).toBe(false)

    const rows = [
      row({ lifecycle: "closed", lastContactAt: null }),
      row({ lifecycle: "closed", lastContactAt: iso(-45) }),
      row({ lifecycle: "active_lead", lastContactAt: null }),
      row({ lifecycle: "active_account", lastContactAt: iso(-31) }),
      row({ lifecycle: "account_risk", lastContactAt: iso(-29.9) }),
      row({ lifecycle: "new_lead", lastContactAt: iso(-30) }),
    ]
    const chipCount = rows.filter((candidate) => matcher.test(candidate)).length
    const viewCount = rows.filter((candidate) =>
      matchesSavedView(candidate as unknown as CrmUnifiedCustomerRow, "dormant", new Set(), NOW)
    ).length
    expect(chipCount).toBe(3)
    expect(viewCount).toBe(chipCount)
  })

  it("무연락 판정은 경과 일수(24시간) 기준 — KST 달력일 표기와 별개로 의미를 유지한다", () => {
    // 29.9일 경과: 표시 문구는 달력일로 "30일 전"일 수 있어도 30일+ 판정은 아니다.
    expect(isNoContactForDays({ lastContactAt: iso(-29.9) }, 30, NOW)).toBe(false)
    expect(isNoContactForDays({ lastContactAt: iso(-30) }, 30, NOW)).toBe(true)
  })

  it("잔액(¥) — NEO 행만(통화별 축), 전환 고객·리드는 걸리지 않는다", () => {
    const [matcher] = buildSegmentMatchers({ minBalanceCny: 10_000 }, NOW)
    expect(matcher.test(row({ balance: 12_000 }))).toBe(true)
    expect(matcher.test(row({ balance: 9_000 }))).toBe(false)
    expect(matcher.test(row({ source: "customer", balance: 50_000 }))).toBe(false)
  })

  it("종류·위험·과금 — 값 목록 OR", () => {
    expect(rowMatchesSegmentSpec(row({ source: "lead" }), { kinds: ["lead", "customer"] }, NOW)).toBe(true)
    expect(rowMatchesSegmentSpec(row(), { kinds: ["lead"] }, NOW)).toBe(false)
    expect(rowMatchesSegmentSpec(row({ riskLevel: "soon" }), { risk: ["urgent", "soon"] }, NOW)).toBe(true)
    expect(rowMatchesSegmentSpec(row({ riskLevel: null }), { risk: ["urgent"] }, NOW)).toBe(false)
    expect(rowMatchesSegmentSpec(row({ billingMode: "consumption" }), { billing: ["consumption"] }, NOW)).toBe(true)
  })

  it("담당·지역 — 대소문자 무시, '없음' 토큰은 미배정·지역 미지정", () => {
    expect(rowMatchesSegmentSpec(row({ ownerKeys: ["kim", "neo-1"] }), { owners: ["KIM"] }, NOW)).toBe(true)
    expect(rowMatchesSegmentSpec(row({ ownerKeys: [] }), { owners: [SEGMENT_NONE_TOKEN] }, NOW)).toBe(true)
    expect(rowMatchesSegmentSpec(row({ ownerKeys: ["kim"] }), { owners: [SEGMENT_NONE_TOKEN] }, NOW)).toBe(false)
    expect(rowMatchesSegmentSpec(row({ regionLabel: "부산" }), { regions: ["부산", "경기"] }, NOW)).toBe(true)
    expect(rowMatchesSegmentSpec(row({ regionLabel: null }), { regions: [SEGMENT_NONE_TOKEN] }, NOW)).toBe(true)
  })

  it("담당 '미배정'은 NEO 자리표시 이름('담당 미지정')만 있는 행도 잡는다", () => {
    // NEO 는 담당 id 가 없으면 ownerName "담당 미지정" 을 붙여 ownerKeys 가 비지 않는다(owner-names.ts).
    const neoUnassigned = row({ ownerKeys: ["담당 미지정"] })
    expect(rowMatchesSegmentSpec(neoUnassigned, { owners: [SEGMENT_NONE_TOKEN] }, NOW)).toBe(true)
    // 폴드로 실제 담당이 붙었으면 미배정이 아니다.
    expect(rowMatchesSegmentSpec(row({ ownerKeys: ["담당 미지정", "김담당"] }), { owners: [SEGMENT_NONE_TOKEN] }, NOW)).toBe(false)
    expect(rowMatchesSegmentSpec(row({ ownerKeys: ["담당 미지정", "김담당"] }), { owners: ["김담당"] }, NOW)).toBe(true)
    expect(isUnassignedOwnerKey(" 담당  미지정 ")).toBe(true)
    expect(isUnassignedOwnerKey("")).toBe(true)
    expect(isUnassignedOwnerKey("김담당")).toBe(false)
    expect(assignedOwnerKeys(["담당 미지정", "neo-1", " "])).toEqual(["neo-1"])
  })

  it("자리표시 이름으로 온 담당 조건(옛 딥링크)은 미배정 토큰으로 접힌다", () => {
    expect(parseSegmentSpec(new URLSearchParams("owners=담당 미지정&owners=__none"))).toEqual({ owners: [SEGMENT_NONE_TOKEN] })
    expect(normalizeSegmentSpec({ owners: ["담당 미지정", "김담당"] }).owners).toEqual([SEGMENT_NONE_TOKEN, "김담당"].sort())
    expect(describeSegmentSpec({ owners: ["담당 미지정"] })).toEqual(["담당 미배정"])
  })

  it("담당 선택지 값(segmentOwnerFacetValues) — 매처와 같은 미배정 규칙이라 '담당 미지정'이 따로 나오지 않는다", () => {
    expect(segmentOwnerFacetValues({ ownerName: "담당 미지정", ownerKeys: ["담당 미지정"] })).toEqual([
      { value: SEGMENT_NONE_TOKEN, label: "미배정" },
    ])
    expect(segmentOwnerFacetValues({ ownerName: null, ownerKeys: [] })).toEqual([{ value: SEGMENT_NONE_TOKEN, label: "미배정" }])
    expect(segmentOwnerFacetValues({ ownerName: " 박담당 ", ownerKeys: ["박담당", "neo-1"] })).toEqual([
      { value: "박담당", label: "박담당" },
    ])
    // 이름은 자리표시지만 폴드로 승계한 실제 담당 키가 있으면 그 키로 센다(매처도 그 키로 잡는다).
    expect(segmentOwnerFacetValues({ ownerName: "담당 미지정", ownerKeys: ["담당 미지정", "김담당"] })).toEqual([
      { value: "김담당", label: "김담당" },
    ])
    // 선택지 "미배정" ⇔ owners=[__none] 매처
    const [matcher] = buildSegmentMatchers({ owners: [SEGMENT_NONE_TOKEN] }, NOW)
    for (const candidate of [
      { ownerName: "담당 미지정", ownerKeys: ["담당 미지정"] },
      { ownerName: null, ownerKeys: [] },
      { ownerName: "박담당", ownerKeys: ["박담당"] },
      { ownerName: "담당 미지정", ownerKeys: ["담당 미지정", "김담당"] },
    ]) {
      const facetNone = segmentOwnerFacetValues(candidate).some((facet) => facet.value === SEGMENT_NONE_TOKEN)
      expect(matcher.test(row({ ownerKeys: candidate.ownerKeys }))).toBe(facetNone)
    }
  })

  it("라벨 모두/하나 — 대소문자·공백 무시", () => {
    const tagged = row({ tags: ["VIP", "재계약"] })
    expect(rowMatchesSegmentSpec(tagged, { tagsAll: ["vip", "재계약"] }, NOW)).toBe(true)
    expect(rowMatchesSegmentSpec(tagged, { tagsAll: ["vip", "업셀"] }, NOW)).toBe(false)
    expect(rowMatchesSegmentSpec(tagged, { tagsAny: ["업셀", " vip "] }, NOW)).toBe(true)
  })

  it("조건끼리는 AND", () => {
    const candidate = row({ expireAt: iso(10), riskLevel: "urgent", ownerKeys: ["kim"] })
    expect(rowMatchesSegmentSpec(candidate, { expDays: 14, risk: ["urgent"], owners: ["kim"] }, NOW)).toBe(true)
    expect(rowMatchesSegmentSpec(candidate, { expDays: 14, risk: ["normal"] }, NOW)).toBe(false)
    expect(rowMatchesSegmentSpec(candidate, {}, NOW)).toBe(true)
  })
})

describe("화면 조작 헬퍼·칩 선택지", () => {
  it("숫자 칩은 같은 값을 다시 누르면 끈다", () => {
    const on = toggleSegmentNumber({}, "expDays", 30)
    expect(on).toEqual({ expDays: 30 })
    expect(toggleSegmentNumber(on, "expDays", 30)).toEqual({})
    expect(toggleSegmentNumber(on, "expDays", 14)).toEqual({ expDays: 14 })
  })

  it("목록 칩 켜기/끄기", () => {
    const on = toggleSegmentListValue({}, "risk", "urgent")
    expect(on).toEqual({ risk: ["urgent"] })
    expect(toggleSegmentListValue(on, "risk", "urgent")).toEqual({})
  })

  it("칩 선택지 = 프리셋 + 켜진 비프리셋 숫자 + enum 값", () => {
    const options = segmentChipOptions({ expDays: 45 })
    expect(options).toContainEqual({ key: "expDays", value: 14 })
    expect(options).toContainEqual({ key: "expDays", value: 45 })
    expect(options).toContainEqual({ key: "risk", value: "urgent" })
    expect(segmentOptionKey("expDays", 30)).toBe("expDays:30")
    expect(singleOptionSpec("risk", "soon")).toEqual({ risk: ["soon"] })
    expect(singleOptionSpec("noContactDays", 30)).toEqual({ noContactDays: 30 })
  })

  it("라벨 방식은 스펙(URL)에서 파생 — 고른 라벨이 없을 때만 화면 선호(fallback)", () => {
    expect(segmentTagMode({ tagsAll: ["VIP"] }, "any")).toBe("all")
    expect(segmentTagMode({ tagsAny: ["VIP"] }, "all")).toBe("any")
    expect(segmentTagMode({}, "all")).toBe("all")
    expect(segmentTagMode(null, "any")).toBe("any")
    // 정규화 전 스펙에 둘 다 있으면 정규화 규칙과 같게 all.
    expect(segmentTagMode({ tagsAll: ["A"], tagsAny: ["B"] }, "any")).toBe("all")
  })

  it("tagsAll·tagsAny 가 함께 오면 tagsAll 하나로 합친다(서버·화면 같은 규칙)", () => {
    expect(normalizeSegmentSpec({ tagsAll: ["VIP"], tagsAny: ["재계약", "vip"] })).toEqual({ tagsAll: ["VIP", "재계약"] })
    const params = new URLSearchParams("tagsAll=VIP&tagsAny=재계약")
    expect(parseSegmentSpec(params)).toEqual({ tagsAll: ["VIP", "재계약"] })
    // 한쪽만 오면 그대로.
    expect(parseSegmentSpec(new URLSearchParams("tagsAny=VIP&tagsAny=재계약"))).toEqual({ tagsAny: ["VIP", "재계약"] })
  })

  it("방식 전환은 고른 라벨을 새 키로 옮긴다", () => {
    expect(switchSegmentTagMode({ tagsAny: ["VIP", "재계약"], expDays: 30 }, "all")).toEqual({ expDays: 30, tagsAll: ["VIP", "재계약"] })
    expect(switchSegmentTagMode({ tagsAll: ["VIP"] }, "any")).toEqual({ tagsAny: ["VIP"] })
    expect(switchSegmentTagMode({ expDays: 30 }, "all")).toEqual({ expDays: 30 })
  })

  it("켜진 조건 문구와 순서", () => {
    const spec = { tagsAny: ["VIP"], expDays: 30, risk: ["urgent" as const], owners: [SEGMENT_NONE_TOKEN] }
    expect(activeSegmentConditionKeys(spec)).toEqual(["expDays", "risk", "owners", "tagsAny"])
    expect(describeSegmentSpec(spec)).toEqual(["만료 30일 이내", "위험 긴급", "담당 미배정", "라벨 하나 VIP"])
    expect(describeSegmentSpec({ minBalanceCny: 50_000 })).toEqual(["잔액 ¥5만+"])
  })
})

describe("원천 고객 화면(NEO 동기화 목록) — 60일 창은 '60일 내 만료'로 부른다", () => {
  it("'만료 임박' 단어를 60일 창에 쓰지 않고 SSOT 상수로 필터·라벨을 만든다", async () => {
    const { readFileSync } = await import("node:fs")
    const { resolve } = await import("node:path")
    const raw = readFileSync(resolve(process.cwd(), "components/admin/crm/NeoCrmCustomersClient.tsx"), "utf8")
    // 주석 줄은 빼고 화면 문자열만 본다(주석은 "만료 임박과 다른 뜻"이라고 설명한다).
    const source = raw
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n")
    expect(source).not.toContain("만료 임박")
    expect(source).not.toContain('"만료임박"')
    expect(source).toContain("NEO_SOURCE_EXPIRING_WINDOW_DAYS")
    expect(source).toContain("d < 0 || d > NEO_SOURCE_EXPIRING_WINDOW_DAYS")
    expect(source).toContain("일 내 만료만")
  })
})
