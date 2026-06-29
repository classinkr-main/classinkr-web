"use client"

import { useState } from "react"
import Link from "next/link"
import { Eye, EyeOff, Loader2 } from "lucide-react"

import { AuthShell, AUTH_INPUT_CLASS } from "@/components/auth/AuthShell"
import { mapAuthError, validatePassword } from "@/lib/auth/auth-messages"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

interface ResetPasswordPanelProps {
  nextPath?: string
}

export function ResetPasswordPanel({ nextPath = "/account" }: ResetPasswordPanelProps) {
  const [password, setPassword] = useState("")
  const [passwordConfirm, setPasswordConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError("")

    const passwordError = validatePassword(password)
    if (passwordError) return setError(passwordError)
    if (password !== passwordConfirm) return setError("비밀번호가 일치하지 않습니다.")

    setSubmitting(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(mapAuthError(updateError.message))
        setSubmitting(false)
        return
      }
      setDone(true)
      // 새 비밀번호가 적용된 세션으로 잠시 후 이동한다.
      window.setTimeout(() => window.location.assign(nextPath), 1200)
    } catch {
      setError("비밀번호 변경 중 오류가 발생했습니다. 링크를 다시 요청해 주세요.")
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <AuthShell title="비밀번호가 변경되었습니다" subtitle="잠시 후 자동으로 이동합니다.">
        <div className="flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-[#084734]" />
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="새 비밀번호 설정"
      subtitle="새로 사용할 비밀번호를 입력해 주세요."
      footer={
        <Link href="/login" className="font-bold text-[#084734] hover:underline">
          로그인으로 돌아가기
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="새 비밀번호 (8자 이상)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            className={`${AUTH_INPUT_CLASS} pr-11`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A39E98] transition-colors hover:text-[#615D59]"
          >
            {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
          </button>
        </div>
        <input
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          placeholder="새 비밀번호 확인"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          disabled={submitting}
          className={AUTH_INPUT_CLASS}
        />
        <button
          type="submit"
          disabled={submitting}
          className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-[6px] bg-[#084734] text-[15px] font-semibold text-white transition-colors hover:bg-[#065c41] disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          비밀번호 변경
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
