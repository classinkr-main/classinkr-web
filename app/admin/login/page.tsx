"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Lock } from "lucide-react"
import { getAdminAuthErrorMessage } from "@/lib/admin-auth-errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function AdminLoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })

      const data = await res.json().catch(() => null)

      if (res.ok) {
        sessionStorage.setItem("admin_password", password)
        sessionStorage.setItem("admin_token", password)
        sessionStorage.setItem("admin_role", data?.role ?? "admin")
        sessionStorage.setItem("admin_name", data?.name ?? "Admin")

        if (data?.branch) sessionStorage.setItem("admin_branch", data.branch)
        else sessionStorage.removeItem("admin_branch")

        router.replace("/admin/overview")
      } else {
        setError(getAdminAuthErrorMessage(data?.code))
      }
    } catch {
      setError("서버 연결에 실패했습니다.")
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

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="password"
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {error ? <p className="text-[13px] text-red-500">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={loading || !password}>
              {loading ? "확인 중..." : "로그인"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
