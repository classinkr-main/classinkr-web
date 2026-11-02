import { describe, expect, it } from "vitest"

import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"
import {
  COMPANY_LEGAL_NAME,
  SITE_NAME,
  SITE_URL,
  createArticleJsonLd,
  createOrganizationJsonLd,
  createPublicMetadata,
  createSiteVerification,
  createWebsiteJsonLd,
  isOrganizationAuthor,
} from "@/lib/seo"

describe("isOrganizationAuthor", () => {
  it.each([
    "ClassIn 팀",
    "Classin 팀",
    "ClassIn Korea 팀",
    "ClassIn Korea팀",
    "클래스인 팀",
    "Marketing Team",
    "classin team",
    "ClassIn",
    "Classin",
    "ClassIn Korea",
    "ClassInKorea",
    "클래스인",
    "클래스인 코리아",
    "이이오클래스인코리아 유한회사",
    "  ClassIn   팀  ",
  ])("팀·브랜드·법인 이름 %j 은 Organization 으로 본다", (name) => {
    expect(isOrganizationAuthor(name)).toBe(true)
  })

  it.each(["박지현", "이서연", "김성장", "정민수", "이동향", "Jane Doe", "Steam", "홍길동 대표"])(
    "개인명 %j 은 Person 으로 본다",
    (name) => {
      expect(isOrganizationAuthor(name)).toBe(false)
    },
  )

  it.each([undefined, null, "", "   "])("빈 값 %j 은 Organization 이 아니다", (name) => {
    expect(isOrganizationAuthor(name)).toBe(false)
  })
})

describe("createArticleJsonLd author", () => {
  const base = { path: "/blog/example", title: "제목", description: "설명" }

  it("팀명 저자는 Organization(name, url) 으로 낸다", () => {
    const node = createArticleJsonLd({ ...base, authorName: "ClassIn 팀" })
    expect(node.author).toEqual({ "@type": "Organization", name: "ClassIn 팀", url: SITE_URL })
  })

  it("개인명 저자는 Person 으로 낸다", () => {
    const node = createArticleJsonLd({ ...base, authorName: "박지현" })
    expect(node.author).toEqual({ "@type": "Person", name: "박지현" })
  })

  it("저자 이름 앞뒤 공백은 잘라서 낸다", () => {
    const node = createArticleJsonLd({ ...base, authorName: "  박지현 " })
    expect(node.author).toEqual({ "@type": "Person", name: "박지현" })
  })

  it("저자가 비어 있으면 author 키를 내지 않는다", () => {
    expect(createArticleJsonLd({ ...base }).author).toBeUndefined()
    expect("author" in createArticleJsonLd({ ...base, authorName: "   " })).toBe(false)
  })
})

describe("createPublicMetadata absoluteTitle", () => {
  const description = "설명"

  it("absoluteTitle 이 있으면 <title> 은 absolute 이고 og·twitter 제목이 같은 문자열이다", () => {
    const meta = createPublicMetadata({ absoluteTitle: "Classin | 수업 시스템 OS", description, path: "/" })
    expect(meta.title).toEqual({ absolute: "Classin | 수업 시스템 OS" })
    expect(meta.openGraph?.title).toBe("Classin | 수업 시스템 OS")
    expect(meta.twitter?.title).toBe("Classin | 수업 시스템 OS")
  })

  it("absoluteTitle 이 없으면 기존 규칙(title 템플릿, `title | Classin` 소셜 제목)을 유지한다", () => {
    const meta = createPublicMetadata({ title: "요금제", description, path: "/pricing" })
    expect(meta.title).toBe("요금제")
    expect(meta.openGraph?.title).toBe(`요금제 | ${SITE_NAME}`)
    expect(meta.twitter?.title).toBe(`요금제 | ${SITE_NAME}`)
  })

  it("canonical·noIndex 는 absoluteTitle 과 무관하게 동작한다", () => {
    const meta = createPublicMetadata({ absoluteTitle: "A | B", description, path: "/x", noIndex: true })
    expect(meta.alternates?.canonical).toBe(`${SITE_URL}/x`)
    expect(meta.robots).toEqual({ index: false, follow: false })
  })
})

describe("site-level JSON-LD", () => {
  it("Organization 은 대체 이름·법인명·주소·설명을 담고 근거 없는 필드는 싣지 않는다", () => {
    const org = createOrganizationJsonLd()
    expect(org.alternateName).toEqual(["클래스인", "ClassIn"])
    expect(org.legalName).toBe(COMPANY_LEGAL_NAME)
    expect(org.legalName).toBe("이이오클래스인코리아 유한회사")
    expect(org.description).toBe(CLASSIN_POSITIONING.oneLine)
    expect(org.address).toEqual({
      "@type": "PostalAddress",
      streetAddress: "목동동로 233-1, 8층 806호 (목동, 드림타워)",
      addressLocality: "양천구",
      addressRegion: "서울특별시",
      addressCountry: "KR",
    })
    expect(org).not.toHaveProperty("sameAs")
    expect(org).not.toHaveProperty("foundingDate")
  })

  it("WebSite 는 대체 이름을 갖고 SearchAction 이 noindex 검색 결과 페이지를 가리킨다", () => {
    const site = createWebsiteJsonLd()
    expect(site.alternateName).toBe("클래스인")
    expect(site.potentialAction).toMatchObject({
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/docs/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    })
  })
})

describe("createSiteVerification", () => {
  it("값이 없으면 undefined 를 돌려줘 verification 키 자체를 넣지 않게 한다", () => {
    expect(createSiteVerification({})).toBeUndefined()
    expect(createSiteVerification({ google: "", naver: "   " })).toBeUndefined()
    expect(createSiteVerification({ google: null, naver: undefined })).toBeUndefined()
  })

  it("Google 값만 있으면 google 만 낸다", () => {
    expect(createSiteVerification({ google: " g-code " })).toEqual({ google: "g-code" })
  })

  it("네이버 값만 있으면 other 에 naver-site-verification 으로 낸다", () => {
    expect(createSiteVerification({ naver: "n-code" })).toEqual({
      other: { "naver-site-verification": "n-code" },
    })
  })

  it("둘 다 있으면 둘 다 낸다", () => {
    expect(createSiteVerification({ google: "g-code", naver: "n-code" })).toEqual({
      google: "g-code",
      other: { "naver-site-verification": "n-code" },
    })
  })
})
