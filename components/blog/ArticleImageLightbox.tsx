"use client"

import { useCallback, useEffect, useState } from "react"
import { X } from "lucide-react"

interface ArticleImageLightboxProps {
  /** 이미지 클릭을 감지할 컨테이너 CSS 선택자 */
  containerSelector?: string
}

/**
 * 마크다운 본문(raw <img>)의 이미지를 탭하면 전체 화면으로 확대하는 라이트박스.
 * 서버 렌더된 본문에 클라이언트에서 클릭 핸들러만 위임 방식으로 붙인다.
 */
export function ArticleImageLightbox({
  containerSelector = ".blog-markdown",
}: ArticleImageLightboxProps) {
  const [activeImage, setActiveImage] = useState<{ src: string; alt: string } | null>(null)

  const close = useCallback(() => setActiveImage(null), [])

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target || target.tagName !== "IMG") return
      if (!target.closest(containerSelector)) return
      const img = target as HTMLImageElement
      if (!img.currentSrc && !img.src) return
      event.preventDefault()
      setActiveImage({ src: img.currentSrc || img.src, alt: img.alt ?? "" })
    }

    document.addEventListener("click", handleClick)
    return () => document.removeEventListener("click", handleClick)
  }, [containerSelector])

  useEffect(() => {
    if (!activeImage) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    document.addEventListener("keydown", handleKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", handleKey)
      document.body.style.overflow = ""
    }
  }, [activeImage, close])

  // 본문 이미지에 확대 가능 커서 힌트
  useEffect(() => {
    const container = document.querySelector(containerSelector)
    if (!container) return
    for (const img of container.querySelectorAll("img")) {
      img.classList.add("cursor-zoom-in")
    }
  }, [containerSelector])

  if (!activeImage) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={activeImage.alt || "이미지 크게 보기"}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <button
        type="button"
        onClick={close}
        aria-label="닫기"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>
      {/* 원본 해상도 그대로 보여주는 확대 뷰 — next/image 최적화 대상 아님 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={activeImage.src}
        alt={activeImage.alt}
        className="max-h-[90vh] max-w-full rounded-lg object-contain"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  )
}
