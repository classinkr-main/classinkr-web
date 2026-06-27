"use client"

import { useCallback, useState } from "react"
import { PlayCircle } from "lucide-react"

import { trackEvent } from "@/lib/analytics"

interface SeminarPlayerProps {
  slug: string
  youtubeId: string
  title: string
  /** 영상 ID 가 아직 플레이스홀더면 임베드 대신 안내를 보여준다. */
  isPlaceholder?: boolean
}

export function SeminarPlayer({ slug, youtubeId, title, isPlaceholder }: SeminarPlayerProps) {
  const [started, setStarted] = useState(false)

  const handlePlay = useCallback(() => {
    setStarted(true)
    trackEvent("view_demo_video", { source: "seminar", seminar: slug })
    fetch(`/api/seminars/${encodeURIComponent(slug)}/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch(() => {})
  }, [slug])

  if (isPlaceholder) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-[12px] border border-black/[0.08] bg-[#F6F5F4] p-6 text-center">
        <p className="text-[14px] leading-6 text-[#615D59]">
          영상 링크가 아직 등록되지 않았습니다.
          <br />
          운영팀이 YouTube 링크를 연결하면 이 자리에서 바로 재생됩니다.
        </p>
      </div>
    )
  }

  if (!started) {
    return (
      <button
        type="button"
        onClick={handlePlay}
        className="group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-[12px] border border-black/[0.08] bg-[#111110]"
        aria-label={`${title} 재생`}
      >
        <span
          className="absolute inset-0 bg-cover bg-center opacity-60 transition-opacity group-hover:opacity-70"
          style={{
            backgroundImage: `url(https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg)`,
          }}
        />
        <span className="relative flex flex-col items-center gap-3 text-white">
          <PlayCircle className="h-16 w-16 drop-shadow-lg transition-transform group-hover:scale-105" />
          <span className="text-[14px] font-semibold">영상 재생</span>
        </span>
      </button>
    )
  }

  return (
    <div className="aspect-video w-full overflow-hidden rounded-[12px] border border-black/[0.08] bg-black">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1`}
        title={title}
        className="h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  )
}
