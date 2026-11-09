"use client"

import { FileDown } from "lucide-react"

import { trackEvent } from "@/lib/analytics"
import { getIntroAsset } from "@/lib/introduction/assets"
import type { IntroDownload } from "@/lib/introduction/content"
import { cn } from "@/lib/utils"

/**
 * 글줄 크기 PDF 내려받기 — 표지와 마지막 띠처럼 버튼 곁에 놓는 자리용. 상자형은 공용 IntroDownloadLink 다.
 * 계측은 같은 download_materials(asset_id) 하나이고 source 만 이 페이지 값이다.
 * (source 를 props 로 받는다 — 문구 모듈을 클라이언트 번들에 끌어오지 않으려고)
 */
export function ProofPdfLink({
  download,
  source,
  className,
}: {
  download: IntroDownload
  source: string
  className?: string
}) {
  const file = getIntroAsset(download.asset)
  return (
    <a
      href={file.src}
      download={download.fileName}
      onClick={() =>
        trackEvent("download_materials", {
          asset_id: download.id,
          page: window.location.pathname,
          source,
        })
      }
      className={cn("group inline-flex min-h-11 items-center gap-2 text-caption", className)}
    >
      <FileDown aria-hidden="true" className="size-4 shrink-0 text-fg-accent" />
      <span className="font-semibold text-fg-accent underline-offset-4 group-hover:underline">{download.label}</span>
      <span className="text-fg-muted">PDF {download.size}</span>
    </a>
  )
}
