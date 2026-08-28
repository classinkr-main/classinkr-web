import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { buildContentJson, markdownToSections } from "@/lib/admin/docs-markdown"
import { listDocs, type DocArticle, type DocMedia, type DocSection } from "@/lib/docs"

/**
 * 어드민 편집기에서 "한 번 저장"했을 때 공개 문서 구조가 살아남는지 전수로 고정한다.
 *
 * 공개 페이지는 content_json.sections를 그대로 읽으므로(lib/docs-content.ts getSections),
 * 저장 한 번이 sections를 통째로 갈아끼운다. 그래서 실제 문서 전편을 시드와 같은 규칙으로
 * 마크다운화 → 파서 → 저장 결과까지 돌려 원본과 대조한다.
 */

// scripts/seed-docs.ts 의 직렬화 규칙 복제. 그 파일은 top-level main() 실행 스크립트라 import할 수 없어
// 규칙만 옮기고, 아래 "직렬화 규칙 드리프트" 테스트가 원본 소스와의 어긋남을 잡는다.
function sectionToMarkdown(section: DocSection) {
  const steps = section.steps?.map((step) => `- ${step}`).join("\n")
  const media = section.media
    ?.map((item) => {
      const title = item.caption ? ` "${item.caption}"` : ""
      return item.type === "image"
        ? `![${item.alt}](${item.src}${title})`
        : `[${item.alt}](${item.src}${title})`
    })
    .join("\n\n")
  return [`## ${section.heading}`, section.body, steps, media].filter(Boolean).join("\n\n")
}

function docToMarkdown(doc: DocArticle) {
  const resourceLines = doc.resources?.map(
    (resource) =>
      `- [${resource.label}](${resource.href})${resource.description ? ` - ${resource.description}` : ""}`
  )

  return [
    `# ${doc.title}`,
    doc.description,
    `대상: ${doc.audience}`,
    `업데이트: ${doc.updatedAt}`,
    ...doc.sections.map(sectionToMarkdown),
    resourceLines?.length ? ["## 첨부 자료", resourceLines.join("\n")].join("\n\n") : undefined,
  ].join("\n\n")
}

/** scripts/seed-docs.ts buildArticleRows 가 content_json 에 넣는 모양 그대로. */
function seededContentJson(doc: DocArticle): Record<string, unknown> {
  return {
    source: "lib/docs.ts",
    readMinutes: doc.readMinutes,
    updatedAt: doc.updatedAt,
    sections: doc.sections,
    resources: doc.resources ?? [],
    relatedSlugs: doc.relatedSlugs ?? [],
  }
}

type SavedSection = { heading: string; body: string; steps?: string[]; media?: DocMedia[] }

/** 편집기 저장 경로(DocsArticleEditor buildPayload)와 같은 호출. */
function saveOnce(doc: DocArticle, previous = seededContentJson(doc)) {
  return buildContentJson(docToMarkdown(doc), previous)
}

const docs = listDocs()
const docsWithMedia = docs.filter((doc) => doc.sections.some((section) => section.media?.length))
const docsWithResources = docs.filter((doc) => (doc.resources?.length ?? 0) > 0)

