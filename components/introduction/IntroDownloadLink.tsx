"use client"

import { FileDown } from "lucide-react"

import { trackEvent } from "@/lib/analytics"
import { getIntroAsset } from "@/lib/introduction/assets"
import type { IntroDownload } from "@/lib/introduction/content"
import { cn } from "@/lib/utils"

/**
 * 소개서 PDF 내려받기. 이메일 없이 바로 받는 자료라 제품 페이지 소개서와 같은
 * download_materials(asset_id) 하나만 남긴다(app/product/hw·sw 와 같은 관례).
 */
export function IntroDownloadLink({ download, className }: { download: IntroDownload; className?: string }) {
  const file = getIntroAsset(download.asset)
  return (
    <a
      href={file.src}
      download={download.fileName}
      onClick={() =>
        trackEvent("download_materials", {
          asset_id: download.id,
          page: window.location.pathname,
          source: "introduction",
        })
      }
      className={cn(
        "group flex items-start gap-4 border border-line-control bg-surface-sheet px-5 py-4 transition-colors hover:border-line-ink",
        "rounded-(--radius-control)",
        className
      )}
    >
      <FileDown aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-fg-accent" />
      <span className="min-w-0">
        <span className="block text-ui font-semibold text-fg-ink group-hover:underline">{download.label}</span>
        <span className="mt-1 block text-caption text-fg-muted">
          {download.description} · PDF {download.size}
        </span>
      </span>
    </a>
  )
}
