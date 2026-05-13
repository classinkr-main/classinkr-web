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

function toAbsoluteUrl(path: string) {
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
