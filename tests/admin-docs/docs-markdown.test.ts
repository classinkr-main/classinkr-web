import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  DROPPED_INTRO_WARNING,
  buildContentJson,
  estimateReadMinutes,
  findDroppedIntroLines,
  hasDroppedIntroContent,
  markdownToSections,
  normalizeMarkdown,
} from "@/lib/admin/docs-markdown"
import { listDocs, type DocArticle, type DocSection } from "@/lib/docs"

describe("markdownToSections — 현행 계약 고정", () => {
  it("## 헤딩을 섹션 경계로 쓰고 첫 ## 앞 내용은 버린다", () => {
    const sections = markdownToSections(
      ["# 문서 제목", "", "인트로 문장입니다.", "", "## 첫 섹션", "", "첫 본문", "", "## 둘째 섹션", "", "둘째 본문"].join("\n")
    )

    expect(sections.map((section) => section.heading)).toEqual(["첫 섹션", "둘째 섹션"])
    expect(sections[0].body).toBe("첫 본문")
    expect(JSON.stringify(sections)).not.toContain("인트로 문장")
  })

  it("## 헤딩이 없으면 전체를 개요 섹션으로 묶는다", () => {
    const sections = markdownToSections("# 제목\n\n본문만 있습니다.")

    expect(sections).toEqual([{ heading: "개요", body: "본문만 있습니다." }])
  })

  it("불릿을 steps로 올리고 경로 스텝 문자열을 원문 그대로 보존한다", () => {
    const sections = markdownToSections(
      ["## 윈도우 설치", "", "설명 문장", "", "- 경로: 공식 홈페이지 > [다운로드]", "* 설치 파일을 실행합니다."].join("\n")
    )

    expect(sections[0].steps).toEqual([
      "경로: 공식 홈페이지 > [다운로드]",
      "설치 파일을 실행합니다.",
    ])
    expect(sections[0].body).toBe("설명 문장")
  })

  it("본문 없이 스텝만 있으면 기본 안내 문장을 body로 채운다", () => {
    const sections = markdownToSections("## 절차\n\n- 하나\n- 둘")

    expect(sections[0].body).toBe("아래 항목을 순서대로 확인하세요.")
  })

  it("빈 섹션은 버리고 # 줄은 섹션 본문에서도 제거한다", () => {
    const sections = markdownToSections("## 빈 섹션\n\n## 내용 있는 섹션\n\n# 버려지는 제목\n본문")

    expect(sections.map((section) => section.heading)).toEqual(["내용 있는 섹션"])
    expect(sections[0].body).toBe("본문")
  })

  it("normalizeMarkdown은 CRLF와 3줄 이상 공백을 정리한다", () => {
    expect(normalizeMarkdown("a\r\n\n\n\nb\n")).toBe("a\n\nb")
  })

  it("estimateReadMinutes는 최소 1분을 보장한다", () => {
    expect(estimateReadMinutes("")).toBe(1)
    expect(estimateReadMinutes("가".repeat(1800))).toBe(2)
  })
})

describe("독립 이미지 줄의 media 승격", () => {
  it("이미지 줄을 본문에서 빼고 media로 올린다 (캡션 없음)", () => {
    const sections = markdownToSections("## 개요\n\n본문\n\n![흐름도](/images/a.svg)")

    expect(sections[0].body).toBe("본문")
    expect(sections[0].media).toEqual([{ type: "image", src: "/images/a.svg", alt: "흐름도" }])
  })

  it("이미지 title을 캡션으로 옮긴다", () => {
    const sections = markdownToSections('## 개요\n\n![흐름도](/images/a.svg "다운로드 → 설치 → 로그인")')

    expect(sections[0].media).toEqual([
      { type: "image", src: "/images/a.svg", alt: "흐름도", caption: "다운로드 → 설치 → 로그인" },
    ])
  })

  it("title의 width= 표기를 캡션과 분리한다 (blog-markdown parseImageTitle 규칙)", () => {
    const sections = markdownToSections('## 개요\n\n![흐름도](/images/a.svg "설치 흐름 | width=640")')

    expect(sections[0].media).toEqual([
      { type: "image", src: "/images/a.svg", alt: "흐름도", caption: "설치 흐름", width: 640 },
    ])
  })

  it("불릿 안 이미지는 승격하지 않고 스텝 문자열로 남긴다", () => {
    const sections = markdownToSections("## 개요\n\n- 이 화면을 봅니다 ![샷](/images/b.png)")

    expect(sections[0].media).toBeUndefined()
    expect(sections[0].steps).toEqual(["이 화면을 봅니다 ![샷](/images/b.png)"])
  })

  it("문장 안에 섞인 이미지는 본문에 그대로 둔다", () => {
    const sections = markdownToSections("## 개요\n\n설명 ![샷](/images/b.png) 뒤 문장")

    expect(sections[0].media).toBeUndefined()
    expect(sections[0].body).toContain("![샷](/images/b.png)")
  })

  it("이미지가 없으면 media 키를 만들지 않는다", () => {
    const sections = markdownToSections("## 개요\n\n본문")

    expect(Object.keys(sections[0])).toEqual(["heading", "body"])
  })

  it("이미지만 있는 섹션도 살린다", () => {
    const sections = markdownToSections("## 화면\n\n![샷](/images/c.png)")

    expect(sections[0].media).toHaveLength(1)
    expect(sections[0].body).toBe("")
  })
})

