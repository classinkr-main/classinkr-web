import { describe, expect, it } from "vitest"
import {
  emailCampaignLabel,
  emptyCampaignLinkLabels,
  eventLabel,
  labelSnippet,
  metaCampaignLabel,
  smsCampaignLabel,
  withLinkLabels,
} from "@/lib/marketing/campaign-labels"
import type { CampaignLink, CampaignRefType } from "@/lib/types/marketing-campaign"

/*
 * 링크 라벨 계약. 라벨은 "링크 피커에서 고를 때"와 "붙인 뒤 상세/목록에서 볼 때" 동일해야 하므로
 * 순수 함수 한 곳(lib/marketing/campaign-labels.ts)에서만 만든다.
 * 정직 규칙: 조회된 행이 없으면 label 을 아예 붙이지 않는다(UI 는 raw refId 폴백) — 지어내지 않는다.
 */

function link(refType: CampaignRefType, refId: string): CampaignLink {
  return { id: `link-${refType}-${refId}`, campaignId: "camp-1", refType, refId, createdAt: "2026-07-24" }
}

describe("라벨 포맷터", () => {
  it("이메일: subject 를 트림해 쓰고, 비면 id 기반 폴백", () => {
    expect(emailCampaignLabel({ id: 9, subject: "  7월 뉴스레터  " })).toBe("7월 뉴스레터")
    expect(emailCampaignLabel({ id: 9, subject: "   " })).toBe("(제목 없음) #9")
    expect(emailCampaignLabel({ id: "ec-9", subject: null })).toBe("(제목 없음) #ec-9")
  })

  it("문자: 본문을 한 줄 스니펫으로 줄이고, 비면 id 기반 폴백", () => {
    expect(smsCampaignLabel({ id: 3, message: " 개학  특가\n안내 " })).toBe("개학 특가 안내")
    expect(smsCampaignLabel({ id: 3, message: "   " })).toBe("문자 #3")
    expect(smsCampaignLabel({ id: 3, message: null })).toBe("문자 #3")
  })

  it("문자: 40자를 넘으면 말줄임", () => {
    const label = smsCampaignLabel({ id: 3, message: "가".repeat(50) })
    expect(label).toBe(`${"가".repeat(40)}…`)
    expect(labelSnippet("짧음")).toBe("짧음")
  })

  it("행사·Meta: title/name 우선, 비면 id 폴백", () => {
    expect(eventLabel({ id: "ev-1", title: " 여름 세미나 " })).toBe("여름 세미나")
    expect(eventLabel({ id: "ev-1", title: null })).toBe("행사 ev-1")
    expect(metaCampaignLabel({ id: "23851", name: " 리드 캠페인 " })).toBe("리드 캠페인")
    expect(metaCampaignLabel({ id: "23851", name: null })).toBe("23851")
  })
})

describe("withLinkLabels (링크 라벨 enrichment)", () => {
  it("해석된 refId 에만 label 을 붙인다 — 미해석은 label 키 자체가 없다(raw id 폴백)", () => {
    const labels = emptyCampaignLinkLabels()
    labels.email_campaign["e-1"] = "7월 뉴스레터"
    labels.meta_campaign["m-1"] = "리드 캠페인"

    const out = withLinkLabels(
      [link("email_campaign", "e-1"), link("email_campaign", "e-삭제됨"), link("meta_campaign", "m-1")],
      labels,
    )

    expect(out[0].label).toBe("7월 뉴스레터")
    // 실행이 삭제됐거나 Meta 조회 지평 밖 → 라벨을 지어내지 않는다.
    expect(out[1].label).toBeUndefined()
    expect("label" in out[1]).toBe(false)
    expect(out[2].label).toBe("리드 캠페인")
  })

  it("refType 이 다르면 같은 id 라도 라벨을 빌려 쓰지 않는다", () => {
    const labels = emptyCampaignLinkLabels()
    labels.email_campaign["42"] = "이메일 제목"
    const out = withLinkLabels([link("sms_campaign", "42")], labels)
    expect(out[0].label).toBeUndefined()
  })

  it("입력 배열·원소를 변형하지 않는다(새 객체 반환)", () => {
    const labels = emptyCampaignLinkLabels()
    labels.event["ev-1"] = "여름 세미나"
    const input = [link("event", "ev-1")]
    const out = withLinkLabels(input, labels)
    expect(input[0].label).toBeUndefined()
    expect(out[0]).not.toBe(input[0])
    expect(out[0].label).toBe("여름 세미나")
  })
})