describe("공개 문서 전수 왕복 — 어드민 저장 한 번으로 구조가 깨지지 않는다", () => {
  it("대조 대상이 실제로 존재한다 (빈 배열을 통과로 착각하지 않도록)", () => {
    expect(docs.length).toBeGreaterThan(150)
    expect(docsWithMedia.length).toBeGreaterThan(30)
    expect(docsWithResources.length).toBeGreaterThan(20)
  })

  it("섹션 개수와 heading 이 전 문서에서 그대로 유지된다", () => {
    const changed: string[] = []

    for (const doc of docs) {
      const sections = saveOnce(doc).sections as SavedSection[]
      if (sections.length !== doc.sections.length) {
        changed.push(`${doc.slug}: ${doc.sections.length} -> ${sections.length}`)
        continue
      }
      doc.sections.forEach((section, index) => {
        if (section.heading !== sections[index].heading) {
          changed.push(`${doc.slug}[${index}]: "${section.heading}" -> "${sections[index].heading}"`)
        }
      })
    }

    expect(changed).toEqual([])
  })

  it("미디어의 src·alt·caption·크기가 전 문서에서 보존된다", () => {
    const lost: string[] = []
    let compared = 0

    for (const doc of docsWithMedia) {
      const sections = saveOnce(doc).sections as SavedSection[]

      doc.sections.forEach((section, index) => {
        const original = section.media ?? []
        const saved = sections[index]?.media ?? []
        if (original.length !== saved.length) {
          lost.push(`${doc.slug}[${index}] 미디어 ${original.length} -> ${saved.length}`)
          return
        }

        original.forEach((item, mediaIndex) => {
          compared += 1
          const next = saved[mediaIndex]
          if (item.src !== next.src) lost.push(`${doc.slug} src ${item.src} -> ${next.src}`)
          if (item.alt !== next.alt) lost.push(`${doc.slug} alt "${item.alt}" -> "${next.alt}"`)
          if ((item.caption ?? "") !== (next.caption ?? "")) {
            lost.push(`${doc.slug} caption "${item.caption ?? ""}" -> "${next.caption ?? ""}"`)
          }
          if (item.type !== next.type) lost.push(`${doc.slug} type ${item.type} -> ${next.type}`)
          // 마크다운에는 원본 픽셀 크기를 담을 자리가 없어 이전 content_json 에서 이어받는다.
          if (item.width !== next.width) lost.push(`${doc.slug} width ${item.width} -> ${next.width}`)
          if (item.height !== next.height) {
            lost.push(`${doc.slug} height ${item.height} -> ${next.height}`)
          }
        })
      })
    }

    expect(lost).toEqual([])
    expect(compared).toBeGreaterThan(140)
  })

  it("세로 스크린샷 판정(height > width)이 저장 뒤에도 유지된다", () => {
    // app/docs/_utils.tsx DocsSectionMedia 는 width·height 가 둘 다 있고 세로일 때만
    // max-h-[640px] 로 가둔다. 크기가 날아가면 4,700px 캡처가 통으로 펼쳐진다.
    const broken: string[] = []
    let portraits = 0

    for (const doc of docsWithMedia) {
      const sections = saveOnce(doc).sections as SavedSection[]

      doc.sections.forEach((section, index) => {
        section.media?.forEach((item, mediaIndex) => {
          if (!item.width || !item.height || item.height <= item.width) return
          portraits += 1
          const next = sections[index]?.media?.[mediaIndex]
          if (!next?.width || !next.height || next.height <= next.width) {
            broken.push(`${doc.slug} ${item.src}`)
          }
        })
      })
    }

    expect(broken).toEqual([])
    expect(portraits).toBeGreaterThan(10)
  })

  it("첨부 자료가 두 번 그려지지 않는다 — resources 전용 블록과 겹치는 섹션은 떨어낸다", () => {
    // 공개 문서 페이지는 content_json.resources 를 전용 블록으로 그린다.
    // 시드가 같은 목록을 content_markdown 의 "## 첨부 자료" 로도 내보내므로
    // 파싱한 섹션까지 남기면 같은 링크가 두 번, 그것도 raw 마크다운 문자열로 노출된다.
    const duplicated: string[] = []

    for (const doc of docsWithResources) {
      const sections = saveOnce(doc).sections as SavedSection[]
      if (sections.some((section) => section.heading.trim() === "첨부 자료")) {
        duplicated.push(doc.slug)
      }
      // resources 는 저장 후에도 그대로 살아 있어야 한다(전용 블록의 원본).
      expect(saveOnce(doc).resources).toEqual(doc.resources)
    }

    expect(duplicated).toEqual([])
  })

  it("승격된 미디어는 본문에서 빠진다 — 이미지가 두 번 그려지지 않는다", () => {
    // toArticleSections 는 body(마크다운)와 media 를 각각 그린다.
    const leftovers: string[] = []

    for (const doc of docsWithMedia) {
      const sections = saveOnce(doc).sections as SavedSection[]
      for (const section of sections) {
        for (const item of section.media ?? []) {
          if (section.body.includes(item.src)) {
            leftovers.push(`${doc.slug} "${section.heading}" body 에 ${item.src} 잔존`)
          }
        }
        if (/!\[[^\]]*\]\(/.test(section.body)) {
          leftovers.push(`${doc.slug} "${section.heading}" body 에 이미지 마크다운 잔존`)
        }
      }
    }

    expect(leftovers).toEqual([])
  })

  it("두 번 저장해도 결과가 같다 (멱등)", () => {
    const drifted: string[] = []

    for (const doc of docs) {
      const first = saveOnce(doc)
      const second = buildContentJson(docToMarkdown(doc), first)
      if (JSON.stringify(first.sections) !== JSON.stringify(second.sections)) {
        drifted.push(doc.slug)
      }
    }

    expect(drifted).toEqual([])
  })

  it("이전 content_json 이 없으면(신규 문서) 크기 없이도 안전하게 파싱된다", () => {
    const doc = docs.find((item) => item.slug === "pc-install")
    expect(doc).toBeDefined()

    const sections = buildContentJson(docToMarkdown(doc!)).sections as SavedSection[]
    const media = sections.flatMap((section) => section.media ?? [])

    expect(media.length).toBeGreaterThan(0)
    expect(media[0].src).toBe("/images/docs/diagrams/install-flow.svg")
    // 이어받을 이전 값이 없으니 크기는 비어 있고, 공개 렌더러가 기본값으로 그린다.
    expect(media[0].width).toBeUndefined()
    expect(media[0].height).toBeUndefined()
  })

  it("직렬화 규칙 드리프트 가드 — scripts/seed-docs.ts 가 바뀌면 이 파일도 갱신해야 한다", () => {
    const source = readFileSync(
      path.join(process.cwd(), "scripts/seed-docs.ts"),
      "utf8"
    )

    expect(source).toContain('`![${item.alt}](${item.src}${title})`')
    expect(source).toContain('`[${item.alt}](${item.src}${title})`')
    expect(source).toContain('const title = item.caption ? ` "${item.caption}"` : ""')
    expect(source).toContain('[`## ${section.heading}`, section.body, steps, media]')
    expect(source).toContain('["## 첨부 자료", resourceLines.join("\\n")]')
  })
})

