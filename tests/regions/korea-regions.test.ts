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

describe("normalizeRegionLabel — 로마자 시군구", () => {
  it.each([
    // 실측(2026-08-28 프로덕션 leads.branch)에서 미매칭이던 값들
    ["Suwon", "경기"],
    ["Changwon", "경남"],
    ["Cheongju", "충북"],
    ["Uijeongbu", "경기"],
    ["Icheon", "경기"],
    ["Gwangmyeong", "경기"],
    ["Siheung", "경기"],
    ["Miryang", "경남"],
    ["Gyeryong", "충남"],
    // 영문 행정 접미사
    ["Gwangjin District", "서울"],
    ["Yeongdeungpo District", "서울"],
    ["Suwon-si", "경기"],
    ["Gangnam-gu", "서울"],
    ["Ulleung-gun", "경북"],
    // 로마자 표기 이형 — 영/용을 둘 다 Young으로 적는 관행
    ["Youngin", "경기"],
    ["Yongin", "경기"],
    // 대소문자 무시
    ["POHANG", "경북"],
    ["gimhae", "경남"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeRegionLabel(input)).toBe(expected)
  })

  it("모호 토큰은 로마자로 써도 매칭하지 않는다", () => {
    for (const input of ["Jung", "Jung-gu", "Seo-gu", "Dong-gu", "Nam-gu", "Buk-gu", "Gangseo", "Goseong"]) {
      expect(normalizeRegionLabel(input), input).toBeNull()
    }
  })

  it("해외 지명은 계속 매칭되지 않는다", () => {
    // 실측 유입값 — 캄보디아·우즈베키스탄·네팔·가나·미국
    for (const input of ["Battambang", "Fergana", "Phidim", "Tema", "Detroit"]) {
      expect(normalizeRegionLabel(input), input).toBeNull()
    }
  })

  it("한글 표와 로마자 표가 같은 시군구를 같은 시도로 보낸다", () => {
    const pairs: Array<[string, string]> = [
      ["수원", "Suwon"],
      ["창원", "Changwon"],
      ["청주", "Cheongju"],
      ["서귀포", "Seogwipo"],
      ["해운대", "Haeundae"],
      ["미추홀", "Michuhol"],
      ["울릉", "Ulleung"],
    ]
    for (const [ko, roman] of pairs) {
      expect(normalizeRegionLabel(roman), `${roman} vs ${ko}`).toBe(normalizeRegionLabel(ko))
    }
  })
})

describe("리드 유입 지역 정규화 수율 — 실측 회귀 고정", () => {
  // 2026-08-28 프로덕션 leads.branch 자유텍스트(값 → 건수). 보강 전 수율 78.6%.
  const LEAD_BRANCH: Record<string, number> = {
    Seoul: 16, 서울: 8, 부산: 3, Incheon: 3, 광주광역시: 3, seoul: 3,
    서울시: 2, Battambang: 2, Changwon: 2, 창원시: 2, Daejeon: 2, 인천: 2, 수원시: 2,
    구리시: 1, 전주시: 1, "서울 금천구": 1, "울산 중구": 1, Youngin: 1, 김해시: 1,
    "Gwangjin District": 1, Fergana: 1, 파주시: 1, 영주시: 1, Gwangmyeong: 1, Gyeryong: 1,
    Uijeongbu: 1, 인천시: 1, "Yeongdeungpo District": 1, 천안시: 1, 대구시: 1, 성북구: 1,
    하남시: 1, 포항: 1, Cheongju: 1, Icheon: 1, "경기도 성남": 1, 포항시: 1, 포천: 1,
    Sejong: 1, "경기도 동탄구": 1, Busan: 1, 김포: 1, "인천/미추홀구": 1, 남구: 1, 파주: 1,
    동구: 1, Phidim: 1, 대구: 1, Tema: 1, Miryang: 1, 창원: 1, 김해: 1, X: 1,
    진주: 1, Suwon: 1, Ulsan: 1, Daegu: 1, 경기도: 1, 서울시강남구: 1, Detroit: 1,
    Siheung: 1, 화성시: 1, 울산: 1, 강릉시: 1, 고양: 1, 강남구: 1,
  }

  it("지역 텍스트가 있는 103건 중 최소 94건을 시도로 접는다", () => {
    let matched = 0
    let total = 0
    const unmatched: string[] = []
    for (const [raw, count] of Object.entries(LEAD_BRANCH)) {
      total += count
      if (normalizeRegionLabel(raw)) matched += count
      else unmatched.push(raw)
    }

    expect(total).toBe(103)
    expect(matched).toBeGreaterThanOrEqual(94)
    // 남는 것은 해외·모호·무효뿐이어야 한다 — 국내 지명이 여기 섞이면 표에 구멍이 있다는 뜻.
    expect(new Set(unmatched)).toEqual(
      new Set(["Battambang", "Fergana", "Phidim", "Tema", "Detroit", "남구", "동구", "X"])
    )
  })
})
