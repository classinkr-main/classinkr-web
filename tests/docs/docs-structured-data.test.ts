import { beforeEach, describe, expect, it, vi } from "vitest"

import { getDocBySlug, listDocs, type DocArticle } from "@/lib/docs"
import { isListedDoc } from "@/lib/docs-content"
import {
  createDocFaqJsonLd,
  createDocHowToJsonLd,
  createDocStructuredData,
  docMarkdownToPlainText,
  extractDocFaqItems,
  getDocSitemapImages,
  isQuestionHeading,
  isScreenPhoto,
  listDocImages,
  matchSectionImagesToSteps,
  pickDocShareImage,
  splitLeadingQuestion,
} from "@/lib/docs-structured-data"
import { SITE_URL } from "@/lib/seo"

const mocks = vi.hoisted(() => ({
  getPublishedPostsForStaticSitemap: vi.fn(),
  listCachedPublicEvents: vi.fn(),
  getDocsContent: vi.fn(),
}))

vi.mock("@/lib/repositories/blog", () => ({
  getPublishedPostsForStaticSitemap: mocks.getPublishedPostsForStaticSitemap,
}))

vi.mock("@/lib/repositories/public-events", () => ({
  listCachedPublicEvents: mocks.listCachedPublicEvents,
}))

vi.mock("@/lib/docs-content", async () => {
  const actual = await vi.importActual<typeof import("@/lib/docs-content")>("@/lib/docs-content")
  return { ...actual, getDocsContent: mocks.getDocsContent }
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getPublishedPostsForStaticSitemap.mockResolvedValue([])
  mocks.listCachedPublicEvents.mockResolvedValue([])
})

function makeDoc(overrides: Partial<DocArticle> & Pick<DocArticle, "slug">): DocArticle {
  return {
    category: "start",
    title: overrides.slug,
    description: "설명",
    audience: "원장",
    updatedAt: "2026-10-01",
    readMinutes: 3,
    tags: [],
    keywords: [],
    chatbotSummary: "요약",
    sections: [],
    status: "published",
    visibility: "public",
    ...overrides,
  }
}

const SCREEN = (name: string, width = 1200, height = 700, caption?: string) => ({
  type: "image" as const,
  src: `/docs/files/guides/sample/${name}`,
  alt: `${name} 화면`,
  ...(caption ? { caption } : {}),
  width,
  height,
})

const HOW_TO_DOC = makeDoc({
  slug: "sample-how-to",
  title: "회원 가입하기",
  description: "앱에서 **회원 가입**을 마칩니다.",
  sections: [
    {
      heading: "가입 화면 열기",
      body: "앱을 엽니다.",
      steps: [
        "앱 첫 화면 오른쪽 위 [회원 가입]을 누릅니다.",
        "[이메일로 등록하기]를 눌러 이메일 입력 화면으로 바꿉니다.",
      ],
      media: [
        SCREEN("01-signup.webp", 1200, 700, "첫 화면 오른쪽 위 [회원 가입]을 누릅니다."),
        { type: "image", src: "/images/docs/diagrams/flow.svg", alt: "순서도" },
      ],
    },
    {
      heading: "인증코드 받기",
      body: "",
      steps: ["[인증코드 받기]를 누르고 받은 코드를 입력합니다. 자세한 내용은 [로그인 문서](/docs/start/login)를 보세요."],
      media: [SCREEN("02-code.webp", 560, 1088, "세로로 긴 휴대폰 화면")],
    },
    {
      heading: "관련 문서",
      body: "",
      steps: ["[비밀번호 변경]을 누르는 방법은 비밀번호 문서에 있습니다.", "설치는 설치 문서를 보세요."],
    },
  ],
})

