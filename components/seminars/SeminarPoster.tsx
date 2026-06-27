import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface SeminarPosterProps {
  /** 결정형 포스터 변형을 위한 시드 (보통 slug). */
  seed: string
  /** 커스텀 포스터 이미지(YouTube 썸네일 아님). 있으면 그라디언트 대신 사용. */
  posterUrl?: string | null
  className?: string
  children?: ReactNode
}

// 시드 문자열 → 안정적 정수 해시. 같은 slug 는 항상 같은 포스터를 만든다.
function hashSeed(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return hash
}

/**
 * 회원 전용 영상의 공개 포스터. YouTube 썸네일을 노출하지 않기 위해
 * slug 기반 결정형 브랜드 그라디언트(그린 팔레트)로 그린다. children 은 위에 오버레이된다.
 */
export function SeminarPoster({ seed, posterUrl, className, children }: SeminarPosterProps) {
  const hash = hashSeed(seed)
  const angle = 104 + (hash % 48) // 104–151deg
  const glowX = 16 + (hash % 26) // 16–41%
  const ringScale = 0.9 + (hash % 5) * 0.06 // 0.9–1.14

  return (
    <div className={cn("relative overflow-hidden bg-[#ECFDF5]", className)}>
      {posterUrl ? (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${posterUrl})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
        </>
      ) : (
        <>
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(${angle}deg, #ECFDF5 0%, #D1FAE5 52%, #A7F3D0 100%)`,
            }}
          />
          {/* 밝은 하이라이트 */}
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(120% 95% at ${glowX}% 16%, rgba(255,255,255,0.9), transparent 58%)`,
            }}
          />
          {/* 깊이용 다크 그린 비네트 */}
          <div
            className="absolute -bottom-1/3 -right-1/4 h-[130%] w-[75%] rounded-full"
            style={{
              background:
                "radial-gradient(closest-side, rgba(8,71,52,0.20), rgba(8,71,52,0) 70%)",
            }}
          />
          {/* 동심 링 워터마크 */}
          <svg
            className="absolute left-1/2 top-1/2 h-[150%] w-[150%] -translate-x-1/2 -translate-y-1/2 text-[#084734]"
            viewBox="0 0 200 200"
            fill="none"
            aria-hidden
            style={{ transform: `translate(-50%, -50%) scale(${ringScale})`, opacity: 0.07 }}
          >
            <circle cx="100" cy="100" r="38" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="100" cy="100" r="58" stroke="currentColor" strokeWidth="1" />
            <circle cx="100" cy="100" r="80" stroke="currentColor" strokeWidth="0.75" />
          </svg>
        </>
      )}
      {children}
    </div>
  )
}
