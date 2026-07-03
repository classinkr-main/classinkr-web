/* 서버/클라이언트 양쪽에서 쓰는 SW 페이지 공용 요소 (훅 없음) */

export function EyebrowTag({ children, center = true }: { children: React.ReactNode; center?: boolean }) {
    return (
        <div className={`flex items-center gap-3 mb-4 ${center ? "justify-center" : "justify-start"}`}>
            <div className="h-px w-5 bg-[#22A366]/40 shrink-0" />
            <p className="text-[11px] font-bold text-[#22A366] tracking-[0.2em] uppercase whitespace-nowrap">{children}</p>
            <div className="h-px w-5 bg-[#22A366]/40 shrink-0" />
        </div>
    )
}

/* ── Wave Divider ────────────────────────────────────────────────── */
export function WaveDivider({ flip = false, color = "#ffffff" }: { flip?: boolean; color?: string }) {
    return (
        <div className={`w-full overflow-hidden leading-[0] ${flip ? "rotate-180" : ""}`}>
            <svg viewBox="0 0 1440 60" preserveAspectRatio="none" className="w-full h-[40px] md:h-[60px]">
                <path d="M0,30 C360,60 720,0 1080,30 C1260,45 1380,20 1440,30 L1440,60 L0,60 Z" fill={color} />
            </svg>
        </div>
    )
}

// 640px 미만(폰)에서는 데이터 절약을 위해 영상 대신 포스터만 보여준다.
export const VIDEO_BACKDROP_MEDIA_QUERY = "(min-width: 640px) and (prefers-reduced-motion: no-preference)"
