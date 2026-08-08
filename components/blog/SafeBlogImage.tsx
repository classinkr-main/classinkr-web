"use client"

import { useEffect, useState } from "react"
import Image, { type ImageProps } from "next/image"
import { sanitizePublicImageUrl } from "@/lib/safe-public-url"

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

type SafeBlogImageProps = Omit<ImageProps, "src" | "alt" | "onError"> & {
  src: string | null | undefined
  alt: string
  fallbackIndex?: number
}

function getFallbackBlogImage(index = 0) {
  const normalizedIndex = Math.abs(index) % FALLBACK_BLOG_IMAGES.length
  return FALLBACK_BLOG_IMAGES[normalizedIndex]
}

function normalizeBlogImageSrc(src: string | null | undefined, fallbackSrc: string) {
  return sanitizePublicImageUrl(src, fallbackSrc)
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

  useEffect(() => {
    setResolvedSrc(normalizedSrc)
  }, [normalizedSrc])

  return (
    <Image
      {...imageProps}
      src={resolvedSrc}
      alt={alt}
      onError={() => {
        if (resolvedSrc !== fallbackSrc) {
          setResolvedSrc(fallbackSrc)
        }
      }}
    />
  )
}