describe("docMarkdownToPlainText", () => {
  it("keeps link text and on-screen button labels but drops markdown syntax", () => {
    const text = docMarkdownToPlainText(
      [
        "## 제목",
        "> 인용 **굵게** 와 `코드`",
        "- [회원 가입]을 누르고 [로그인 문서](/docs/start/login)를 봅니다.",
        "![캡처](/docs/files/a.webp)",
        "| 항목 | 값 |",
        "|---|---|",
        "| 용량 | 10GB |",
        "<b>태그</b>",
      ].join("\n")
    )

    expect(text).toBe(
      "제목 인용 굵게 와 코드 [회원 가입]을 누르고 로그인 문서를 봅니다. 항목 / 값 용량 / 10GB 태그"
    )
  })

  it("returns an empty string for empty input", () => {
    expect(docMarkdownToPlainText(undefined)).toBe("")
    expect(docMarkdownToPlainText("   ")).toBe("")
  })
})

describe("HowTo", () => {
  it("builds sections and steps as plain text with absolute screenshot URLs", () => {
    const howTo = createDocHowToJsonLd(HOW_TO_DOC)
    expect(howTo).not.toBeNull()
    expect(howTo).toMatchObject({
      "@type": "HowTo",
      "@id": `${SITE_URL}/docs/start/sample-how-to#howto`,
      name: "회원 가입하기",
      description: "앱에서 회원 가입을 마칩니다.",
      image: `${SITE_URL}/docs/files/guides/sample/01-signup.webp`,
    })

    const sections = howTo!.step as Array<Record<string, unknown>>
    // "관련 문서" 섹션은 절차가 아니라서 빠진다.
    expect(sections.map((section) => section.name)).toEqual(["가입 화면 열기", "인증코드 받기"])

    const firstSteps = sections[0].itemListElement as Array<Record<string, unknown>>
    expect(firstSteps[0]).toMatchObject({
      "@type": "HowToStep",
      position: 1,
      text: "앱 첫 화면 오른쪽 위 [회원 가입]을 누릅니다.",
      // 사진 설명이 이 단계와 겹쳐서 단계에 붙는다. SVG 도식은 싣지 않는다.
      image: `${SITE_URL}/docs/files/guides/sample/01-signup.webp`,
    })
    expect(firstSteps[1].image).toBeUndefined()

    const secondSteps = sections[1].itemListElement as Array<Record<string, unknown>>
    expect(secondSteps[0].text).toBe(
      "[인증코드 받기]를 누르고 받은 코드를 입력합니다. 자세한 내용은 로그인 문서를 보세요."
    )

    expect(JSON.stringify(howTo)).not.toMatch(/\]\(|\*\*|\.svg/)
  })

  it("skips unlisted, noindex, non-published, canonicalized, troubleshooting and photo-less docs", () => {
    expect(createDocHowToJsonLd({ ...HOW_TO_DOC, visibility: "unlisted" })).toBeNull()
    expect(createDocHowToJsonLd({ ...HOW_TO_DOC, noindex: true })).toBeNull()
    expect(createDocHowToJsonLd({ ...HOW_TO_DOC, status: "review" })).toBeNull()
    expect(createDocHowToJsonLd({ ...HOW_TO_DOC, canonicalPath: "/docs/start/other" })).toBeNull()
    expect(createDocHowToJsonLd({ ...HOW_TO_DOC, canonicalPath: "/docs/start/sample-how-to" })).not.toBeNull()
    expect(createDocHowToJsonLd({ ...HOW_TO_DOC, docType: "troubleshooting" })).toBeNull()
    expect(createDocHowToJsonLd({ ...HOW_TO_DOC, docType: "faq" })).toBeNull()

    const withoutPhotos = {
      ...HOW_TO_DOC,
      sections: HOW_TO_DOC.sections.map((section) => ({ ...section, media: undefined })),
    }
    expect(createDocHowToJsonLd(withoutPhotos)).toBeNull()

    // 제품 사진(/images/…)만 있는 문서는 화면 사진이 없는 문서다.
    const productPhotoOnly = {
      ...withoutPhotos,
      sections: withoutPhotos.sections.map((section, index) =>
        index === 0
          ? { ...section, media: [{ type: "image" as const, src: "/images/product/hw/a.png", alt: "보드" }] }
          : section
      ),
    }
    expect(createDocHowToJsonLd(productPhotoOnly)).toBeNull()
  })

  it("does not treat spec lists as procedures", () => {
    const specDoc = makeDoc({
      slug: "specs",
      sections: [
        {
          heading: "모델별 사양",
          body: "",
          steps: ["S75는 75인치입니다.", "S86은 86인치입니다.", "모두 4K 해상도입니다."],
          media: [SCREEN("specs.webp")],
        },
      ],
    })
    expect(createDocHowToJsonLd(specDoc)).toBeNull()
  })

  it("attaches a photo to a step only when its caption clearly matches that step", () => {
    const image = (caption: string) => ({ url: "https://example.com/a.webp", alt: "", caption })
    const steps = [
      "경로: PC 첫 화면 오른쪽 위 > [회원 가입]",
      "경로: 모바일 첫 화면 오른쪽 위 > [회원 가입]",
      "약관 동의에 체크합니다.",
    ]

    const matched = matchSectionImagesToSteps(steps, [image("모바일은 앱 첫 화면 오른쪽 위 [회원 가입]을 누릅니다.")])
    expect(matched.stepImages.map((list) => list.length)).toEqual([0, 1, 0])
    expect(matched.sectionImages).toHaveLength(0)

    const unclear = matchSectionImagesToSteps(steps, [image("설정 창 전체 모습")])
    expect(unclear.stepImages.flat()).toHaveLength(0)
    expect(unclear.sectionImages).toHaveLength(1)
  })

  it("covers real how-to docs with screenshots, and nothing that is unlisted or troubleshooting", () => {
    const docs = listDocs()
    const withHowTo = docs.filter((doc) => createDocHowToJsonLd(doc))

    expect(withHowTo.length).toBeGreaterThanOrEqual(10)
    for (const doc of docs) {
      const howTo = createDocHowToJsonLd(doc)
      if (!howTo) continue
      expect(isListedDoc(doc)).toBe(true)
      expect(doc.docType === "troubleshooting" || doc.docType === "faq").toBe(false)
      expect(listDocImages(doc).some(isScreenPhoto)).toBe(true)

      const serialized = JSON.stringify(howTo)
      // 마크다운 링크 문법(…](/docs/…))이 남지 않는다. "[단색](색상값 입력)" 같은 괄호 설명은 링크가 아니라 그대로 둔다.
      expect(serialized).not.toMatch(/\]\((?:\/|https?:)[^)\s]*\)/)
      const urls = serialized.match(/"image":"([^"]+)"/g) ?? []
      for (const entry of urls) expect(entry).toMatch(/"image":"https?:\/\//)
    }

    const signup = getDocBySlug("signup", "start")
    if (signup && isListedDoc(signup) && listDocImages(signup).some(isScreenPhoto)) {
      expect(createDocHowToJsonLd(signup)).not.toBeNull()
    }
  })
})

