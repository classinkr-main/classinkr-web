"use client"

import { useState } from "react"
import { ArrowRight, CheckCircle2, Loader2, Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  FormHint,
  FormMessage,
  marketingFieldClassName,
} from "@/components/ui/marketing-form"
import { Input } from "@/components/ui/input"
import { trackEvent } from "@/lib/analytics"

interface Props {
  variant?: "light" | "dark"
  source?: string
}

export function NewsletterSubscribe({ variant = "dark", source = "footer_newsletter" }: Props) {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setLoading(true)
    setError("")

    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      })

      const data = await res.json()

      if (res.ok && data.ok) {
        trackEvent("submit_newsletter", { source })
        setSubmitted(true)
      } else {
        setError(data.error || "구독 처리 중 문제가 발생했습니다.")
      }
    } catch {
      setError("네트워크 상태를 확인한 뒤 다시 시도해 주세요.")
    } finally {
      setLoading(false)
    }
  }

  const isDark = variant === "dark"
  const fieldClassName = isDark
    ? `${marketingFieldClassName} border-white/10 bg-white/[0.07] text-white placeholder:text-white/40 focus-visible:border-white focus-visible:ring-white/10`
    : marketingFieldClassName

  if (submitted) {
    return (
      <div className="rounded-[22px] border border-[#DCE9E1] bg-[#F5FBF7] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="h-5 w-5 text-[#0E7A49]" />
          <span className="text-sm font-medium text-[#203127]">
            구독이 완료되었습니다. 새로운 제품 소식이 정리되면 가장 먼저 보내드릴게요.
          </span>
        </div>
      </div>
    )
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Mail
            className={`pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${
              isDark ? "text-white/30" : "text-[#7A857D]"
            }`}
          />
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="예: name@classin.com"
            required
            className={`${fieldClassName} h-10 rounded-[14px] pl-9 pr-3 text-[13px] placeholder:text-[12px]`}
          />
        </div>
        <Button
          type="submit"
          disabled={loading}
          size="default"
          className="h-10 min-w-[82px] rounded-[14px] px-4 text-sm whitespace-nowrap"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              처리 중
            </>
          ) : (
            <>
              구독
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </form>

      {error ? (
        <FormMessage className={isDark ? "mt-2 text-[#F8D4C3]" : "mt-2"}>
          {error}
        </FormMessage>
      ) : null}

      <FormHint className={isDark ? "mt-2 text-white/45" : "mt-2"}>
        구독 시 ClassIn의 교육 인사이트, 제품 업데이트, 웨비나 소식을 이메일로 받아보는 데
        동의한 것으로 간주됩니다. 언제든 수신 해지할 수 있습니다.
      </FormHint>
    </div>
  )
}
