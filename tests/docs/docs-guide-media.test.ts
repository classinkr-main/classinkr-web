import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { listDocs } from "@/lib/docs"
import { DOC_GUIDE_MEDIA } from "@/lib/docs-guide-media"

// 공개 문서의 사진 설명(alt·caption)에 내부 작업 표현이나 예시 고객 식별자가 남지 않게 한다.
const FORBIDDEN_TEXT_RE = /figma|피그마|캡처|캡쳐|\bCS\b|학원\s?[A-Z](?![A-Za-z])|TBD|준비 중/i

describe("docs guide media map", () => {
  const docs = listDocs()
  const byKey = new Map(docs.map((doc) => [`${doc.category}/${doc.slug}`, doc]))

  it("points only at existing docs and section headings", () => {
    const problems: string[] = []
    for (const [docKey, sections] of Object.entries(DOC_GUIDE_MEDIA)) {
      const doc = byKey.get(docKey)
      if (!doc) {
        problems.push(`문서 없음: ${docKey}`)
        continue
      }
      const headings = new Set(doc.sections.map((section) => section.heading))
      for (const heading of Object.keys(sections)) {
        if (!headings.has(heading)) problems.push(`섹션 없음: ${docKey} → ${heading}`)
      }
    }
    expect(problems).toEqual([])
  })

  it("uses image files that exist with size and description", () => {
    const problems: string[] = []
    for (const [docKey, sections] of Object.entries(DOC_GUIDE_MEDIA)) {
      for (const [heading, media] of Object.entries(sections)) {
        for (const item of media) {
          const where = `${docKey} → ${heading} → ${item.src}`
          if (!item.src.startsWith("/")) problems.push(`로컬 경로가 아님: ${where}`)
          else if (!existsSync(path.join("public", item.src))) problems.push(`파일 없음: ${where}`)
          if (!item.alt?.trim()) problems.push(`alt 없음: ${where}`)
          if (!(Number.isInteger(item.width) && Number.isInteger(item.height) && item.width! > 0 && item.height! > 0)) {
            problems.push(`크기 없음: ${where}`)
          }
          if (FORBIDDEN_TEXT_RE.test(`${item.alt} ${item.caption ?? ""}`)) problems.push(`내부 표현: ${where}`)
        }
      }
    }
    expect(problems).toEqual([])
  })

  it("records every guide image in a shot spec", () => {
    const specDir = path.join("scripts", "docs-guide-shots")
    const specOuts = new Set<string>()
    for (const group of ["start", "admin", "teacher", "student", "product", "troubleshooting", "troubleshooting-recording", "cs-usage"]) {
      const file = path.join(specDir, `${group}.json`)
      const spec = JSON.parse(readFileSync(file, "utf8")) as { shots: { out: string }[] }
      for (const shot of spec.shots) specOuts.add(shot.out)
    }
    const unrecorded: string[] = []
    for (const sections of Object.values(DOC_GUIDE_MEDIA)) {
      for (const media of Object.values(sections)) {
        for (const item of media) {
          if (item.src.startsWith("/docs/files/guides/") && !specOuts.has(item.src)) unrecorded.push(item.src)
        }
      }
    }
    expect(unrecorded).toEqual([])
  })

  it("attaches the mapped media to the built docs", () => {
    for (const [docKey, sections] of Object.entries(DOC_GUIDE_MEDIA)) {
      const doc = byKey.get(docKey)
      if (!doc) continue
      for (const [heading, media] of Object.entries(sections)) {
        const section = doc.sections.find((item) => item.heading === heading)
        const srcs = new Set(section?.media?.map((item) => item.src))
        for (const item of media) expect(srcs.has(item.src)).toBe(true)
      }
    }
  })
})
