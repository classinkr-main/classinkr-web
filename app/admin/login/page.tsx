"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Lock } from "lucide-react"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const supabase = createSupabaseBrowserClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setError("이메일 또는 비밀번호가 올바르지 않습니다.")
        return
      }

      router.replace("/admin/overview")
      router.refresh()
    } catch (err) {
      console.error("[AdminLogin] 오류:", err)
      setError("이메일 또는 비밀번호가 올바르지 않습니다.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAF8] px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-8 shadow-sm">
          <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-[#f0f0ec]">
            <Lock className="h-5 w-5 text-[#1a1a1a]/40" />
          </div>
          <h1 className="mb-1 text-center text-lg font-semibold text-[#111110]">
            Classin Admin
          </h1>
          <p className="mb-6 text-center text-[13px] text-[#1a1a1a]/40">
            관리자 전용 페이지입니다.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              type="email"
              placeholder="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              autoComplete="email"
            />
            <Input
              type="password"
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            {error ? <p className="text-[13px] text-red-500">{error}</p> : null}
            <Button
              type="submit"
              className="w-full"
              disabled={loading || !email || !password}
            >
              {loading ? "로그인 중..." : "로그인"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
