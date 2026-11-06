"use client"

import { FileDown } from "lucide-react"

import { trackEvent } from "@/lib/analytics"
import { getIntroAsset } from "@/lib/introduction/assets"
import { cn } from "@/lib/utils"

import { STORY_SOURCE, type StoryPdf } from "./story-copy"

/**
 * 소개서·제안서 PDF 바로 받기. 공용 IntroDownloadLink 는 source 가 introduction 으로 고정이라 이 페이지 전용으로 둔다.
 * 두 이벤트를 낸다 — click_cta(이 페이지 CTA 위치별 id)와 download_materials(자료 다운로드 지표, 다른 페이지와 같은 asset_id).
 * next/link 가 아니라 <a download> 다(PDF 는 라우트가 아니라 prefetch 하지 않는다).
 */
export function StoryPdfLink({
  pdf,
  ctaId,
  className,
}: {
  pdf: StoryPdf
  ctaId: string
  className?: string
}) {
  const { download, shortLabel } = pdf
  const file = getIntroAsset(download.asset)
  return (
    <a
      href={file.src}
      download={download.fileName}
      onClick={() => {
        const page = window.location.pathname
        trackEvent("click_cta", {
          button: ctaId,
          destination: file.src,
          page,
          source: STORY_SOURCE,
          lead_magnet: download.id,
        })
        trackEvent("download_materials", { asset_id: download.id, page, source: STORY_SOURCE })
      }}
      className={cn("gap-2", className)}
    >
      <FileDown aria-hidden="true" className="size-4 shrink-0" />
      <span>
        {shortLabel} PDF <span className="font-normal text-fg-muted">· {download.size}</span>
      </span>
    </a>
  )
}
