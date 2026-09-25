"use client"

// "Compass에서 열기" — A안(2026-09-25): 리드 응대·전화는 Compass(mkt.classin.co.kr)에서 한다.
// Home 화면은 판단·집계를 하고, 리드 행동은 이 새 탭 링크로 Compass 에 넘긴다(교차 쓰기 0 — 링크뿐).
//
// URL 은 lib/compass/normalize.ts compassLeadUrl(leadId) 하나만 쓴다(새 목록 필터 URL 을 만들지 않는다).
// 행 전체가 상세 진입점인 표·목록 안에서도 쓰이므로 클릭이 행 열기로 새어 나가지 않게 막는다.
// 조상이 <button> 인 자리에서는 쓰지 않는다(button 안의 a 는 유효하지 않은 DOM) — CompassLeadChip 의
// interactive=false 처럼 호출부가 판단한다.

import { ArrowUpRight } from "lucide-react"

import { compassLeadUrl } from "@/lib/compass/normalize"

export const COMPASS_OPEN_LABEL = "Compass에서 열기"

export type CompassOpenLinkVariant = "primary" | "secondary" | "icon" | "inline"

const VARIANT_CLASS: Record<CompassOpenLinkVariant, string> = {
  // 주 행동 — CTA 채움은 Classin Green 만(DESIGN.md).
  primary:
    "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md bg-[#084734] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#065c41]",
  secondary:
    "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-[#E5E5E0] bg-white px-3 text-[13px] font-semibold text-[#31302E] transition-colors hover:border-[#A39E98] hover:text-[#111110]",
  icon:
    "inline-flex h-8 w-8 items-center justify-center rounded-md text-[#615D59] transition-colors hover:bg-black/[0.05] hover:text-[#111110]",
  inline: "inline-flex items-center gap-0.5 text-[12px] font-medium text-[#084734] hover:underline",
}

export interface CompassOpenLinkProps {
  /** Compass 리드 id — href 가 없으면 이것으로 URL 을 만든다. */
  compassLeadId?: number | null
  /** 이미 만든 URL(예: 통합 행의 compass.url). 있으면 우선한다. */
  href?: string | null
  /** 누구의 Compass 기록인지 — 스크린리더 라벨에 붙인다. */
  name?: string | null
  variant?: CompassOpenLinkVariant
  label?: string
  className?: string
  testId?: string
}

/** 링크를 만들 수 없으면(id·href 모두 없음) null — 호출부가 대체 UI 를 고른다. */
export function resolveCompassOpenHref(input: Pick<CompassOpenLinkProps, "compassLeadId" | "href">): string | null {
  const href = input.href?.trim()
  if (href) return href
  if (typeof input.compassLeadId === "number" && Number.isFinite(input.compassLeadId) && input.compassLeadId > 0) {
    return compassLeadUrl(input.compassLeadId)
  }
  return null
}

export default function CompassOpenLink({
  compassLeadId,
  href,
  name,
  variant = "secondary",
  label = COMPASS_OPEN_LABEL,
  className = "",
  testId,
}: CompassOpenLinkProps) {
  const url = resolveCompassOpenHref({ compassLeadId, href })
  if (!url) return null
  const accessibleLabel = `${name ? `${name} ` : ""}${label} (새 탭)`
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      aria-label={accessibleLabel}
      title={accessibleLabel}
      data-testid={testId}
      className={`${VARIANT_CLASS[variant]} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734] ${className}`}
    >
      {variant === "icon" ? null : <span>{label}</span>}
      <ArrowUpRight aria-hidden className={variant === "inline" ? "h-3 w-3" : "h-4 w-4"} />
    </a>
  )
}
