"use client"

import { useState } from "react"
import Link from "next/link"
import { CheckCircle2, Eye, EyeOff, Loader2, MailCheck } from "lucide-react"

import { AuthShell, AUTH_INPUT_CLASS } from "@/components/auth/AuthShell"
import { SocialLoginRow } from "@/components/auth/SocialLoginRow"
import { mapAuthError, validateEmail, validatePassword } from "@/lib/auth/auth-messages"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

interface SignupPanelProps {
  nextPath?: string
}

export function SignupPanel({ nextPath = "/account" }: SignupPanelProps) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [passwordConfirm, setPasswordConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [sentTo, setSentTo] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError("")

    const emailError = validateEmail(email)
    if (emailError) return setError(emailError)
    const passwordError = validatePassword(password)
    if (passwordError) return setError(passwordError)
    if (password !== passwordConfirm) return setError("비밀번호가 일치하지 않습니다.")

    setSubmitting(true)
    try {
      // 마케팅 동의 의도를 보존 — 확인 후 첫 로그인 시 /account가 한 번 반영한다.
      try {
        if (marketingOptIn) window.localStorage.setItem("cln_pending_marketing_consent", "1")
        else window.localStorage.removeItem("cln_pending_marketing_consent")
      } catch {
        // 스토리지 접근 실패는 무시
      }

      const normalizedEmail = email.trim().toLowerCase()
      const origin = window.location.origin
      const supabase = createSupabaseBrowserClient()
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: name.trim() ? { name: name.trim() } : undefined,
          emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(nextPath)}`,
        },
      })
      if (signUpError) {
        setError(mapAuthError(signUpError.message))
        setSubmitting(false)
        return
      }
      // 이메일 확인이 꺼져 있으면 즉시 세션이 생긴다.
      if (data.session) {
        window.location.assign(nextPath)
        return
      }
      setSentTo(normalizedEmail)
    } catch {
      setError("회원가입 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")
      setSubmitting(false)
    }
  }

  if (sentTo) {
    return (
      <AuthShell title="확인 메일을 보냈습니다" legal="메일이 보이지 않으면 스팸함을 확인해 주세요.">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ECFDF5] text-[#084734]">
            <MailCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="mt-4 text-[14px] leading-7 text-[#31302E]">
            <span className="font-semibold text-[#111110]">{sentTo}</span> 로
            <br />
            확인 링크를 보냈습니다. 메일의 링크를 누르면 가입이 완료됩니다.
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
      title="회원가입"
      subtitle="이메일로 가입하고 심화·프리미엄 자료를 받아보세요."
      footer={
        <>
          이미 계정이 있으신가요?{" "}
          <Link
            href={`/login?next=${encodeURIComponent(nextPath)}`}
            className="font-bold text-[#084734] hover:underline"
          >
            로그인
          </Link>
        </>
      }
      legal="가입하면 서비스 약관과 개인정보 처리방침에 동의하는 것으로 간주됩니다."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
        <input
          type="text"
          autoComplete="name"
          placeholder="이름 (선택)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={submitting}
          className={AUTH_INPUT_CLASS}
        />
        <input
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
          className={AUTH_INPUT_CLASS}
        />
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="비밀번호 (8자 이상)"
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
          placeholder="비밀번호 확인"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          disabled={submitting}
          className={AUTH_INPUT_CLASS}
        />

        <label className="mt-1 flex items-start gap-2 text-[12px] leading-5 text-[#6B6661]">
          <input
            type="checkbox"
            checked={marketingOptIn}
            onChange={(e) => setMarketingOptIn(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-[rgba(0,0,0,0.2)] accent-[#084734]"
          />
          <span>
            (선택) 신규 자료·웨비나·제품 소식을 이메일로 받아보겠습니다. 가입 후 계정 설정에서 언제든
            해제할 수 있습니다.
          </span>
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-[6px] bg-[#084734] text-[15px] font-semibold text-white transition-colors hover:bg-[#065c41] disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
          가입하기
        </button>
      </form>

      {error ? (
        <p role="alert" className="mt-4 text-center text-[13px] leading-5 text-[#B85C33]">
          {error}
        </p>
      ) : null}

      <SocialLoginRow nextPath={nextPath} label="또는 SNS 계정으로 가입" />
    </AuthShell>
  )
}
