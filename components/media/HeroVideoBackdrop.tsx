"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

type VideoLoadStrategy = "immediate" | "idle" | "in-view"

type HeroVideoSource = {
  src: string
  type: string
}

type HeroVideoBackdropProps = {
  src?: string
  sources?: HeroVideoSource[]
  /** 없으면 포스터를 그리지 않는다 — 부르는 쪽이 <picture> 아트 디렉션 포스터를 아래에 깔 때(홈 히어로) */
  posterSrc?: string
  posterAlt?: string
  className?: string
  imageClassName?: string
  videoClassName?: string
  priority?: boolean
  sizes?: string
  mediaQuery?: string
  loadStrategy?: VideoLoadStrategy
  rootMargin?: string
  preload?: "none" | "metadata" | "auto"
  ariaHidden?: boolean
  videoAriaLabel?: string
  /** true 면 영상을 멈춘다. 멈춤 버튼(WCAG 2.2.2)은 부르는 쪽이 둔다 */
  paused?: boolean
}

export function HeroVideoBackdrop({
  src,
  sources,
  posterSrc,
  posterAlt = "",
  className,
  imageClassName,
  videoClassName,
  priority = false,
  sizes = "100vw",
  mediaQuery = "(prefers-reduced-motion: no-preference)",
  loadStrategy = "immediate",
  rootMargin = "320px",
  preload = "metadata",
  ariaHidden = true,
  videoAriaLabel,
  paused = false,
}: HeroVideoBackdropProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [matchesMedia, setMatchesMedia] = useState(!mediaQuery)
  const [shouldLoadVideo, setShouldLoadVideo] = useState(!mediaQuery && loadStrategy === "immediate")
  const [isVideoReady, setIsVideoReady] = useState(false)
  const [hasVideoError, setHasVideoError] = useState(false)

  useEffect(() => {
    // mediaQuery가 없으면 초기 state(!mediaQuery === true)가 이미 매칭 상태
    if (!mediaQuery) return

    const query = window.matchMedia(mediaQuery)
    const updateMatch = () => {
      setMatchesMedia(query.matches)
      if (!query.matches) {
        setShouldLoadVideo(false)
        setIsVideoReady(false)
        setHasVideoError(false)
      }
    }

    updateMatch()
    query.addEventListener("change", updateMatch)

    return () => query.removeEventListener("change", updateMatch)
  }, [mediaQuery])

  useEffect(() => {
    if (!matchesMedia || hasVideoError) return

    let idleHandle: number | undefined
    let timeoutHandle: number | undefined
    let observer: IntersectionObserver | undefined

    const markShouldLoad = () => setShouldLoadVideo(true)

    if (loadStrategy === "immediate") {
      markShouldLoad()
      return
    }

    if (loadStrategy === "idle") {
      const idleWindow = window as Window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
        cancelIdleCallback?: (handle: number) => void
      }

      if (idleWindow.requestIdleCallback) {
        idleHandle = idleWindow.requestIdleCallback(markShouldLoad, { timeout: 1800 })
      } else {
        timeoutHandle = window.setTimeout(markShouldLoad, 900)
      }

      return () => {
        if (idleHandle !== undefined) idleWindow.cancelIdleCallback?.(idleHandle)
        if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle)
      }
    }

    if ("IntersectionObserver" in window && rootRef.current) {
      observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) return
          markShouldLoad()
          observer?.disconnect()
        },
        { rootMargin }
      )
      observer.observe(rootRef.current)
    } else {
      markShouldLoad()
    }

    return () => observer?.disconnect()
  }, [hasVideoError, loadStrategy, matchesMedia, rootMargin])

  const renderVideo = matchesMedia && shouldLoadVideo && !hasVideoError && (src || sources?.length)
  const markVideoReady = () => setIsVideoReady(true)

  // 멈춤·재생. 영상이 새로 붙을 때(renderVideo)도 다시 맞춘다 — 멈춘 채로 붙으면 autoPlay 를 바로 멈춘다
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (paused) video.pause()
    else video.play().catch(() => {})
  }, [paused, renderVideo])

  return (
    <div ref={rootRef} className={cn("relative overflow-hidden", className)}>
      {posterSrc ? (
        <Image
          src={posterSrc}
          alt={posterAlt}
          fill
          priority={priority}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          sizes={sizes}
          aria-hidden={posterAlt ? undefined : true}
          className={cn("object-cover", imageClassName)}
        />
      ) : null}

      {renderVideo ? (
        <video
          ref={videoRef}
          className={cn(
            "absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-700 ease-out",
            isVideoReady && "opacity-100",
            videoClassName
          )}
          src={src}
          autoPlay
          muted
          loop
          playsInline
          preload={preload}
          poster={posterSrc}
          aria-hidden={ariaHidden}
          aria-label={ariaHidden ? undefined : videoAriaLabel}
          onLoadedData={markVideoReady}
          onCanPlay={markVideoReady}
          onPlaying={markVideoReady}
          onError={() => {
            setHasVideoError(true)
            setIsVideoReady(false)
          }}
        >
          {sources?.map((source) => (
            <source key={`${source.src}-${source.type}`} src={source.src} type={source.type} />
          ))}
        </video>
      ) : null}
    </div>
  )
}
