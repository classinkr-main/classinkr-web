import type { Metadata } from "next"

import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"
import { BOARD_MODEL_NAMES, BOARD_SPEC_MODELS } from "@/lib/hardware/board-specs"

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://classin.co.kr").replace(/\/$/, "")
export const SITE_NAME = "Classin"
// 홈 <title>·루트 기본 제목·공유 카드 기본 제목. 2026-10-28 진단 추천안을 채택해 구매자가 검색하는 범주어를 병기한다.
export const DEFAULT_SITE_TITLE = "클래스인 Classin | 학원 전자칠판·수업 녹화·운영 플랫폼"
export const DEFAULT_OG_IMAGE_PATH = "/opengraph-image"
export const DEFAULT_TWITTER_IMAGE_PATH = "/twitter-image"

interface PublicMetadataOptions {
  title?: string
  /**
   * 레이아웃의 `%s | Classin` 템플릿을 건너뛰고 `<title>` 에 그대로 쓸 문자열.
   * 지정하면 og:title · twitter:title 도 같은 문자열로 맞춘다(탭 제목과 공유 카드 제목의 어순 불일치 방지).
   */
  absoluteTitle?: string
  description: string
  path?: string
  keywords?: string[]
  noIndex?: boolean
  /** 페이지 고유 OG/트위터 이미지 (절대 URL 또는 사이트 상대 경로). 없으면 기본 브랜드 이미지 사용 */
  image?: string
}

// 법인명·주소 정본은 components/sections/Footer.tsx 에 공개된 사업자 정보다. 우편번호는 근거가 없어 싣지 않는다.
export const COMPANY_LEGAL_NAME = "이이오클래스인코리아 유한회사"
const COMPANY_ADDRESS = {
  streetAddress: "목동동로 233-1, 8층 806호 (목동, 드림타워)",
  addressLocality: "양천구",
  addressRegion: "서울특별시",
  addressCountry: "KR",
} as const

export const ORGANIZATION_ID = `${SITE_URL}/#organization`
export const WEBSITE_ID = `${SITE_URL}/#website`
export const BRAND_ID = `${SITE_URL}/#brand`
export const SOFTWARE_PRODUCT_ID = `${SITE_URL}/product/sw#software`
export const HARDWARE_PRODUCT_ID = `${SITE_URL}/product/hw#classin-board`

export type JsonLdNode = Record<string, unknown>

export function toAbsoluteUrl(path: string) {
  return new URL(path, SITE_URL).toString()
}

export function createPublicMetadata({
  title,
  absoluteTitle,
  description,
  path = "/",
  keywords,
  noIndex = false,
  image,
}: PublicMetadataOptions): Metadata {
  const canonical = toAbsoluteUrl(path)
  const socialTitle = absoluteTitle || (title ? `${title} | ${SITE_NAME}` : DEFAULT_SITE_TITLE)
  const ogImage = toAbsoluteUrl(image ?? DEFAULT_OG_IMAGE_PATH)
  const twitterImage = toAbsoluteUrl(image ?? DEFAULT_TWITTER_IMAGE_PATH)

  return {
    title: absoluteTitle ? { absolute: absoluteTitle } : title,
    description,
    ...(keywords ? { keywords } : {}),
    alternates: {
      canonical,
    },
    openGraph: {
      title: socialTitle,
      description,
      url: canonical,
      siteName: SITE_NAME,
      locale: "ko_KR",
      type: "website",
      images: [{ url: ogImage }],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [twitterImage],
    },
    ...(noIndex
      ? {
          robots: {
            index: false,
            follow: false,
          },
        }
      : {}),
  }
}

/**
 * 검색엔진 소유확인 메타태그(`metadata.verification`)를 만든다.
 * 검색 콘솔(Google Search Console, 네이버 서치어드바이저)이 발급한 값만 받으며 비밀 값이 아니다.
 * 값이 비어 있으면 해당 키를 아예 넣지 않고, 둘 다 비면 undefined 를 돌려준다.
 */
export function createSiteVerification({
  google,
  naver,
}: {
  google?: string | null
  naver?: string | null
}): Metadata["verification"] | undefined {
  const googleCode = google?.trim()
  const naverCode = naver?.trim()
  if (!googleCode && !naverCode) return undefined

  return {
    ...(googleCode ? { google: googleCode } : {}),
    ...(naverCode ? { other: { "naver-site-verification": naverCode } } : {}),
  }
}

