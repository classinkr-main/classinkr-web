"use client"

import { useState } from "react"
import Link from "next/link"
import { Eye, EyeOff, Loader2 } from "lucide-react"

import { AuthShell, AUTH_INPUT_CLASS } from "@/components/auth/AuthShell"
import { SocialLoginRow } from "@/components/auth/SocialLoginRow"
import { mapAuthError, validateEmail } from "@/lib/auth/auth-messages"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

interface PublicLoginPanelProps {
  nextPath?: string
  /** 로그인 후 어떤 콘텐츠로 돌아가는지 사용자에게 보여줄 안내 문구. */
  returnLabel?: string
}

export function PublicLoginPanel({ nextPath = "/account", returnLabel }: PublicLoginPanelProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError("")

    const emailError = validateEmail(email)
    if (emailError) {
      setError(emailError)
      return
    }
    if (!password) {
      setError("비밀번호를 입력해 주세요.")
      return
    }

    setSubmitting(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })
      if (signInError) {
        setError(mapAuthError(signInError.message))
        setSubmitting(false)
        return
      }
      // 세션 쿠키가 서버 렌더에 반영되도록 전체 이동한다.
      window.location.assign(nextPath)
    } catch {
      setError("로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")
      setSubmitting(false)
    }
  }

  const loginSubtitle = returnLabel
    ? `로그인 후 ${returnLabel}(으)로 이동합니다.`
    : "심화·프리미엄 자료 열람을 위한 로그인"

  return (
    <AuthShell
      title="로그인"
      subtitle={loginSubtitle}
      footer={
        <>
          계정이 없으신가요?{" "}
          <Link
            href={`/signup?next=${encodeURIComponent(nextPath)}`}
            className="font-bold text-[#084734] hover:underline"
          >
            회원가입
          </Link>
        </>
      }
      legal="로그인하면 서비스 약관과 개인정보 처리방침에 동의하는 것으로 간주됩니다."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
        <input
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="아이디 (이메일)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
          className={AUTH_INPUT_CLASS}
        />
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="비밀번호"
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

        <button
          type="submit"
          disabled={submitting}
          className="mt-1.5 flex h-12 w-full items-center justify-center gap-2 rounded-[6px] bg-[#084734] text-[15px] font-semibold text-white transition-colors hover:bg-[#065c41] disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          로그인하기
        </button>
      </form>

      <div className="mt-3 flex justify-end text-[12px]">
        <Link href="/forgot-password" className="text-[#615D59] hover:text-[#084734]">
          비밀번호 찾기
        </Link>
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-center text-[13px] leading-5 text-[#B85C33]">
          {error}
        </p>
      ) : null}

      <SocialLoginRow nextPath={nextPath} />
    </AuthShell>
  )
}