describe("번호 목록도 steps로 인식", () => {
  it("1. 과 1) 형식의 번호를 제거하고 내용만 steps에 넣는다", () => {
    const sections = markdownToSections("## 절차\n\n1. 첫 단계\n2. 둘째 단계\n3) 셋째 단계")

    expect(sections[0].steps).toEqual(["첫 단계", "둘째 단계", "셋째 단계"])
  })

  it("불릿과 번호를 섞어 써도 같은 steps 배열이 된다", () => {
    const bullets = markdownToSections("## 절차\n\n- 첫 단계\n- 둘째 단계")
    const numbers = markdownToSections("## 절차\n\n1. 첫 단계\n2. 둘째 단계")

    expect(numbers).toEqual(bullets)
  })

  it("구분선(---)은 스텝으로 잡히지 않는다", () => {
    const sections = markdownToSections("## 개요\n\n본문\n\n---\n\n다음 문단")

    expect(sections[0].steps).toBeUndefined()
  })
})

describe("첫 ## 앞 산문 경고", () => {
  it("메타 줄과 제목만 있으면 경고하지 않는다", () => {
    const markdown = ["# 제목", "대상: 원장, 운영팀", "업데이트: 2026-08-26", "", "## 섹션", "본문"].join("\n")

    expect(hasDroppedIntroContent(markdown)).toBe(false)
  })

  it("실질 산문이 남아 있으면 그 줄을 알려준다", () => {
    const markdown = ["# 제목", "", "이 문서는 설치 방법을 정리합니다.", "", "## 섹션", "본문"].join("\n")

    expect(findDroppedIntroLines(markdown)).toEqual(["이 문서는 설치 방법을 정리합니다."])
    expect(DROPPED_INTRO_WARNING).toContain("## ")
  })

  it("## 섹션이 아예 없으면 인트로가 개요로 살아나므로 경고하지 않는다", () => {
    expect(hasDroppedIntroContent("# 제목\n\n본문만 있습니다.")).toBe(false)
  })

  it("설명 필드를 그대로 옮겨 적은 머리말은 경고하지 않는다 — 공개 가이드 60편이 전부 이 형태다", () => {
    const description = "수업을 진행하거나 참여할 PC에 클래스인을 설치하는 방법을 안내합니다."
    const markdown = [
      "# PC 설치 (윈도우, 맥)",
      "",
      description,
      "",
      "대상: 신규 학생, 학부모, 교사",
      "",
      "업데이트: 2026-06-17",
      "",
      "## 설치 개요",
      "",
      "본문입니다.",
    ].join("\n")

    expect(hasDroppedIntroContent(markdown, description)).toBe(false)
    // 설명을 넘기지 않으면 종전대로 경고한다(계약 유지)
    expect(hasDroppedIntroContent(markdown)).toBe(true)
  })

  it("설명과 다른 산문이 머리말에 있으면 설명을 넘겨도 그 줄만 경고한다", () => {
    const description = "짧은 설명"
    const markdown = ["# 제목", "", description, "", "이 문단은 저장하면 사라집니다.", "", "## 섹션", "", "본문"].join("\n")

    expect(findDroppedIntroLines(markdown, description)).toEqual(["이 문단은 저장하면 사라집니다."])
  })
})

describe("buildContentJson", () => {
  it("이전 content_json의 다른 키는 유지하고 sections만 새로 만든다", () => {
    const json = buildContentJson("## 개요\n\n본문", {
      resources: [{ label: "다운로드", href: "https://example.com" }],
      relatedSlugs: ["signup"],
      sections: [{ heading: "옛 섹션", body: "옛 본문" }],
    })

    expect(json.resources).toEqual([{ label: "다운로드", href: "https://example.com" }])
    expect(json.relatedSlugs).toEqual(["signup"])
    expect(json.sections).toEqual([{ heading: "개요", body: "본문" }])
    expect(json.source).toBe("admin-editor")
  })

  it("저장을 반복해도 시드가 넣은 media가 살아남는다", () => {
    const markdown = '## 설치 개요\n\n본문\n\n![흐름도](/images/docs/diagrams/install-flow.svg "다운로드 → 설치")'
    const first = buildContentJson(markdown)
    const second = buildContentJson(markdown, first)

    expect(second.sections).toEqual(first.sections)
    expect((second.sections as { media?: unknown[] }[])[0].media).toHaveLength(1)
  })
})

/**
 * 회귀 방지 실증: 시드가 만든 마크다운을 어드민 파서로 되읽어도 공개 구조가 그대로여야 한다.
 *
 * scripts/seed-docs.ts는 최상위에서 main()을 실행하는 실행 스크립트라 import할 수 없어
 * 직렬화 규칙만 여기 복제한다. 아래 "시드 직렬화 규칙 고정" 테스트가 원본과의 드리프트를 잡는다.
 */
