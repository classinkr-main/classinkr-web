import { describe, expect, it } from "vitest"
import {
  filterRowsByRegion,
  isOffMapRegion,
  mapLabelOf,
  rankRegions,
  regionGoalCoverage,
  regionSelectionKey,
} from "@/lib/branch/region-heatmap"

describe("지도 밖 판정", () => {
  it("시도·시군구는 지도 안, 온라인·해외는 지도 밖", () => {
    expect(isOffMapRegion("서울")).toBe(false)
    expect(mapLabelOf("수원")).toBe("경기")
    expect(isOffMapRegion("온라인")).toBe(true)
    expect(isOffMapRegion("해외")).toBe(true)
    expect(isOffMapRegion(null)).toBe(true)
  })
})

describe("선택 키·거르기", () => {
  it("지도 지역은 표준 라벨로, 지도 밖 지역은 원문으로 키가 된다", () => {
    expect(regionSelectionKey("수원")).toBe("경기")
    expect(regionSelectionKey(" 온라인 ")).toBe("온라인")
    expect(regionSelectionKey("")).toBeNull()
  })
  const rows = [
    { customer: "a", region: "서울" as string | null },
    { customer: "b", region: "수원" as string | null },
    { customer: "c", region: "경기" as string | null },
    { customer: "d", region: "온라인" as string | null },
    { customer: "e", region: null as string | null },
  ]
  it("key가 null이면 전체", () => {
    expect(filterRowsByRegion(rows, null)).toBe(rows)
  })
  it("시군구는 시도로 묶여 걸러진다", () => {
    expect(filterRowsByRegion(rows, "경기").map((r) => r.customer)).toEqual(["b", "c"])
  })
  it("지도 밖 지역도 걸러진다", () => {
    expect(filterRowsByRegion(rows, "온라인").map((r) => r.customer)).toEqual(["d"])
  })
})

describe("순위", () => {
  const rows = [
    { region: "서울", expected: 100, progress: 10 },
    { region: "온라인", expected: 150, progress: 0 },
    { region: "경기", expected: 100, progress: 50 },
  ]
  it("매출 순은 지도 밖 지역을 같은 줄에 포함하고 원본을 바꾸지 않는다", () => {
    expect(rankRegions(rows, "revenue").map((r) => r.region)).toEqual(["온라인", "경기", "서울"])
    expect(rows[0].region).toBe("서울")
  })
  it("달성률 순", () => {
    expect(rankRegions(rows, "progress").map((r) => r.region)).toEqual(["경기", "서울", "온라인"])
  })
})

describe("지역 목표 유무", () => {
  it("대부분 0이면 달성률 보기를 끈다", () => {
    const rows = [{ target: 10 }, { target: 0 }, { target: 0 }, { target: 0 }]
    expect(regionGoalCoverage(rows)).toEqual({ withGoal: 1, total: 4, progressViewUsable: false })
  })
  it("절반 이상 있으면 켠다, 빈 목록은 끈다", () => {
    expect(regionGoalCoverage([{ target: 1 }, { target: 0 }]).progressViewUsable).toBe(true)
    expect(regionGoalCoverage([]).progressViewUsable).toBe(false)
  })
})
