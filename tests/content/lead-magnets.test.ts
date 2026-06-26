import { describe, expect, it } from "vitest"

import { getLeadMagnetItemCount, leadMagnets } from "@/lib/lead-magnets"

describe("lead magnet content quality", () => {
  it("keeps the pre-adoption resource as a self-assessment kit, not a thin checklist", () => {
    const magnet = leadMagnets.find(
      (item) => item.slug === "classin-pre-adoption-questions-checklist"
    )

    expect(magnet).toBeTruthy()
    if (!magnet) return

    const itemCount = getLeadMagnetItemCount(magnet)
    const sectionTitles = magnet.sections.map((section) => section.title)

    expect(magnet.title).toContain("자체평가")
    expect(magnet.formatLabel).toContain("43문항")
    expect(itemCount).toBeGreaterThanOrEqual(43)
    expect(sectionTitles).toContain("자체평가: 내부 준비도")
    expect(sectionTitles).toContain("쇼룸·온라인 데모 테스트")
    expect(sectionTitles).toContain("상담 후 의사결정 메모")
    expect(magnet.scoreBands.at(-1)?.range).toContain(`${itemCount}점`)
    expect(magnet.storyGuide?.title).toContain("가격표")
    expect(magnet.storyGuide?.beats).toHaveLength(4)
    expect(magnet.storyGuide?.takeaway).toContain("도입 설계")
    expect(magnet.pdfGuide?.howToUse.join(" ")).toContain(`${itemCount}개 문항`)
  })
})
