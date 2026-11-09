"use client"

import { Download } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { trackEvent } from "@/lib/analytics"
import { getIntroAsset } from "@/lib/introduction/assets"
import type { IntroDownload } from "@/lib/introduction/content"
import { cn } from "@/lib/utils"

interface LandingPdfLinkProps {
  download: IntroDownload
  /** 계측 button 값(introduction_*) — 같은 PDF 라도 놓인 자리마다 다르다 */
  ctaId: string
  label: string
  /** button: line 버튼(크기 표시 포함) · text: 본문 링크(아이콘 앞) */
  variant?: "button" | "text"
  className?: string
}

/**
 * 랜딩의 PDF 내려받기. 이메일 없이 바로 받는 자료라 IntroDownloadLink 와 같은 download_materials(asset_id) 하나만
 * 남기고, 자리를 가르는 ctaId 를 button 값으로 같이 싣는다. 카드형 IntroDownloadLink 대신 시안 1 의 line 버튼·글 링크 모양이다.
 */
export function LandingPdfLink({ download, ctaId, label, variant = "button", className }: LandingPdfLinkProps) {
  const file = getIntroAsset(download.asset)
  const handleClick = () =>
    trackEvent("download_materials", {
      asset_id: download.id,
      button: ctaId,
      page: window.location.pathname,
      source: "introduction",
    })

  if (variant === "text") {
    return (
      <a
        href={file.src}
        download={download.fileName}
        onClick={handleClick}
        className={cn("link-body inline-flex min-h-11 items-center gap-2 text-ui font-medium", className)}
      >
        <Download aria-hidden="true" className="size-4 shrink-0" />
        <span>
          {label} <span aria-hidden="true">·</span> {download.size}
        </span>
      </a>
    )
  }

  return (
    <a
      href={file.src}
      download={download.fileName}
      onClick={handleClick}
      className={cn(buttonVariants({ variant: "line", size: "cta" }), "w-full sm:w-auto", className)}
    >
      {label}
      <span className="text-note font-medium tabular-nums text-fg-muted">{download.size}</span>
      <Download aria-hidden="true" />
    </a>
  )
}
