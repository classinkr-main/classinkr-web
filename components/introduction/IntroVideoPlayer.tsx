"use client"

import Image from "next/image"
import { useCallback, useState } from "react"
import { Play } from "lucide-react"

import { trackEvent } from "@/lib/analytics"
import { getIntroAsset, type IntroAssetKey } from "@/lib/introduction/assets"
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
 * 소개서 영상 한 편. 처음에는 next/image 포스터와 재생 버튼만 그린다(<video poster> 금지 규칙).
 * - YouTube: 누르면 youtube-nocookie 임베드로 바꾼다(첫 화면에서 외부 요청 0, 썸네일은 자체 호스팅).
 * - 파일(mp4): 누르면 <video controls autoPlay> 로 바꾼다. 세로 영상은 폭을 좁혀 가운데 둔다.
 */
export function IntroVideoPlayer({ video, source = "introduction", className, hideCaption }: IntroVideoPlayerProps) {
  const [started, setStarted] = useState(false)
  const portrait = video.kind === "file" && video.orientation === "portrait"

  const handlePlay = useCallback(() => {
    setStarted(true)
    const button = video.kind === "youtube" ? `youtube:${video.youtubeId}` : `file:${video.video}`
    trackEvent("view_demo_video", { button, page: window.location.pathname, source })
  }, [video, source])

  const frame = cn(
    "relative block w-full overflow-hidden border border-line-hair bg-surface-sunken",
    portrait ? "aspect-[9/16]" : "aspect-video"
  )

  return (
    <figure className={cn("min-w-0", portrait && "mx-auto w-full max-w-[22rem]", className)}>
      {started ? (
        video.kind === "youtube" ? (
          <div className={frame}>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${video.youtubeId}?autoplay=1&rel=0&modestbranding=1`}
              title={video.title}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        ) : (
          <video
            className={cn(frame, "object-contain")}
            src={getIntroAsset(video.video).src}
            controls
            autoPlay
            playsInline
            preload="auto"
            aria-label={video.title}
          />
        )
      ) : (
        <button type="button" onClick={handlePlay} aria-label={`${video.title} 재생`} className={cn(frame, "group")}>
          <Image
            src={posterOf(video)}
            alt=""
            fill
            sizes={portrait ? "352px" : "(min-width: 1024px) 600px, 100vw"}
            className="object-cover"
          />
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-(--radius-control) border border-line-hair bg-surface-sheet text-fg-ink transition-colors duration-(--motion-fast) ease-soft group-hover:border-line-ink"
          >
            <Play className="size-6 translate-x-0.5 fill-current" />
          </span>
        </button>
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

function posterOf(video: IntroVideo): string {
  if (video.kind === "youtube") return getIntroAsset(video.thumbnail).src
  const file = getIntroAsset(video.video as IntroAssetKey)
  return file.poster ?? file.src
}
