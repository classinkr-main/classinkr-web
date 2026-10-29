import { describe, expect, it } from "vitest"

import { listDocs, type DocArticle } from "@/lib/docs"
import {
  getDocListKind,
  getDocListPreview,
  groupCategoryItems,
  pickRecentlyUpdated,
  type DocListKind,
} from "@/lib/docs-list-meta"

function makeDoc(overrides: Partial<DocArticle>): DocArticle {
  return {
    slug: "sample",
    category: "teacher",
    title: "샘플 문서",
    description: "설명",
    audience: "강사",
    updatedAt: "2026-10-01",
    readMinutes: 3,
    tags: [],
    keywords: [],
    chatbotSummary: "요약",
    sections: [],
    ...overrides,
  }
}

describe("getDocListKind", () => {
  it("DB doc_type 6종을 목록 유형 4종으로 접는다", () => {
    expect(getDocListKind(makeDoc({ docType: "troubleshooting" }))).toBe("troubleshooting")
    expect(getDocListKind(makeDoc({ docType: "faq" }))).toBe("faq")
    expect(getDocListKind(makeDoc({ docType: "release_note" }))).toBe("update")
    expect(getDocListKind(makeDoc({ docType: "guide" }))).toBe("howto")
    expect(getDocListKind(makeDoc({ docType: "manual" }))).toBe("howto")
    expect(getDocListKind(makeDoc({ docType: "reference" }))).toBe("howto")
  })

  it("유형이 비면 시드 스크립트와 같은 단서로 추정한다", () => {
    expect(getDocListKind(makeDoc({ slug: "classin-607-update" }))).toBe("update")
    expect(getDocListKind(makeDoc({ tags: ["문제 해결"] }))).toBe("troubleshooting")
    expect(getDocListKind(makeDoc({ title: "요금제 FAQ" }))).toBe("faq")
    expect(getDocListKind(makeDoc({}))).toBe("howto")
  })
})

describe("getDocListPreview", () => {
  it("실제 화면 사진을 개념도보다 먼저 고르고, 사진 수에서 개념도는 뺀다", () => {
    const preview = getDocListPreview(
      makeDoc({
        sections: [
          {
            heading: "흐름",
            body: "",
            media: [{ type: "image", src: "/images/docs/diagrams/flow.svg", alt: "흐름도" }],
          },
          {
            heading: "화면",
            body: "",
            media: [
              { type: "video", src: "/v.mp4", alt: "영상" },
              { type: "image", src: "/docs/files/guides/a/01.webp", alt: "첫 화면", width: 1440, height: 900 },
              { type: "image", src: "/docs/files/guides/a/02.webp", alt: "둘째 화면" },
            ],
          },
        ],
      })
    )

    expect(preview.thumbnail).toEqual({
      src: "/docs/files/guides/a/01.webp",
      width: 1440,
      height: 900,
      isDiagram: false,
    })
    expect(preview.imageCount).toBe(2)
  })

  it("사진이 없으면 개념도를 미리보기로 쓰고, 그림이 없으면 비운다", () => {
    const diagramOnly = getDocListPreview(
      makeDoc({
        sections: [
          { heading: "흐름", body: "", media: [{ type: "image", src: "/a.svg", alt: "흐름도" }] },
        ],
      })
    )
    expect(diagramOnly.thumbnail?.isDiagram).toBe(true)
    expect(diagramOnly.imageCount).toBe(0)
    expect(getDocListPreview(makeDoc({})).thumbnail).toBeUndefined()
  })
})

describe("pickRecentlyUpdated", () => {
  const item = (href: string, updatedAtIso: string, category: string, kind: DocListKind = "howto") => ({
    title: href,
    href,
    category,
    kind,
    updatedAtIso,
  })

  it("최근 날짜부터 고르고, 같은 날짜 안에서는 주제를 번갈아 고른다", () => {
    const picked = pickRecentlyUpdated(
      [
        item("/a1", "2026-10-29", "A"),
        item("/a2", "2026-10-29", "A"),
        item("/a3", "2026-10-29", "A"),
        item("/b1", "2026-10-29", "B"),
        item("/old", "2026-09-01", "B"),
        item("/new", "2026-10-30", "C"),
      ],
      { limit: 4 }
    )
    expect(picked.map((doc) => doc.href)).toEqual(["/new", "/a1", "/b1", "/a2"])
  })

  it("제외 목록과 제외 유형을 건너뛴다", () => {
    const picked = pickRecentlyUpdated(
      [
        item("/a", "2026-10-29", "A"),
        item("/t", "2026-10-29", "A", "troubleshooting"),
        item("/b", "2026-10-28", "B"),
      ],
      { excludeHrefs: new Set(["/a"]), excludeKinds: ["troubleshooting"] }
    )
    expect(picked.map((doc) => doc.href)).toEqual(["/b"])
  })
})

describe("groupCategoryItems", () => {
  const toItem = (doc: DocArticle) => ({
    title: doc.title,
    href: `/docs/${doc.category}/${doc.slug}`,
    kind: getDocListKind(doc),
  })

  it("규칙이 없는 주제는 소제목 없이 하나로 돌려준다", () => {
    const groups = groupCategoryItems("software", [toItem(makeDoc({ category: "software" }))])
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe("")
  })

  it("문제 해결 문서는 slug·접두어 규칙보다 먼저 문제 해결 묶음으로 간다", () => {
    const groups = groupCategoryItems("teacher", [
      toItem(makeDoc({ slug: "course-create", title: "코스 - 생성" })),
      toItem(makeDoc({ slug: "lesson-x", title: "수업 - 웹 라이브" })),
      toItem(makeDoc({ slug: "recording-troubleshooting", title: "수업 - 녹화가 안 될 때", docType: "troubleshooting" })),
      toItem(makeDoc({ slug: "brand-new", title: "새 문서" })),
    ])

    expect(groups.map((group) => [group.label, group.items.map((doc) => doc.title)])).toEqual([
      ["코스", ["코스 - 생성"]],
      ["수업과 교실", ["수업 - 웹 라이브"]],
      ["문제가 생겼을 때", ["수업 - 녹화가 안 될 때"]],
      ["그 밖의 가이드", ["새 문서"]],
    ])
    expect(groups.find((group) => group.id === "troubleshooting")?.kind).toBe("troubleshooting")
  })

  it("공개 정적 문서는 규칙이 있는 주제에서 빠짐없이 한 번씩 묶인다", () => {
    for (const categoryId of ["start", "admin", "teacher", "student", "hardware"] as const) {
      const items = listDocs()
        .filter((doc) => doc.category === categoryId && (doc.visibility ?? "public") === "public" && !doc.noindex)
        .map(toItem)
      const groups = groupCategoryItems(categoryId, items)
      const grouped = groups.flatMap((group) => group.items.map((doc) => doc.href))

      expect(grouped.sort()).toEqual(items.map((doc) => doc.href).sort())
      // 규칙에 있는 문서가 "그 밖의 가이드"로 새지 않는지 — 새 문서가 생기면 이 묶음으로 간다.
      expect(
        groups.find((group) => group.id === "rest")?.items.map((doc) => doc.href) ?? [],
        `${categoryId}: lib/docs-list-meta.ts CATEGORY_GROUP_RULES 에 새 문서의 묶음을 정해 주세요`
      ).toEqual([])
    }
  })
})
