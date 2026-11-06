"use client"

import Image from "next/image"
import { useCallback, useRef, useState } from "react"
import { Play } from "lucide-react"

import { trackEvent } from "@/lib/analytics"
import { getIntroAsset } from "@/lib/introduction/assets"
import type { IntroVideo } from "@/lib/introduction/content"
import { cn } from "@/lib/utils"

interface IntroVideoPlayerProps {
  video: IntroVideo
  /** 계측 source 값(예: introduction, introduction_case) */
  source?: string
  className?: string
  /** 제목·채널 캡션을 숨길 때 */
  hideCaption?: boolean
}

/**
 * 소개서 영상 한 편.
 * - YouTube: 로컬 썸네일만 먼저 그리고, 누르면 youtube-nocookie 임베드로 바꾼다(첫 화면에서 외부 스크립트 0).
 * - 파일(mp4): preload="none" + 포스터. 세로 영상은 폭을 좁혀 가운데 둔다.
 */
export function IntroVideoPlayer({ video, source = "introduction", className, hideCaption }: IntroVideoPlayerProps) {
  const portrait = video.kind === "file" && video.orientation === "portrait"
  return (
    <figure className={cn("min-w-0", portrait && "mx-auto w-full max-w-[22rem]", className)}>
      {video.kind === "youtube" ? (
        <YouTubeLite video={video} source={source} />
      ) : (
        <FileVideo video={video} source={source} />
      )}
      {hideCaption ? null : (
        <figcaption className="mt-3 text-caption text-fg-muted">
          <span className="text-fg-body">{video.title}</span>
          {video.kind === "youtube" && video.channel ? <span> · {video.channel}</span> : null}
        </figcaption>
      )}
    </figure>
  )
}

function YouTubeLite({ video, source }: { video: Extract<IntroVideo, { kind: "youtube" }>; source: string }) {
  const [started, setStarted] = useState(false)
  const thumbnail = getIntroAsset(video.thumbnail)

  const handlePlay = useCallback(() => {
    setStarted(true)
    trackEvent("view_demo_video", { button: `youtube:${video.youtubeId}`, page: window.location.pathname, source })
  }, [video.youtubeId, source])

  if (started) {
    return (
      <div className="aspect-video w-full border border-line-hair bg-black">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${video.youtubeId}?autoplay=1&rel=0&modestbranding=1`}
          title={video.title}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={handlePlay}
      aria-label={`${video.title} 재생`}
      className="group relative block aspect-video w-full overflow-hidden border border-line-hair bg-black"
    >
      <Image
        src={thumbnail.src}
        alt=""
        fill
        sizes="(min-width: 1024px) 600px, 100vw"
        className="object-cover opacity-85 transition-opacity duration-500 group-hover:opacity-100 motion-reduce:transition-none"
      />
      <PlayGlyph />
    </button>
  )
}

function FileVideo({ video, source }: { video: Extract<IntroVideo, { kind: "file" }>; source: string }) {
  const file = getIntroAsset(video.video)
  const tracked = useRef(false)
  const portrait = video.orientation === "portrait"

  const handlePlay = useCallback(() => {
    if (tracked.current) return
    tracked.current = true
    trackEvent("view_demo_video", { button: `file:${video.video}`, page: window.location.pathname, source })
  }, [video.video, source])

  return (
    <video
      className={cn(
        "block w-full border border-line-hair bg-black",
        portrait ? "aspect-[9/16]" : "aspect-video"
      )}
      src={file.src}
      poster={file.poster}
      width={file.width}
      height={file.height}
      controls
      playsInline
      preload="none"
      onPlay={handlePlay}
      aria-label={video.title}
    />
  )
}

function PlayGlyph() {
  return (
    <span
      aria-hidden="true"
      className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-(--radius-control) bg-surface-sheet text-fg-ink transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none"
    >
      <Play className="size-6 translate-x-0.5 fill-current" />
    </span>
  )
}