export function createOrganizationJsonLd(): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: SITE_NAME,
    alternateName: ["클래스인", "ClassIn"],
    legalName: COMPANY_LEGAL_NAME,
    description: CLASSIN_POSITIONING.oneLine,
    url: SITE_URL,
    logo: toAbsoluteUrl("/images/logo.png"),
    address: {
      "@type": "PostalAddress",
      ...COMPANY_ADDRESS,
    },
    brand: {
      "@type": "Brand",
      "@id": BRAND_ID,
      name: SITE_NAME,
    },
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "sales",
        email: "classinkr@classin.com",
        telephone: "+82-2-6958-8566",
        areaServed: "KR",
        availableLanguage: ["ko", "en"],
      },
    ],
  }
}

export function createWebsiteJsonLd(): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE_NAME,
    alternateName: "클래스인",
    url: SITE_URL,
    inLanguage: "ko-KR",
    publisher: { "@id": ORGANIZATION_ID },
    // 사이트 내 검색(Sitelinks Search Box)은 /docs 가이드 검색이 실체다. 색인 대상인 /docs 가 아니라
    // 결과 페이지(/docs/search, noindex 이며 q 를 처리한다)를 가리켜야 검색 결과가 색인에 섞이지 않는다.
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/docs/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  }
}

export function createWebPageJsonLd({
  path,
  name,
  description,
  mainEntity,
}: {
  path: string
  name: string
  description: string
  mainEntity?: JsonLdNode
}): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${toAbsoluteUrl(path)}#webpage`,
    url: toAbsoluteUrl(path),
    name,
    description,
    inLanguage: "ko-KR",
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": ORGANIZATION_ID },
    ...(mainEntity ? { mainEntity } : {}),
  }
}

export function createBreadcrumbJsonLd(items: Array<{ name: string; path: string }>): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: toAbsoluteUrl(item.path),
    })),
  }
}

export function createFaqJsonLd(items: Array<{ question: string; answer: string }>): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  }
}

// 블로그 저자 칸은 자유 텍스트라 개인명("박지현")과 팀·브랜드명("ClassIn 팀", "Classin", "ClassIn Korea")이 섞여 있다.
// 팀명을 Person 으로 내보내면 구조화 데이터가 사실과 달라지므로 이름 모양으로 Organization 을 가려낸다.
const ORGANIZATION_AUTHOR_PATTERNS: readonly RegExp[] = [
  // 끝이 "팀"/"Team" — "ClassIn 팀", "Classin 팀", "ClassIn Korea 팀", "Marketing Team"
  /(?:팀|\bteam)$/i,
  // 브랜드명만 — "ClassIn", "Classin Korea", "클래스인", "클래스인 코리아"
  /^(?:class\s?in|클래스\s?인)(?:\s*(?:korea|코리아))?$/i,
  // 법인명 — "이이오클래스인코리아 유한회사"
  /(?:유한회사|주식회사)$/,
]

export function isOrganizationAuthor(name: string | null | undefined): boolean {
  const normalized = (name ?? "").replace(/\s+/g, " ").trim()
  if (!normalized) return false
  return ORGANIZATION_AUTHOR_PATTERNS.some((pattern) => pattern.test(normalized))
}

function createArticleAuthorJsonLd(authorName: string): JsonLdNode {
  return isOrganizationAuthor(authorName)
    ? { "@type": "Organization", name: authorName, url: SITE_URL }
    : { "@type": "Person", name: authorName }
}

export function createArticleJsonLd({
  path,
  title,
  description,
  imageUrl,
  datePublished,
  dateModified,
  authorName,
  type = "Article",
}: {
  path: string
  title: string
  description: string
  imageUrl?: string
  datePublished?: string
  dateModified?: string
  authorName?: string
  /** 블로그 상세는 BlogPosting(Article 의 하위 유형), 문서 상세는 기본값 Article. */
  type?: "Article" | "BlogPosting"
}): JsonLdNode {
  const normalizedAuthorName = authorName?.trim()

  return {
    "@context": "https://schema.org",
    "@type": type,
    "@id": `${toAbsoluteUrl(path)}#article`,
    mainEntityOfPage: toAbsoluteUrl(path),
    headline: title,
    description,
    inLanguage: "ko-KR",
    ...(imageUrl ? { image: toAbsoluteUrl(imageUrl) } : {}),
    ...(datePublished ? { datePublished } : {}),
    ...(dateModified ? { dateModified } : {}),
    ...(normalizedAuthorName ? { author: createArticleAuthorJsonLd(normalizedAuthorName) } : {}),
    publisher: { "@id": ORGANIZATION_ID },
  }
}

