import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  buildCsFigmaGuideFromDigestEntry,
  parseCsFigmaDigestMarkdown,
} from "@/lib/cs-figma-digest"

const digestMarkdown = readFileSync(
  join(process.cwd(), "docs/active/cs-figma-board-digest-2026-06-21.md"),
  "utf8"
)

describe("CS Figma digest parser", () => {
  it("extracts every Figma capture with category, source file, and guide text", () => {
    const entries = parseCsFigmaDigestMarkdown(digestMarkdown)

    expect(entries).toHaveLength(107)
    expect(entries[0]).toMatchObject({
      categoryName: "녹화/현장수업",
      title: "클래스인 코스 입장 ~ 현장 녹화 확인 (IFP)",
      platform: "전자칠판(IFP)",
      audience: "교사",
      sourceImageFiles: ["12/17 실시간 수업 생성 ~ 현장 녹화 확인(IFP).png"],
      sourceDigestLineHint: expect.stringMatching(
        /^docs\/active\/cs-figma-board-digest-2026-06-21\.md:\d+$/
      ),
    })
    expect(entries[0]?.steps).toHaveLength(8)
    expect(entries[0]?.tips.length).toBeGreaterThan(0)
    expect(entries[0]?.screenDescription).toContain("클래스인 대시보드 화면")
  })

  it("turns uncategorized digest captures into 3-level chatbot guides", () => {
    const entries = parseCsFigmaDigestMarkdown(digestMarkdown)
    const invite = entries.find((entry) => entry.title.includes("코스 내 초대 활성화"))

    expect(invite).toBeTruthy()
    const guide = buildCsFigmaGuideFromDigestEntry(invite!)

    expect(guide).toMatchObject({
      title: "코스 내 초대 활성화(QR, Link 등)",
      category: "admin",
      docCategory: "admin",
      sourceImageFiles: ["코스 내 초대 활성화(QR, Link 등)"],
    })
    expect(guide.steps).toHaveLength(3)
    expect(guide.steps[2]).toContain("코스 가입 허용")
    expect(guide.deepDive.map((item) => item.level)).toEqual(["1단계", "2단계", "3단계"])
    expect(guide.deepDive[0]?.checks.length).toBeGreaterThan(0)
    expect(guide.deepDive[2]?.body).toContain("원본 캡처")
  })
})
