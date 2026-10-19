import { describe, expect, it } from "vitest"
import { emptyRegionTally, tallyRegionValue, toRegionLayer } from "@/lib/crm/region-map-summary"

describe("CRM 지역별 고객 순위 및 집계", () => {
  it("고객별 건수를 시도 단위로 누적하고 상위 순위로 정렬한다", () => {
    const tally = emptyRegionTally()

    tallyRegionValue(tally, "서울", { id: "1", name: "메가스터디 강남", manager: "김철수", status: "계약 완료", detail: "대형" })
    tallyRegionValue(tally, "서울", { id: "2", name: "대성학원", manager: "이영희", status: "진행 중" })
    tallyRegionValue(tally, "서울", { id: "1", name: "메가스터디 강남", manager: "김철수" })
    tallyRegionValue(tally, "경기", { id: "3", name: "분당수학학원", manager: "김철수" })

    const layer = toRegionLayer("deal", "거래", "REV 딜 건수", tally)

    expect(layer.total).toBe(4)
    expect(layer.located).toBe(4)
    expect(layer.regions["서울"]).toBe(3)
    expect(layer.regions["경기"]).toBe(1)

    const seoulTop = layer.topCustomersByRegion?.["서울"]
    expect(seoulTop).toBeDefined()
    expect(seoulTop!.length).toBe(2)
    // 1위: 메가스터디 강남 (2건)
    expect(seoulTop![0].name).toBe("메가스터디 강남")
    expect(seoulTop![0].count).toBe(2)
    expect(seoulTop![0].manager).toBe("김철수")
    expect(seoulTop![0].status).toBe("계약 완료")
    expect(seoulTop![0].detail).toBe("대형")

    // 2위: 대성학원 (1건)
    expect(seoulTop![1].name).toBe("대성학원")
    expect(seoulTop![1].count).toBe(1)
  })

  it("고객 정보가 없는 기존 형식 데이터도 안전하게 집계된다", () => {
    const tally = emptyRegionTally()
    tallyRegionValue(tally, "부산")
    tallyRegionValue(tally, "온라인")
    tallyRegionValue(tally, "")

    const layer = toRegionLayer("deal", "거래", "REV 딜 건수", tally)
    expect(layer.total).toBe(3)
    expect(layer.located).toBe(1)
    expect(layer.nonGeo).toBe(1)
    expect(layer.unknown).toBe(1)
    expect(layer.regions["부산"]).toBe(1)
  })
})
