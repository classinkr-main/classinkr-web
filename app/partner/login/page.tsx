"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
export default function PartnerLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [magicSent, setMagicSent] = useState(false)
  const [mode, setMode] = useState<"password" | "magic">("magic")
  const [shake, setShake] = useState(false)

  const triggerShake = () => {
    setShake(true)
    setTimeout(() => setShake(false), 200)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createSupabaseBrowserClient()

    if (mode === "magic") {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/partner/workspace` },
      })
      if (error) {
        setError(error.message)
        triggerShake()
      } else {
        setMagicSent(true)
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError("이메일 또는 비밀번호가 올바르지 않습니다")
        triggerShake()
      } else if (data.user) {
        // status → active, last_login_at 갱신은 서버에서
        await fetch("/api/partner/session", { method: "POST" })
        router.push("/partner/workspace")
      }
    }
    setLoading(false)
  }

  if (magicSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f7f5] p-4">
        <div className="bg-white rounded-2xl border border-[#e8e8e4] shadow-sm p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">📧</div>
          <h2 className="text-base font-semibold text-[#1a1a1a] mb-2">이메일을 확인하세요</h2>
          <p className="text-sm text-[#1a1a1a]/50">
            <span className="font-medium text-[#1a1a1a]">{email}</span>으로 로그인 링크를 발송했습니다.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7f7f5] p-4">
      <div className="bg-white rounded-2xl border border-[#e8e8e4] shadow-sm w-full max-w-sm">
        <div className="p-8">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <Image
                src="/images/logo.png"
                alt="Classin"
                width={120}
                height={32}
                className="object-contain"
                style={{ width: "auto", height: "auto" }}
                priority
              />
            </div>
            <h1 className="text-base font-semibold text-[#111110]">파트너 포털</h1>
            <p className="text-xs text-[#A39E98] mt-1">Partner Portal</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="partner-email" className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">이메일</label>
              <input
                id="partner-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="partner@company.com"
                aria-invalid={!!error}
                aria-describedby="partner-login-error"
                className={`w-full border border-[#e8e8e4] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#084734] focus-visible:ring-2 focus-visible:ring-[#084734]/30${shake ? " animate-shake" : ""}`}
              />
            </div>

            {mode === "password" && (
              <div>
                <label htmlFor="partner-password" className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">비밀번호</label>
                <input
                  id="partner-password"
                  type="password"
                  required={mode === "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!error}
                  aria-describedby="partner-login-error"
                  className={`w-full border border-[#e8e8e4] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#084734] focus-visible:ring-2 focus-visible:ring-[#084734]/30${shake ? " animate-shake" : ""}`}
                />
              </div>
            )}

            {error && (
              <p id="partner-login-error" role="alert" aria-live="polite" className="text-xs text-[#B85C33]">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1a1a1a] text-white rounded-xl py-2.5 text-sm font-medium hover:bg-[#333] transition-colors disabled:opacity-50"
            >
              {loading ? "처리 중..." : mode === "magic" ? "로그인 링크 받기" : "로그인"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => { setMode(mode === "magic" ? "password" : "magic"); setError(null) }}
            className="w-full mt-4 text-xs text-[#1a1a1a]/40 hover:text-[#1a1a1a] text-center"
          >
            {mode === "magic" ? "비밀번호로 로그인" : "이메일 링크로 로그인"}
          </button>
        </div>
      </div>
    </div>
  )
}
