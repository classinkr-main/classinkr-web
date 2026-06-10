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
  posterSrc: string
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
}: HeroVideoBackdropProps) {
  const rootRef = useRef<HTMLDivElement>(null)
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

  return (
    <div ref={rootRef} className={cn("relative overflow-hidden", className)}>
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

      {renderVideo ? (
        <video
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-[opacity,transform,filter] duration-[1400ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
            !isVideoReady && "scale-[1.025] opacity-0 blur-[3px]",
            isVideoReady && "scale-100 opacity-100",
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
