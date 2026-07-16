"use client"

import * as React from "react"
import { Apple, Download, Monitor, School, Smartphone, Terminal } from "lucide-react"

import { TrackedLink } from "@/components/TrackedLink"
import {
  CLASSIN_VERSION,
  PRIMARY_DOWNLOADS,
  SECONDARY_DOWNLOADS,
  detectPrimaryOs,
  highlightPlatformId,
  type DownloadIcon,
  type DownloadPlatform,
  type DownloadVariant,
} from "@/lib/downloads"

const ICONS: Record<DownloadIcon, React.ComponentType<{ className?: string }>> = {
  windows: Monitor,
  apple: Apple,
  mobile: Smartphone,
  linux: Terminal,
  classinx: School,
}

function ctaIdFor(platform: DownloadPlatform, variant: DownloadVariant) {
  const suffix = (variant.matchOs ?? variant.label).toLowerCase().replace(/\s+/g, "_")
  return `download_${platform.id}_${suffix}`
}

function DownloadLink({
  platform,
  variant,
  primary,
}: {
  platform: DownloadPlatform
  variant: DownloadVariant
  primary?: boolean
}) {
  return (
    <TrackedLink
      href={variant.href}
      ctaId={ctaIdFor(platform, variant)}
      tracking={{ platform: platform.id, variant: variant.label, version: CLASSIN_VERSION }}
      target="_blank"
      rel="noopener noreferrer"
      className={
        primary
          ? "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[8px] bg-[#084734] px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-[#065c41]"
          : "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] border border-[#084734]/20 bg-white px-3.5 py-2 text-[13px] font-semibold text-[#084734] transition-colors hover:bg-[#ECFDF5]"
      }
    >
      {primary ? <Download className="h-4 w-4" /> : null}
      {variant.label}
    </TrackedLink>
  )
}

function PlatformCard({ platform }: { platform: DownloadPlatform }) {
  const Icon = ICONS[platform.icon]
  return (
    <div className="rounded-[16px] border border-black/[0.08] bg-white p-5">
      <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#F6F5F4] text-[#111110]">
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-[15px] font-semibold text-[#111110]">{platform.os}</p>
      {platform.note ? <p className="mt-0.5 text-[13px] text-[#615D59]">{platform.note}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {platform.variants.map((variant) => (
          <DownloadLink key={variant.href} platform={platform} variant={variant} />
        ))}
      </div>
    </div>
  )
}

export function DownloadPageClient() {
  const [detected, setDetected] = React.useState<ReturnType<typeof detectPrimaryOs>>("windows")

  React.useEffect(() => {
    setDetected(detectPrimaryOs(navigator.userAgent))
  }, [])

  const highlightId = highlightPlatformId(detected)
  const highlight =
    PRIMARY_DOWNLOADS.find((platform) => platform.id === highlightId) ?? PRIMARY_DOWNLOADS[0]
  const HighlightIcon = ICONS[highlight.icon]

  return (
    <section className="pb-20 pt-28 md:pt-36">
      <div className="container mx-auto max-w-3xl px-5">
        <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-[#084734]">Download</p>
        <h1 className="mt-2.5 text-[2rem] font-semibold leading-[1.2] tracking-[-0.02em] text-[#111110] md:text-[2.4rem]">
          Classin 앱 다운로드
        </h1>
        <p className="mt-2 text-[15px] leading-7 text-[#615D59]">
          수업에 필요한 Classin을 기기에 맞게 설치하세요. 현재 버전 {CLASSIN_VERSION}
        </p>

        <div className="mt-8 flex flex-col gap-4 rounded-[16px] border border-black/[0.08] bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] bg-[#ECFDF5] text-[#084734]">
              <HighlightIcon className="h-6 w-6" />
            </span>
            <div>
              <p className="text-[11px] font-semibold text-[#084734]">현재 사용 중인 기기</p>
              <p className="text-[16px] font-semibold text-[#111110]">
                {highlight.os}
                {highlight.note ? ` · ${highlight.note}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {highlight.variants.map((variant) => (
              <DownloadLink key={variant.href} platform={highlight} variant={variant} primary />
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {PRIMARY_DOWNLOADS.map((platform) => (
            <PlatformCard key={platform.id} platform={platform} />
          ))}
        </div>

        <p className="mb-3 mt-10 text-[12px] font-medium uppercase tracking-[0.12em] text-[#615D59]">
          기타 플랫폼
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SECONDARY_DOWNLOADS.map((platform) => (
            <PlatformCard key={platform.id} platform={platform} />
          ))}
        </div>
      </div>
    </section>
  )
}