export function createEventJsonLd({
  path,
  name,
  description,
  startDate,
  endDate,
  locationName,
  imageUrl,
  sessions,
}: {
  path: string
  name: string
  description?: string
  startDate: string
  endDate?: string
  locationName?: string
  imageUrl?: string
  /**
   * 띄엄띄엄 열리는 회차 행사의 구간들. 2개 이상이면 EventSeries + subEvent로 표기한다.
   * (검색엔진이 "8/3 ~ 8/17 연속 개최"로 오해하지 않게 하는 것이 목적)
   */
  sessions?: { startIso: string; endIso: string }[]
}): JsonLdNode {
  // 장소가 있으면 오프라인 행사, 없으면 온라인(웨비나 등)으로 표기
  const attendanceMode = locationName
    ? "https://schema.org/OfflineEventAttendanceMode"
    : "https://schema.org/OnlineEventAttendanceMode"
  const location = locationName
    ? { "@type": "Place", name: locationName, address: locationName }
    : { "@type": "VirtualLocation", url: toAbsoluteUrl(path) }

  const isSeries = (sessions?.length ?? 0) > 1

  return {
    "@context": "https://schema.org",
    "@type": isSeries ? "EventSeries" : "Event",
    "@id": `${toAbsoluteUrl(path)}#event`,
    name,
    url: toAbsoluteUrl(path),
    ...(description ? { description } : {}),
    startDate,
    ...(endDate ? { endDate } : {}),
    inLanguage: "ko-KR",
    eventAttendanceMode: attendanceMode,
    location,
    ...(imageUrl ? { image: toAbsoluteUrl(imageUrl) } : {}),
    organizer: { "@id": ORGANIZATION_ID },
    ...(isSeries
      ? {
          subEvent: sessions!.map((session, index) => ({
            "@type": "Event",
            "@id": `${toAbsoluteUrl(path)}#event-${index + 1}`,
            name: `${name} (${index + 1}/${sessions!.length}회차)`,
            url: toAbsoluteUrl(path),
            startDate: session.startIso,
            endDate: session.endIso,
            inLanguage: "ko-KR",
            eventAttendanceMode: attendanceMode,
            location,
            organizer: { "@id": ORGANIZATION_ID },
          })),
        }
      : {}),
  }
}

export function createSoftwareProductJsonLd(): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": SOFTWARE_PRODUCT_ID,
    name: "Classin 소프트웨어",
    url: toAbsoluteUrl("/product/sw"),
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web, Windows, macOS, iOS, Android",
    inLanguage: "ko-KR",
    description:
      "Classin 소프트웨어는 실시간 수업, 수업 도구, 과제 제출, AI 자동채점, 학습 데이터 리포트, 학부모 소통을 하나의 흐름으로 연결하는 학원 수업 운영 플랫폼입니다.",
    provider: { "@id": ORGANIZATION_ID },
    brand: { "@id": BRAND_ID },
    featureList: [
      "실시간 온라인 수업",
      "30여 가지 수업 도구",
      "과제 제출 및 자동채점",
      "AI 첨삭과 과제 생성",
      "학습 데이터 리포트",
      "학부모 소통과 알림",
    ],
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: "99",
      highPrice: "199",
      offerCount: 3,
      url: toAbsoluteUrl("/product/sw"),
    },
  }
}

export function createHardwareProductJsonLd(): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": HARDWARE_PRODUCT_ID,
    name: "Classin Board S Series",
    url: toAbsoluteUrl("/product/hw"),
    image: toAbsoluteUrl("/images/product/hw/hero/hero-board-stand.png"),
    brand: { "@id": BRAND_ID },
    manufacturer: { "@id": ORGANIZATION_ID },
    category: "교육용 전자칠판",
    description:
      "Classin Board는 판서, 4K AI 카메라 자동 추적, 수업 영상 업로드, 판서 PDF 공유, Classin 소프트웨어 연동을 제공하는 교육용 전자칠판입니다.",
    // 모델명 정본은 lib/hardware/board-specs.ts 다. 여기에 다시 적으면 검색엔진이
    // 읽는 면에서 조용히 갈라진다(BS86A ↔ BS86C 로 실제 갈라진 적이 있다).
    model: BOARD_SPEC_MODELS.map((model) => BOARD_MODEL_NAMES[model]),
    additionalProperty: [
      { "@type": "PropertyValue", name: "화면 크기", value: "65, 75, 86, 110인치" },
      { "@type": "PropertyValue", name: "터치 포인트", value: "최대 50점" },
      { "@type": "PropertyValue", name: "AI 카메라", value: "4K 자동 트래킹 녹화" },
      { "@type": "PropertyValue", name: "소프트웨어", value: "Classin 소프트웨어 연동" },
      { "@type": "PropertyValue", name: "수업 기록", value: "판서 PDF 및 수업 영상 공유" },
    ],
  }
}
