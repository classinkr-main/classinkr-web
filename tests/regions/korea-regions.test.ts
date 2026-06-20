import { describe, expect, it } from "vitest"

import {
  AMBIGUOUS_DISTRICT_NAMES,
  KOREA_PROVINCE_LABELS,
  KOREA_PROVINCES,
  PROVINCE_BY_CODE,
  buildRegionAliasSeed,
  isAmbiguousRegionToken,
  normalizeRegion,
  normalizeRegionLabel,
} from "@/lib/regions/korea-regions"

describe("KOREA_PROVINCES 표준", () => {
  it("정확히 17개 시도를 가진다", () => {
    expect(KOREA_PROVINCES).toHaveLength(17)
    expect(KOREA_PROVINCE_LABELS).toHaveLength(17)
  })

  it("코드와 라벨이 모두 유일하다", () => {
    expect(new Set(KOREA_PROVINCES.map((p) => p.code)).size).toBe(17)
    expect(new Set(KOREA_PROVINCE_LABELS).size).toBe(17)
  })
})

describe("normalizeRegionLabel — 시도 직접 매칭", () => {
  it.each([
    ["서울", "서울"],
    ["서울특별시", "서울"],
    ["서울시", "서울"],
    ["Seoul", "서울"],
    ["SEOUL", "서울"],
    ["11", "서울"],
    ["부산", "부산"],
    ["대구", "대구"],
    ["인천", "인천"],
    ["대전", "대전"],
    ["경기", "경기"],
    ["경기도", "경기"],
    ["제주", "제주"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeRegionLabel(input)).toBe(expected)
  })
})

describe("normalizeRegionLabel — 이형/구명칭", () => {
  it.each([
    ["충청북도", "충북"],
    ["충청남도", "충남"],
    ["전라북도", "전북"],
    ["전라남도", "전남"],
    ["경상북도", "경북"],
    ["경상남도", "경남"],
    ["강원도", "강원"],
    ["강원특별자치도", "강원"],
    ["전북특별자치도", "전북"],
    ["제주특별자치도", "제주"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeRegionLabel(input)).toBe(expected)
  })
})

describe("normalizeRegionLabel — 시군구 단독값을 상위 시도로", () => {
  it.each([
    ["강남", "서울"],
    ["강남구", "서울"],
    ["서초", "서울"],
    ["송파구", "서울"],
    ["수원", "경기"],
    ["수원시", "경기"],
    ["분당", "경기"],
    ["일산", "경기"],
    ["해운대", "부산"],
    ["군위", "대구"], // 2023년 경북→대구 편입
    ["군위군", "대구"],
    ["울주", "울산"],
    ["청주", "충북"],
    ["천안", "충남"],
    ["전주", "전북"],
    ["창원", "경남"],
    ["춘천", "강원"],
    ["서귀포", "제주"],
    ["서귀포시", "제주"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeRegionLabel(input)).toBe(expected)
  })
})

describe("normalizeRegionLabel — 부분일치(가장 앞 시도 채택)", () => {
  it.each([
    ["서울 강남구", "서울"],
    ["서울특별시 마포구", "서울"],
    ["경기도 광주시", "경기"], // 경기 광주 ≠ 광주광역시
    ["경기 성남시 분당구", "경기"],
    ["부산광역시 해운대구", "부산"],
    ["충청남도 천안시 서북구", "충남"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeRegionLabel(input)).toBe(expected)
  })
})

describe("normalizeRegionLabel — 모호/미매칭은 null", () => {
  it.each(["중구", "서구", "동구", "남구", "북구", "강서", "강서구", "고성", "고성군"])(
    "모호 토큰 %s → null",
    (input) => {
      expect(normalizeRegionLabel(input)).toBeNull()
    },
  )

  it.each(["", "   ", "독도", "해외", "ㅁㄴㅇ", "전국"])(
    "미매칭 %s → null",
    (input) => {
      expect(normalizeRegionLabel(input)).toBeNull()
    },
  )

  it("null/undefined → null", () => {
    expect(normalizeRegionLabel(null)).toBeNull()
    expect(normalizeRegionLabel(undefined)).toBeNull()
  })
})

describe("normalizeRegion — 구조화 결과", () => {
  it("강남 → 서울 시도 객체", () => {
    expect(normalizeRegion("강남")).toEqual({ code: "11", label: "서울", name: "서울특별시" })
  })

  it("경기도 광주시 → 경기 시도 객체", () => {
    expect(normalizeRegion("경기도 광주시")).toEqual({
      code: "41",
      label: "경기",
      name: "경기도",
    })
  })

  it("미매칭 → null", () => {
    expect(normalizeRegion("중구")).toBeNull()
  })
})

describe("buildRegionAliasSeed — DB 시드", () => {
  const rows = buildRegionAliasSeed()

  it("충분한 행을 만든다(시도 이형 + 시군구)", () => {
    expect(rows.length).toBeGreaterThan(250)
  })

  it("normalized 키가 모두 유일하다", () => {
    const keys = rows.map((r) => r.normalized)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("모든 regionCode 가 실재하는 시도 코드다", () => {
    for (const row of rows) {
      expect(PROVINCE_BY_CODE.has(row.regionCode)).toBe(true)
    }
  })

  it("모호 토큰은 시드에 포함하지 않는다", () => {
    const aliases = new Set(rows.map((r) => r.alias))
    for (const token of AMBIGUOUS_DISTRICT_NAMES) {
      expect(aliases.has(token)).toBe(false)
    }
  })

  it("대표 시군구가 올바른 시도로 매핑된다", () => {
    const byAlias = new Map(rows.map((r) => [r.alias, r.regionCode]))
    expect(byAlias.get("강남")).toBe("11") // 서울
    expect(byAlias.get("군위")).toBe("27") // 대구(2023 편입)
    expect(byAlias.get("수원")).toBe("41") // 경기
    expect(byAlias.get("서귀포")).toBe("50") // 제주
  })

  it("시드는 normalizeRegion 과 일치한다", () => {
    for (const row of rows) {
      expect(normalizeRegion(row.alias)?.code).toBe(row.regionCode)
    }
  })
})

describe("isAmbiguousRegionToken", () => {
  it("모호 토큰을 표시한다", () => {
    for (const token of AMBIGUOUS_DISTRICT_NAMES) {
      expect(isAmbiguousRegionToken(token)).toBe(true)
    }
  })

  it("명확한 토큰은 모호하지 않다", () => {
    expect(isAmbiguousRegionToken("강남")).toBe(false)
    expect(isAmbiguousRegionToken("서울")).toBe(false)
    expect(isAmbiguousRegionToken(null)).toBe(false)
  })
})
