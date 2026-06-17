"use client"

import { useEffect, useState } from "react"
import Image, { type ImageProps } from "next/image"
import { NEUTRAL_BLUR_DATA_URL } from "@/lib/image-blur"

const FALLBACK_BLOG_IMAGES = [
  "/images/blog/thumb-01.png",
  "/images/blog/thumb-02.png",
  "/images/blog/thumb-03.png",
  "/images/blog/thumb-04.png",
  "/images/blog/thumb-05.png",
  "/images/blog/thumb-06.png",
  "/images/blog/thumb-07.png",
  "/images/blog/thumb-08.png",
  "/images/blog/thumb-09.png",
  "/images/blog/thumb-10.png",
  "/images/blog/thumb-11.png",
  "/images/blog/thumb-12.png",
]

const SAFE_IMAGE_PROTOCOLS = new Set(["https:"])
const SAFE_REMOTE_IMAGE_HOSTS = new Set(["images.unsplash.com"])
const DISALLOWED_IMAGE_SRC_CHARS = /[\u0000-\u001F\u007F\s\\]/

type SafeBlogImageProps = Omit<
  ImageProps,
  "src" | "alt" | "placeholder" | "blurDataURL" | "onError"
> & {
  src: string | null | undefined
  alt: string
  fallbackIndex?: number
}

function getFallbackBlogImage(index = 0) {
  const normalizedIndex = Math.abs(index) % FALLBACK_BLOG_IMAGES.length
  return FALLBACK_BLOG_IMAGES[normalizedIndex]
}

function isAllowedRemoteImageHost(hostname: string) {
  return (
    SAFE_REMOTE_IMAGE_HOSTS.has(hostname) ||
    hostname === "supabase.co" ||
    hostname.endsWith(".supabase.co")
  )
}

function normalizeBlogImageSrc(src: string | null | undefined, fallbackSrc: string) {
  const trimmed = typeof src === "string" ? src.trim() : ""
  if (!trimmed || DISALLOWED_IMAGE_SRC_CHARS.test(trimmed)) return fallbackSrc

  if (trimmed.startsWith("/")) {
    return trimmed.startsWith("//") ? fallbackSrc : trimmed
  }

  try {
    const parsed = new URL(trimmed)
    if (SAFE_IMAGE_PROTOCOLS.has(parsed.protocol) && isAllowedRemoteImageHost(parsed.hostname)) {
      return parsed.toString()
    }
  } catch {
    return fallbackSrc
  }

  return fallbackSrc
}

function shouldBypassImageOptimizer(src: string) {
  return src.startsWith("/")
}

export function SafeBlogImage({
  src,
  alt,
  fallbackIndex = 0,
  ...imageProps
}: SafeBlogImageProps) {
  const fallbackSrc = getFallbackBlogImage(fallbackIndex)
  const normalizedSrc = normalizeBlogImageSrc(src, fallbackSrc)
  const [resolvedSrc, setResolvedSrc] = useState(() => normalizedSrc)
  const unoptimized = imageProps.unoptimized ?? shouldBypassImageOptimizer(resolvedSrc)

  useEffect(() => {
    setResolvedSrc(normalizedSrc)
  }, [normalizedSrc])

  return (
    <Image
      {...imageProps}
      src={resolvedSrc}
      alt={alt}
      placeholder="blur"
      blurDataURL={NEUTRAL_BLUR_DATA_URL}
      unoptimized={unoptimized}
      onError={() => {
        if (resolvedSrc !== fallbackSrc) {
          setResolvedSrc(fallbackSrc)
        }
      }}
    />
  )
}
