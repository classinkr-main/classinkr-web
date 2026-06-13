"use client"

import { useState, useSyncExternalStore } from "react"
import { Check, Link2, Share2 } from "lucide-react"

import { trackEvent } from "@/lib/analytics"

// SSR에서는 false, 클라이언트에서 navigator.share 지원 여부 — hydration 불일치 없이 읽기
const noopSubscribe = () => () => {}
const useCanNativeShare = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false
  )

interface ShareActionsProps {
  title: string
  /** 절대 URL (서버에서 toAbsoluteUrl로 생성해 전달) */
  url: string
}

/**
 * 블로그 글 공유 액션 — 링크 복사 + 모바일 네이티브 공유 시트.
 * 네이티브 공유(navigator.share)는 모바일에서 카카오톡 등 설치된 앱으로 연결되므로
 * 별도 SDK 없이 한국 시장 공유 동선을 커버한다.
 */
export function ShareActions({ title, url }: ShareActionsProps) {
  const [copied, setCopied] = useState(false)
  const canNativeShare = useCanNativeShare()

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      trackEvent("click_cta", { button: "blog_share_copy", page: url })
    } catch {
      // clipboard 권한 거부 시 조용히 무시
    }
  }

  const handleNativeShare = async () => {
    trackEvent("click_cta", { button: "blog_share_native", page: url })
    try {
      await navigator.share({ title, url })
    } catch {
      // 사용자가 공유 시트를 닫은 경우 등 — 무시
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 rounded-full border border-[#e8e8e4] bg-white px-4 py-2 text-[13px] font-medium text-[#1a1a1a]/60 transition-colors hover:border-[#084734]/30 hover:text-[#084734]"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
        {copied ? "복사됨" : "링크 복사"}
      </button>
      {canNativeShare ? (
        <button
          type="button"
          onClick={handleNativeShare}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#e8e8e4] bg-white px-4 py-2 text-[13px] font-medium text-[#1a1a1a]/60 transition-colors hover:border-[#084734]/30 hover:text-[#084734]"
        >
          <Share2 className="h-3.5 w-3.5" />
          공유
        </button>
      ) : null}
    </div>
  )
}
