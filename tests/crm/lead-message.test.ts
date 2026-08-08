import { describe, expect, it } from "vitest"

import { deriveLeadRegionLabel, parseLeadMessage } from "@/lib/crm/lead-message"

const META_MESSAGE = [
  "Meta Lead Ads",
  "leadgen_id=2188813785649840",
  "page_id=108328572271615",
  "form_id=808953012240033",
  "campaign=오프라인 HW/SW",
  "adset=교실녹화기능광고",
  "ad=교실녹화기능광고",
  "fields=full_name: 최형우 / company_name: 메타A학원 / phone_number: +821023656411 / email: test@example.com / city: Cheongju",
].join("\n")

describe("parseLeadMessage", () => {
  it("Meta 원문을 광고·제출 응답·기술 식별자로 분리한다", () => {
    const parsed = parseLeadMessage(META_MESSAGE)

    expect(parsed?.kind).toBe("meta")
    expect(parsed?.attribution).toEqual(expect.arrayContaining([
      { key: "campaign", label: "캠페인", value: "오프라인 HW/SW" },
      { key: "ad", label: "광고", value: "교실녹화기능광고" },
    ]))
    expect(parsed?.answers.find((item) => item.key === "city")).toMatchObject({
      label: "지역 응답",
      value: "Cheongju",
    })
    expect(parsed?.identifiers).toHaveLength(3)
    expect(parsed?.raw).toBe(META_MESSAGE)
  })

  it("일반 문의 메시지는 원문 그대로 보존한다", () => {
    expect(parseLeadMessage("도입 상담을 원합니다.\n오후 연락 부탁드립니다.")).toMatchObject({
      kind: "plain",
      raw: "도입 상담을 원합니다.\n오후 연락 부탁드립니다.",
    })
  })
})

describe("deriveLeadRegionLabel", () => {
  it("구조화 branch를 우선하고 영문 Meta city를 17개 시도 라벨로 변환한다", () => {
    expect(deriveLeadRegionLabel({ branch: "서울특별시 강남구", message: META_MESSAGE })).toBe("서울")
    expect(deriveLeadRegionLabel({ message: META_MESSAGE })).toBe("충북")
  })

  it("근거가 없으면 확정 지역을 만들지 않는다", () => {
    expect(deriveLeadRegionLabel({ message: "일반 문의입니다." })).toBeNull()
  })
})
