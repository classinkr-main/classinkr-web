"use client"

import { useState } from "react"
import Link from "next/link"
import { Loader2, MailCheck } from "lucide-react"

import { AuthShell, AUTH_INPUT_CLASS } from "@/components/auth/AuthShell"
import { mapAuthError, validateEmail } from "@/lib/auth/auth-messages"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

export function ForgotPasswordPanel() {
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [sentTo, setSentTo] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError("")

    const emailError = validateEmail(email)
    if (emailError) return setError(emailError)

    setSubmitting(true)
    try {
      const normalizedEmail = email.trim().toLowerCase()
      const origin = window.location.origin
      const supabase = createSupabaseBrowserClient()
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${origin}/auth/confirm?next=${encodeURIComponent("/auth/reset-password")}`,
      })
      if (resetError) {
        setError(mapAuthError(resetError.message))
        setSubmitting(false)
        return
      }
      setSentTo(normalizedEmail)
    } catch {
      setError("요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")
      setSubmitting(false)
    }
  }

  if (sentTo) {
    return (
      <AuthShell title="재설정 메일을 보냈습니다" legal="메일이 보이지 않으면 스팸함을 확인해 주세요.">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ECFDF5] text-[#084734]">
            <MailCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="mt-4 text-[14px] leading-7 text-[#31302E]">
            <span className="font-semibold text-[#111110]">{sentTo}</span> 로
            <br />
            비밀번호 재설정 링크를 보냈습니다.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-[6px] bg-[#084734] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#065c41]"
          >
            로그인으로 이동
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="비밀번호 찾기"
      subtitle="가입한 이메일로 재설정 링크를 보내드립니다."
      footer={
        <Link href="/login" className="font-bold text-[#084734] hover:underline">
          로그인으로 돌아가기
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
        <input
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="가입한 이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
          className={AUTH_INPUT_CLASS}
        />
        <button
          type="submit"
          disabled={submitting}
          className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-[6px] bg-[#084734] text-[15px] font-semibold text-white transition-colors hover:bg-[#065c41] disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          재설정 메일 받기
        </button>
      </form>

      {error ? (
        <p role="alert" className="mt-4 text-center text-[13px] leading-5 text-[#B85C33]">
          {error}
        </p>
      ) : null}
    </AuthShell>
  )
}
