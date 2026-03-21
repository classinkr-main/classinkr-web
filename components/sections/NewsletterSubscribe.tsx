/**
 * ─────────────────────────────────────────────────────────────
 * NewsletterSubscribe  —  뉴스레터 이메일 간편 구독 컴포넌트
 * ─────────────────────────────────────────────────────────────
 *
 * [NOTE-22] 사용처
 *   - Footer 하단: 이메일 입력만으로 간편 구독
 *   - FinalCTA 섹션: 기존 CTA와 함께 배치 가능
 *
 *   구독 시 /api/newsletter/subscribe 호출 → 구독자 DB에 등록
 *   + 기존 Google Sheets 웹훅에도 자동 기록 [NOTE-15]
 *
 * [NOTE-23] 옵트인 동의 문구
 *   개인정보보호법 준수를 위해 구독 버튼 하단에
 *   수신 동의 안내 문구를 반드시 표시.
 */

"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Loader2, Mail } from "lucide-react"

interface Props {
  /** 컴포넌트 배경 테마 */
  variant?: "light" | "dark"
}

export function NewsletterSubscribe({ variant = "dark" }: Props) {
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
        body: JSON.stringify({ email }),
      })

      const data = await res.json()

      if (res.ok && data.ok) {
        setSubmitted(true)
      } else {
        setError(data.error || "구독에 실패했습니다.")
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.")
    } finally {
      setLoading(false)
    }
  }

  const isDark = variant === "dark"

  if (submitted) {
    return (
      <div className="flex items-center gap-2 py-2">
        <CheckCircle2 className={`w-5 h-5 ${isDark ? "text-green-400" : "text-green-600"}`} />
        <span className={`text-sm font-medium ${isDark ? "text-slate-200" : "text-[#111110]"}`}>
          구독이 완료되었습니다! 소식을 기대해주세요.
        </span>
      </div>
    )
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Mail className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? "text-slate-500" : "text-[#1a1a1a]/30"}`} />
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일을 입력해주세요"
            required
            className={`pl-10 ${
              isDark
                ? "bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                : "bg-white border-[#e8e8e4] text-[#111110]"
            }`}
          />
        </div>
        <Button
          type="submit"
          disabled={loading}
          className={
            isDark
              ? "bg-[#084734] hover:bg-[#084734]/90 text-white whitespace-nowrap"
              : "bg-[#084734] hover:bg-[#084734]/90 text-white whitespace-nowrap"
          }
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "무료 구독"
          )}
        </Button>
      </form>

      {error && (
        <p className={`text-sm mt-2 ${isDark ? "text-red-400" : "text-red-500"}`}>
          {error}
        </p>
      )}

      {/* [NOTE-23] 옵트인 동의 안내 문구 (법적 필수) */}
      <p className={`text-[10px] mt-2 leading-relaxed ${isDark ? "text-slate-500" : "text-[#1a1a1a]/30"}`}>
        구독 시 Classin의 교육 인사이트, 제품 업데이트, 행사 안내를 이메일로 받아보는 것에 동의합니다.
        언제든지 수신거부할 수 있습니다.
      </p>
    </div>
  )
}
