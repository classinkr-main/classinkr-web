"use client"

import { useCallback, useState } from "react"
import { Play } from "lucide-react"

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
      <div className="flex aspect-video w-full items-center justify-center rounded-[16px] border border-black/[0.08] bg-[#F6F5F4] p-6 text-center">
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
        className="group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-[16px] border border-black/[0.08] bg-[#111110] shadow-[rgba(0,0,0,0.06)_0px_6px_22px]"
        aria-label={`${title} 재생`}
      >
        {/* maxresdefault 는 일부 영상에 없어 404 가 날 수 있다. 항상 존재하는
            hqdefault 를 아래에 깔고 그 위에 maxres 를 얹어, 고화질이 있으면 덮고
            없으면 hqdefault 가 비치도록 한다(포스터가 검게 비는 것 방지). */}
        <span
          className="absolute inset-0 bg-cover bg-center opacity-65 transition-all duration-500 group-hover:scale-105 group-hover:opacity-75"
          style={{ backgroundImage: `url(https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg)` }}
        />
        <span
          className="absolute inset-0 bg-cover bg-center opacity-65 transition-all duration-500 group-hover:scale-105 group-hover:opacity-75"
          style={{
            backgroundImage: `url(https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg)`,
          }}
        />
        <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        <span className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full bg-white/90 text-[#084734] shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-transform duration-300 group-hover:scale-110">
          <Play className="h-7 w-7 translate-x-0.5 fill-current" />
        </span>
        <span className="absolute bottom-4 left-5 right-5 text-left text-[13px] font-semibold text-white/90">
          클릭하여 영상 재생
        </span>
      </button>
    )
  }

  return (
    <div className="aspect-video w-full overflow-hidden rounded-[16px] border border-black/[0.08] bg-black shadow-[rgba(0,0,0,0.06)_0px_6px_22px]">
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