function seedSectionToMarkdown(section: DocSection) {
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

function seedDocToMarkdown(doc: DocArticle) {
  const resourceLines = doc.resources?.map(
    (resource) => `- [${resource.label}](${resource.href})${resource.description ? ` - ${resource.description}` : ""}`
  )

  return [
    `# ${doc.title}`,
    doc.description,
    `대상: ${doc.audience}`,
    `업데이트: ${doc.updatedAt}`,
    ...doc.sections.map(seedSectionToMarkdown),
    resourceLines?.length ? ["## 첨부 자료", resourceLines.join("\n")].join("\n\n") : undefined,
  ].join("\n\n")
}

const collapse = (value: string) => value.replace(/\s+/g, " ").trim()

describe("시드 마크다운 왕복 — 어드민에서 저장해도 구조가 안 깨진다", () => {
  const doc = listDocs().find((item) => item.slug === "pc-install")

  it("pc-install 문서를 찾는다", () => {
    expect(doc).toBeDefined()
  })

  it("heading·steps·media(src·alt·caption)가 원본과 일치한다", () => {
    if (!doc) throw new Error("pc-install doc missing")
    const parsed = markdownToSections(seedDocToMarkdown(doc))

    // 마지막 '첨부 자료' 섹션은 resources에서 파생된 것이라 원본 sections에는 없다.
    expect(parsed.map((section) => section.heading)).toEqual([
      ...doc.sections.map((section) => section.heading),
      "첨부 자료",
    ])

    doc.sections.forEach((original, index) => {
      const round = parsed[index]
      expect(round.steps ?? []).toEqual(original.steps ?? [])
      expect(collapse(round.body)).toBe(collapse(original.body))
      expect((round.media ?? []).map((item) => ({ type: item.type, src: item.src, alt: item.alt, caption: item.caption }))).toEqual(
        (original.media ?? []).map((item) => ({ type: item.type, src: item.src, alt: item.alt, caption: item.caption }))
      )
    })
  })

  it("media를 가진 시드 문서 전체가 왕복에서 이미지를 잃지 않는다", () => {
    const withMedia = listDocs().filter((item) => item.sections.some((section) => (section.media?.length ?? 0) > 0))
    expect(withMedia.length).toBeGreaterThan(0)

    for (const item of withMedia) {
      const parsed = markdownToSections(seedDocToMarkdown(item))
      const originalSrcs = item.sections.flatMap((section) => (section.media ?? []).map((media) => media.src))
      const roundSrcs = parsed.flatMap((section) => (section.media ?? []).map((media) => media.src))
      expect(roundSrcs).toEqual(originalSrcs)
    }
  })

  it("시드 직렬화 규칙 고정 — seed-docs.ts가 캡션을 이미지 title로 내보낸다", () => {
    const source = readFileSync(new URL("../../scripts/seed-docs.ts", import.meta.url), "utf8")

    expect(source).toContain('const title = item.caption ? ` "${item.caption}"` : ""')
    expect(source).toContain("![${item.alt}](${item.src}${title})")
  })
})

describe("이미지 승격 경계 조건", () => {
  it("alt에 대괄호가 들어가도 승격한다 (시드 CS 가이드 alt 형식)", () => {
    const sections = markdownToSections(
      "## 안내\n\n![클래스인 전자칠판 내 [로컬 녹화] 기능 안내 화면](/docs/files/cs-figma/board.png)"
    )

    expect(sections[0].media).toEqual([
      {
        type: "image",
        src: "/docs/files/cs-figma/board.png",
        alt: "클래스인 전자칠판 내 [로컬 녹화] 기능 안내 화면",
      },
    ])
  })

  it("에디터가 이스케이프한 alt를 원문으로 되돌린다", () => {
    const sections = markdownToSections('## 안내\n\n![전자칠판 [로컬 녹화\\] 화면](/a.png "캡션 \\"주의\\"")')

    expect(sections[0].media).toEqual([
      { type: "image", src: "/a.png", alt: "전자칠판 [로컬 녹화] 화면", caption: '캡션 "주의"' },
    ])
  })

  it("영상 링크 한 줄은 video 미디어로 승격한다", () => {
    const sections = markdownToSections("## 데모\n\n[매직펜 데모](/docs/files/magic-pen-demo.mp4)")

    expect(sections[0].media).toEqual([
      { type: "video", src: "/docs/files/magic-pen-demo.mp4", alt: "매직펜 데모" },
    ])
  })

  it("영상이 아닌 일반 링크 한 줄은 본문에 남긴다", () => {
    const sections = markdownToSections("## 안내\n\n[공식 다운로드](https://www.classin.com/kr/download/)")

    expect(sections[0].media).toBeUndefined()
    expect(sections[0].body).toContain("공식 다운로드")
  })

  it("한 줄에 이미지가 둘이면 승격하지 않고 본문에 남긴다", () => {
    const sections = markdownToSections("## 안내\n\n![하나](/a.png)![둘](/b.png)")

    expect(sections[0].media).toBeUndefined()
    expect(sections[0].body).toBe("![하나](/a.png)![둘](/b.png)")
  })
})
