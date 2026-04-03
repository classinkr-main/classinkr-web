"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@/lib/supabase/browser"

export default function PartnerLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [magicSent, setMagicSent] = useState(false)
  const [mode, setMode] = useState<"password" | "magic">("magic")

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createBrowserClient()

    if (mode === "magic") {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/partner/dashboard` },
      })
      if (error) setError(error.message)
      else setMagicSent(true)
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError("이메일 또는 비밀번호가 올바르지 않습니다")
      } else if (data.user) {
        // status → active, last_login_at 갱신은 서버에서
        await fetch("/api/partner/session", { method: "POST" })
        router.push("/partner/dashboard")
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
            <h1 className="text-xl font-bold text-[#1a1a1a]">파트너 포털</h1>
            <p className="text-xs text-[#1a1a1a]/40 mt-1">ClassIn Partner Portal</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">이메일</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="partner@company.com"
                className="w-full border border-[#e8e8e4] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#1a1a1a]"
              />
            </div>

            {mode === "password" && (
              <div>
                <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">비밀번호</label>
                <input
                  type="password"
                  required={mode === "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-[#e8e8e4] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#1a1a1a]"
                />
              </div>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}

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
            onClick={() => setMode(mode === "magic" ? "password" : "magic")}
            className="w-full mt-4 text-xs text-[#1a1a1a]/40 hover:text-[#1a1a1a] text-center"
          >
            {mode === "magic" ? "비밀번호로 로그인" : "이메일 링크로 로그인"}
          </button>
        </div>
      </div>
    </div>
  )
}