describe("경로 스텝 규약이 왕복에서 살아남는다", () => {
  it("web-live-playback 의 '경로: ' 스텝이 원문 그대로 보존된다", () => {
    const doc = docs.find((item) => item.slug === "web-live-playback")
    expect(doc).toBeDefined()

    const originalPathSteps = doc!.sections.flatMap((section) =>
      (section.steps ?? []).filter((step) => step.startsWith("경로: "))
    )
    expect(originalPathSteps.length).toBeGreaterThan(0)

    const sections = markdownToSections(docToMarkdown(doc!))
    const savedPathSteps = sections.flatMap((section) =>
      (section.steps ?? []).filter((step) => step.startsWith("경로: "))
    )

    expect(savedPathSteps).toEqual(originalPathSteps)
  })

  it("전 문서의 '경로: ' 스텝 총량이 왕복 전후로 같다", () => {
    const count = (getSteps: (doc: DocArticle) => string[]) =>
      docs.reduce((total, doc) => total + getSteps(doc).length, 0)

    const before = count((doc) =>
      doc.sections.flatMap((section) =>
        (section.steps ?? []).filter((step) => step.startsWith("경로: "))
      )
    )
    const after = count((doc) =>
      markdownToSections(docToMarkdown(doc)).flatMap((section) =>
        (section.steps ?? []).filter((step) => step.startsWith("경로: "))
      )
    )

    expect(before).toBeGreaterThan(40)
    expect(after).toBe(before)
  })
})