describe("FAQPage", () => {
  it("recognizes question headings and leading question sentences", () => {
    expect(isQuestionHeading("녹화본은 어디서 보나요?")).toBe(true)
    expect(isQuestionHeading("Pro와 Enterprise, 무엇이 다른가")).toBe(true)
    expect(isQuestionHeading("교육·계약·결제")).toBe(false)
    expect(isQuestionHeading("인증코드가 오지 않을 때")).toBe(false)

    expect(splitLeadingQuestion("내장 마이크로 충분한가요? 외부 마이크도 연결되나요? 보드에 마이크가 있습니다.")).toEqual({
      question: "내장 마이크로 충분한가요? 외부 마이크도 연결되나요?",
      answer: "보드에 마이크가 있습니다.",
    })
    // 화면 버튼 이름 안의 물음표는 질문이 아니다.
    expect(splitLeadingQuestion("모바일은 [비밀번호를 잊으셨나요?] 에서 새로 정합니다.")).toBeNull()
    expect(splitLeadingQuestion("답이 없는 질문인가요?")).toBeNull()
  })

  it("builds FAQPage only for listed faq docs with at least two visible Q&A pairs", () => {
    const faqDoc = makeDoc({
      slug: "sample-faq",
      docType: "faq",
      sections: [
        { heading: "녹화본은 어디서 보나요?", body: "[스토리지] > [수업 녹화]에서 봅니다.", steps: ["관리자 콘솔에서 엽니다."] },
        {
          heading: "가입",
          body: "가입 관련 질문입니다.",
          steps: ["학생은 앱에서 가입하나요? 네. 앱에서 가입합니다.", "설치 문서를 먼저 보세요."],
        },
      ],
    })

    expect(extractDocFaqItems(faqDoc)).toEqual([
      { question: "녹화본은 어디서 보나요?", answer: "[스토리지] > [수업 녹화]에서 봅니다. 관리자 콘솔에서 엽니다." },
      { question: "학생은 앱에서 가입하나요?", answer: "네. 앱에서 가입합니다." },
    ])

    const faq = createDocFaqJsonLd(faqDoc)
    expect(faq).toMatchObject({
      "@type": "FAQPage",
      "@id": `${SITE_URL}/docs/start/sample-faq#faq`,
      mainEntity: [
        { "@type": "Question", name: "녹화본은 어디서 보나요?" },
        { "@type": "Question", name: "학생은 앱에서 가입하나요?" },
      ],
    })

    expect(createDocFaqJsonLd({ ...faqDoc, visibility: "unlisted" })).toBeNull()
    expect(createDocFaqJsonLd({ ...faqDoc, noindex: true })).toBeNull()
    expect(createDocFaqJsonLd({ ...faqDoc, docType: "guide" })).toBeNull()
    expect(createDocFaqJsonLd({ ...faqDoc, sections: faqDoc.sections.slice(0, 1) })).toBeNull()
  })

  it("extracts the pre-adoption FAQ questions from the static docs", () => {
    const docs = listDocs()
    for (const doc of docs) {
      if (doc.docType !== "faq" || !isListedDoc(doc)) expect(createDocFaqJsonLd(doc)).toBeNull()
    }

    const preAdoption = getDocBySlug("pre-adoption-faq-22-questions", "start")
    if (!preAdoption || !isListedDoc(preAdoption) || preAdoption.docType !== "faq") return

    const faq = createDocFaqJsonLd(preAdoption)
    const questions = (faq?.mainEntity ?? []) as Array<{ name: string; acceptedAnswer: { text: string } }>
    expect(questions.length).toBeGreaterThanOrEqual(20)
    for (const question of questions) {
      expect(question.name).toMatch(/[?？]$/)
      expect(question.acceptedAnswer.text.length).toBeGreaterThan(0)
    }
  })
})

