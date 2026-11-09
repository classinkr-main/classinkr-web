import { describe, expect, it } from "vitest"

import { leadMagnets } from "@/lib/lead-magnets"
import { getLeadMagnetItemCount } from "@/lib/lead-magnets-helpers"

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

describe("e-book lead magnets match their printed PDFs", () => {
  // PDF(scripts/lead-magnet-ebooks/*.html)와 자료 페이지가 같은 문항 수·채점 방향을 말해야 한다.
  it.each([
    ["academy-system-checklist", 24, "24문항"],
    ["electronic-whiteboard-classroom-checklist", 15, "15문항"],
  ])("%s", async (slug, count, label) => {
    const magnet = leadMagnets.find((item) => item.slug === slug)
    expect(magnet).toBeTruthy()
    if (!magnet) return

    expect(getLeadMagnetItemCount(magnet)).toBe(count)
    expect(magnet.formatLabel).toContain(label)
    expect(magnet.scoreBands.at(-1)?.range).toContain(`${count}개`)

    const { normalizeLeadMagnet } = await import("@/lib/repositories/lead-magnets")
    expect(normalizeLeadMagnet(magnet).scoringGuide).toEqual(magnet.scoringGuide)
    expect(magnet.scoringGuide?.read).toBeTruthy()
  })
})
