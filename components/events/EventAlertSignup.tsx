"use client"

import { useState } from "react"
import { Bell, CheckCircle2, Loader2 } from "lucide-react"

import { trackEvent } from "@/lib/analytics"
import { submitLead } from "@/lib/submitLead"

interface EventAlertSignupProps {
  /** 어떤 행사 페이지에서 구독했는지 추적용 */
  eventSlug: string
}

/**
 * 마감된 행사 페이지의 dead-end 해소용 — 다음 행사 소식 이메일 구독.
 * 기존 newsletter 리드 경로를 재사용한다 (sourceDetail로 행사 알림 출처 기록).
 */
export function EventAlertSignup({ eventSlug }: EventAlertSignupProps) {
  const [email, setEmail] = useState("")
  const [website, setWebsite] = useState("") // honeypot
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      await submitLead({
        source: "newsletter",
        sourceDetail: `event_alert:${eventSlug}`,
        email,
        marketingConsent: true,
        website: website || undefined,
      })
      trackEvent("submit_newsletter", { source: `event_alert:${eventSlug}` })
      setSubmitted(true)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "구독 신청에 실패했습니다. 잠시 후 다시 시도해 주세요."
      )
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[#BDEFD8] bg-[#ECFDF5] px-5 py-4 text-[14px] font-medium text-[#084734]">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        다음 행사가 열리면 이메일로 알려드릴게요.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
      {/* 스팸 봇 honeypot — 사용자에게 보이지 않으며 값이 채워지면 서버가 무시 */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] top-0 h-px w-px"
      />
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="이메일 주소"
        aria-label="다음 행사 알림 받을 이메일"
        className="h-11 flex-1 rounded-xl border border-[#e0e0dc] bg-white px-4 text-[14px] shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#084734]"
      />
      <button
        type="submit"
        disabled={loading}
        className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#084734] px-5 text-[14px] font-bold text-white transition-colors hover:bg-[#065c41] disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
        다음 행사 알림 받기
      </button>
      {error && (
        <p role="alert" className="text-[13px] text-red-600 sm:basis-full">
          {error}
        </p>
      )}
    </form>
  )
}
