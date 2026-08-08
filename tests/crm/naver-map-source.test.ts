import { describe, expect, it } from "vitest"

import {
  assessNaverMapPlaceMatch,
  deriveNaverMapRegion,
  parseNaverMapFolderId,
  parseNaverMapImportText,
  type NaverMapMatchTarget,
} from "@/lib/crm/naver-map-source"
import { summarizeNaverMapRows } from "@/lib/crm/naver-map-region-summary"

function target(
  targetId: string,
  label: string,
  source: NaverMapMatchTarget["source"] = "neo",
  regionLabel: string | null = null
): NaverMapMatchTarget {
  return {
    source,
    targetType: source === "rev" ? "rev_deal" : "external_account",
    targetId,
    label,
    regionLabel,
  }
}

describe("deriveNaverMapRegion", () => {
  it("adds a 17-province label and district label from a Seoul address", () => {
    expect(deriveNaverMapRegion("서울특별시 강남구 테헤란로 123")).toEqual({
      provinceRaw: "서울특별시",
      regionLabel: "서울",
      localityLabel: "강남구",
      source: "address",
    })
  })

  it("keeps two locality levels for a provincial address", () => {
    expect(deriveNaverMapRegion("경기도 수원시 영통구 광교로 1")).toMatchObject({
      regionLabel: "경기",
      localityLabel: "수원시 영통구",
    })
  })

  it("splits Naver's combined Jeonnam-Gwangju label conservatively", () => {
    expect(deriveNaverMapRegion("전남광주통합 서구 상무대로 1").regionLabel).toBe("광주")
    expect(deriveNaverMapRegion("전남광주통합 광양시 중마로 1").regionLabel).toBe("전남")
  })
})

describe("parseNaverMapImportText", () => {
  it("parses headered TSV copied from a place list", () => {
    expect(
      parseNaverMapImportText(
        "이름\t분류\t주소\n알파학원\t수학교육\t서울특별시 강남구 역삼동\n베타교육\t교육\t경기도 성남시 분당구"
      )
    ).toEqual([
      { name: "알파학원", category: "수학교육", address: "서울특별시 강남구 역삼동" },
      { name: "베타교육", category: "교육", address: "경기도 성남시 분당구" },
    ])
  })

  it("parses JSON aliases and rejects incomplete rows", () => {
    expect(
      parseNaverMapImportText(
        JSON.stringify([{ placeName: "감마학원", category: "교육", addressRaw: "부산광역시 해운대구" }])
      )
    ).toEqual([{ name: "감마학원", category: "교육", address: "부산광역시 해운대구" }])

    expect(() => parseNaverMapImportText('[{"name":"주소 없는 학원"}]')).toThrow("이름 또는 주소")
  })
})

describe("parseNaverMapFolderId", () => {
  it("accepts only Naver shared-place folder URLs", () => {
    const id = "d34ac347a4754d119e80bb77fb8acfcf"
    expect(
      parseNaverMapFolderId(`https://map.naver.com/p/favorite/sharedPlace/folder/${id}?c=9.59,0,0,0,dh`)
    ).toBe(id)
    expect(parseNaverMapFolderId(`https://example.com/p/favorite/sharedPlace/folder/${id}`)).toBeNull()
    expect(parseNaverMapFolderId("https://map.naver.com/p/search/학원")).toBeNull()
  })
})

describe("assessNaverMapPlaceMatch", () => {
  it("marks a unique exact CRM name as a prelink candidate", () => {
    const result = assessNaverMapPlaceMatch(
      { name: "알파수학학원", regionLabel: "서울" },
      [target("neo-1", "알파수학", "neo", "서울"), target("neo-2", "완전히다른교육", "neo", "부산")],
      []
    )

    expect(result.status).toBe("prelinked")
    expect(result.candidate).toMatchObject({ targetId: "neo-1", confidence: 0.96, sameRegion: true })
    expect(result.confidenceGap).toBeGreaterThanOrEqual(0.15)
  })

  it("keeps duplicate exact names in review", () => {
    const result = assessNaverMapPlaceMatch(
      { name: "알파학원", regionLabel: "서울" },
      [target("neo-1", "알파학원"), target("neo-2", "알파학원")],
      []
    )

    expect(result.status).toBe("review")
    expect(result.confidenceGap).toBe(0)
  })

  it("uses REV as review evidence without treating it as the CRM target", () => {
    const result = assessNaverMapPlaceMatch(
      { name: "베타어학원", regionLabel: "경기" },
      [],
      [target("rev-1", "베타학원", "rev", "경기")]
    )

    expect(result.status).toBe("review")
    expect(result.candidate).toBeNull()
    expect(result.revEvidence).toMatchObject({ targetId: "rev-1", sameRegion: true })
  })

  it("leaves weak names unmatched", () => {
    const result = assessNaverMapPlaceMatch(
      { name: "알파교육", regionLabel: "서울" },
      [target("neo-1", "오메가스쿨")],
      [target("rev-1", "델타센터", "rev")]
    )

    expect(result.status).toBe("unmatched")
  })
})

describe("summarizeNaverMapRows", () => {
  it("uses only active rows and keeps each match status by region", () => {
    const summary = summarizeNaverMapRows([
      { regionLabel: "서울", isStale: false, matchStatus: "linked" },
      { regionLabel: "서울", isStale: false, matchStatus: "review" },
      { regionLabel: "경기", isStale: false, matchStatus: "prelinked" },
      { regionLabel: "경기", isStale: true, matchStatus: "unmatched" },
    ])

    expect(summary).toMatchObject({
      total: 4,
      active: 3,
      stale: 1,
      linked: 1,
      prelinked: 1,
      review: 1,
      unmatched: 0,
    })
    expect(summary.regions).toEqual([
      { label: "서울", count: 2, linked: 1, prelinked: 0, review: 1, unmatched: 0 },
      { label: "경기", count: 1, linked: 0, prelinked: 1, review: 0, unmatched: 0 },
    ])
  })
})
