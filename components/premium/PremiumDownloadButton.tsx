"use client"

import { useState } from "react"
import { Download, Loader2 } from "lucide-react"

interface PremiumDownloadButtonProps {
  slug: string
  label?: string
}

interface DownloadResponse {
  ok?: boolean
  url?: string
  error?: string
  code?: string
}

export function PremiumDownloadButton({ slug, label = "프리미엄 파일 내려받기" }: PremiumDownloadButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleDownload = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/premium/${encodeURIComponent(slug)}/download`, {
        method: "POST",
        credentials: "same-origin",
      })
      const data = (await res.json().catch(() => null)) as DownloadResponse | null

      if (!res.ok || !data?.url) {
        setError(data?.error ?? "다운로드를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.")
        return
      }
      window.location.href = data.url
    } catch {
      setError("네트워크 오류로 다운로드를 시작하지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-[6px] bg-[#084734] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#065c41] disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {label}
      </button>
      {error ? (
        <p role="alert" className="mt-3 text-[13px] leading-5 text-[#B85C33]">
          {error}
        </p>
      ) : null}
      <p className="mt-3 text-[12px] leading-5 text-[#A39E98]">
        다운로드 링크는 보안을 위해 매번 새로 발급되며 짧은 시간 동안만 유효합니다.
      </p>
    </div>
  )
}
