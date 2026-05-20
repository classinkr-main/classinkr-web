import type { Metadata } from "next"

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://classin.ai.kr").replace(/\/$/, "")
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
}: PublicMetadataOptions): Metadata {
  const canonical = toAbsoluteUrl(path)
  const socialTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_SITE_TITLE
  const ogImage = toAbsoluteUrl(DEFAULT_OG_IMAGE_PATH)
  const twitterImage = toAbsoluteUrl(DEFAULT_TWITTER_IMAGE_PATH)

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
    model: ["BS110A", "BS86A", "BS75A", "BS65A"],
    additionalProperty: [
      { "@type": "PropertyValue", name: "화면 크기", value: "65, 75, 86, 110인치" },
      { "@type": "PropertyValue", name: "터치 포인트", value: "최대 50점" },
      { "@type": "PropertyValue", name: "AI 카메라", value: "4K 자동 트래킹 녹화" },
      { "@type": "PropertyValue", name: "소프트웨어", value: "Classin 소프트웨어 연동" },
      { "@type": "PropertyValue", name: "수업 기록", value: "판서 PDF 및 수업 영상 공유" },
    ],
  }
}