describe("share image (og:image)", () => {
  it("picks the first landscape screenshot and falls back to null", () => {
    expect(pickDocShareImage(HOW_TO_DOC)).toMatchObject({
      url: `${SITE_URL}/docs/files/guides/sample/01-signup.webp`,
      width: 1200,
      height: 700,
    })

    const portraitOnly = makeDoc({
      slug: "portrait",
      sections: [{ heading: "a", body: "", media: [SCREEN("p.webp", 560, 1088), SCREEN("bar.webp", 1100, 119)] }],
    })
    expect(pickDocShareImage(portraitOnly)).toBeNull()

    const svgOnly = makeDoc({
      slug: "svg",
      sections: [{ heading: "a", body: "", media: [{ type: "image", src: "/images/docs/diagrams/a.svg", alt: "도식" }] }],
    })
    expect(pickDocShareImage(svgOnly)).toBeNull()
    expect(pickDocShareImage(makeDoc({ slug: "empty" }))).toBeNull()
  })

  it("only returns absolute raster image URLs for static docs", () => {
    for (const doc of listDocs()) {
      const image = pickDocShareImage(doc)
      if (!image) {
        expect(listDocImages(doc).every((item) => item.width && item.height)).toBe(true)
        continue
      }
      expect(image.url).toMatch(/^https?:\/\//)
      expect(new URL(image.url).pathname).toMatch(/\.(png|jpe?g|webp|gif|avif)$/i)
    }
  })
})

describe("structured data bundle", () => {
  it("keeps Article and Breadcrumb for every doc, uses TechArticle for troubleshooting, and adds HowTo only when indexable", () => {
    const bundle = (doc: DocArticle) =>
      createDocStructuredData({ doc, categoryTitle: "클래스인 시작하기", categoryPath: "/docs/start" })

    const types = (doc: DocArticle) => bundle(doc).map((node) => node["@type"])

    expect(types(HOW_TO_DOC)).toEqual(["Article", "BreadcrumbList", "HowTo"])
    expect(types({ ...HOW_TO_DOC, visibility: "unlisted", noindex: true })).toEqual(["Article", "BreadcrumbList"])
    expect(types({ ...HOW_TO_DOC, docType: "troubleshooting" })).toEqual(["TechArticle", "BreadcrumbList"])

    const [article] = bundle(HOW_TO_DOC)
    expect(article).toMatchObject({
      "@id": `${SITE_URL}/docs/start/sample-how-to#article`,
      image: `${SITE_URL}/docs/files/guides/sample/01-signup.webp`,
      author: { "@type": "Organization", name: "Classin" },
    })

    for (const doc of listDocs()) {
      const nodes = bundle(doc)
      expect(JSON.parse(JSON.stringify(nodes))).toEqual(nodes)
      expect(nodes[0]["@type"]).toBe(doc.docType === "troubleshooting" ? "TechArticle" : "Article")
      if (!isListedDoc(doc)) expect(nodes).toHaveLength(2)
    }
  })
})

describe("image sitemap", () => {
  it("lists up to five photos for indexable docs and escapes XML", () => {
    const manyPhotos = makeDoc({
      slug: "many",
      sections: [
        {
          heading: "a",
          body: "",
          media: [
            ...Array.from({ length: 7 }, (_, index) => SCREEN(`${index + 1}.png`)),
            { type: "image", src: "https://cdn.example.com/a.webp?x=1&y=2", alt: "외부" },
            { type: "image", src: "/images/docs/diagrams/a.svg", alt: "도식" },
          ],
        },
      ],
    })

    const images = getDocSitemapImages(manyPhotos)
    expect(images).toHaveLength(5)
    expect(images[0]).toBe(`${SITE_URL}/docs/files/guides/sample/1.png`)

    const external = makeDoc({
      slug: "external",
      sections: [{ heading: "a", body: "", media: [{ type: "image", src: "https://cdn.example.com/a.webp?x=1&y=2", alt: "외부" }] }],
    })
    expect(getDocSitemapImages(external)).toEqual(["https://cdn.example.com/a.webp?x=1&amp;y=2"])

    expect(getDocSitemapImages({ ...manyPhotos, visibility: "unlisted" })).toEqual([])
    expect(getDocSitemapImages({ ...manyPhotos, noindex: true })).toEqual([])
  })

  it("adds images to listed doc entries in sitemap.xml and leaves unlisted docs out", async () => {
    const listed = makeDoc({ slug: "with-photos", sections: HOW_TO_DOC.sections })
    const unlisted = makeDoc({ slug: "hidden-photos", visibility: "unlisted", sections: HOW_TO_DOC.sections })
    const noPhotos = makeDoc({ slug: "no-photos" })
    mocks.getDocsContent.mockResolvedValue({
      categories: [{ id: "start", title: "시작", description: "", order: 1 }],
      docs: [listed, unlisted, noPhotos],
    })

    const { default: sitemap } = await import("@/app/sitemap")
    const entries = await sitemap()
    const byUrl = new Map(entries.map((entry) => [entry.url, entry]))

    expect(byUrl.get(`${SITE_URL}/docs/start/with-photos`)?.images).toEqual([
      `${SITE_URL}/docs/files/guides/sample/01-signup.webp`,
      `${SITE_URL}/docs/files/guides/sample/02-code.webp`,
    ])
    expect(byUrl.get(`${SITE_URL}/docs/start/no-photos`)?.images).toBeUndefined()
    expect(byUrl.has(`${SITE_URL}/docs/start/hidden-photos`)).toBe(false)
  })
})
