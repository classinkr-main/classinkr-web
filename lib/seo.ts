import type { Metadata } from "next"

import { BOARD_MODEL_NAMES, BOARD_SPEC_MODELS } from "@/lib/hardware/board-specs"

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://classin.co.kr").replace(/\/$/, "")
export const SITE_NAME = "Classin"
export const DEFAULT_SITE_TITLE = "Classin — 학원 운영의 새로운 기준"
export const DEFAULT_OG_IMAGE_PATH = "/opengraph-image"
export const DEFAULT_TWITTER_IMAGE_PATH = "/twitter-image"

interface PublicMetadataOptions {
  title?: string
  description: string
  path?: string
  keywords?: string[]
  noIndex?: boolean
  /** 페이지 고유 OG/트위터 이미지 (절대 URL 또는 사이트 상대 경로). 없으면 기본 브랜드 이미지 사용 */
  image?: string
}

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
  description,
  path = "/",
  keywords,
  noIndex = false,
  image,
}: PublicMetadataOptions): Metadata {
  const canonical = toAbsoluteUrl(path)
  const socialTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_SITE_TITLE
  const ogImage = toAbsoluteUrl(image ?? DEFAULT_OG_IMAGE_PATH)
  const twitterImage = toAbsoluteUrl(image ?? DEFAULT_TWITTER_IMAGE_PATH)

  return {
    title,
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

export function createOrganizationJsonLd(): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: SITE_NAME,
    url: SITE_URL,
    logo: toAbsoluteUrl("/images/logo.png"),
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
    url: SITE_URL,
    inLanguage: "ko-KR",
    publisher: { "@id": ORGANIZATION_ID },
    // 사이트 내 검색(Sitelinks Search Box)은 /docs 가이드 검색이 실체다.
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/docs?q={search_term_string}`,
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

export function createArticleJsonLd({
  path,
  title,
  description,
  imageUrl,
  datePublished,
  dateModified,
  authorName,
}: {
  path: string
  title: string
  description: string
  imageUrl?: string
  datePublished?: string
  dateModified?: string
  authorName?: string
}): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${toAbsoluteUrl(path)}#article`,
    mainEntityOfPage: toAbsoluteUrl(path),
    headline: title,
    description,
    inLanguage: "ko-KR",
    ...(imageUrl ? { image: toAbsoluteUrl(imageUrl) } : {}),
    ...(datePublished ? { datePublished } : {}),
    ...(dateModified ? { dateModified } : {}),
    ...(authorName ? { author: { "@type": "Person", name: authorName } } : {}),
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
