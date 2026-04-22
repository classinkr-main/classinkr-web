"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Lock } from "lucide-react"
import Image from "next/image"
import { clearAdminSessionStorage } from "@/lib/admin-client"
import { getAdminAuthErrorMessage } from "@/lib/admin-auth-errors"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { hasSupabaseBrowserEnv } from "@/lib/supabase/public-env"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const INVALID_CREDENTIALS_MESSAGE = "이메일 또는 비밀번호가 올바르지 않습니다."
const UNAUTHORIZED_MESSAGE = "관리자 권한이 있는 계정만 로그인할 수 있습니다."

export default function AdminLoginPage() {
  const router = useRouter()
  const useSupabaseAuth = hasSupabaseBrowserEnv()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)
  const triggerShake = () => {
    setShake(true)
    setTimeout(() => setShake(false), 200)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      clearAdminSessionStorage()

      if (!useSupabaseAuth) {
        const response = await fetch("/api/admin/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        })

        const data = await response.json().catch(() => null)

        if (!response.ok) {
          setError(getAdminAuthErrorMessage(data?.code))
          triggerShake()
          return
        }

        sessionStorage.setItem("admin_password", password)
        sessionStorage.setItem("admin_token", password)
        sessionStorage.setItem("admin_role", data?.role ?? "admin")
        sessionStorage.setItem("admin_name", data?.name ?? "Admin")
        sessionStorage.setItem("admin_email", "")

        if (data?.branch) {
          sessionStorage.setItem("admin_branch", data.branch)
        } else {
          sessionStorage.removeItem("admin_branch")
        }

        router.replace("/admin/overview")
        router.refresh()
        return
      }

      const supabase = createSupabaseBrowserClient()
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError || !signInData.user) {
        setError(INVALID_CREDENTIALS_MESSAGE)
        triggerShake()
        return
      }

      const { data: profile } = await supabase
        .from("admin_profiles")
        .select("display_name, role, status")
        .eq("user_id", signInData.user.id)
        .single()

      if (!profile) {
        await supabase.auth.signOut()
        setError("관리자 프로필이 없습니다. 관리자 초대를 확인해 주세요.")
        triggerShake()
        return
      }

      if (profile.status !== "ACTIVE") {
        await supabase.auth.signOut()
        setError(
          profile.status === "INVITED"
            ? "초대를 수락한 후 접근할 수 있습니다."
            : UNAUTHORIZED_MESSAGE
        )
        triggerShake()
        return
      }

      sessionStorage.setItem("admin_password", "supabase-authed")
      sessionStorage.setItem("admin_token", "supabase-authed")
      sessionStorage.setItem("admin_role", profile.role)
      sessionStorage.setItem("admin_name", profile.display_name)
      sessionStorage.setItem("admin_email", signInData.user.email ?? "")
      sessionStorage.removeItem("admin_branch")

      router.replace("/admin/overview")
      router.refresh()
    } catch (err) {
      console.error("[AdminLogin] 오류:", err)
      clearAdminSessionStorage()
      setError(useSupabaseAuth ? INVALID_CREDENTIALS_MESSAGE : "서버 연결에 실패했습니다.")
      triggerShake()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAF8] px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-8 shadow-sm">
          <div className="flex flex-col items-center mb-6 gap-3">
            <Image
              src="/images/logo.png"
              alt="Classin"
              width={120}
              height={32}
              className="object-contain"
              priority
            />
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f0f0ec]">
              <Lock className="h-4 w-4 text-[#1a1a1a]/40" />
            </div>
          </div>
          <h1 className="mb-1 text-center text-sm font-medium text-[#A39E98]">
            Admin
          </h1>
          <p className="mb-6 text-center text-[13px] text-[#1a1a1a]/40">
            {useSupabaseAuth
              ? "관리자 계정으로 로그인하세요."
              : "관리자 비밀번호로 로그인하세요."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            {useSupabaseAuth ? (
              <Input
                type="email"
                placeholder="이메일"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                autoComplete="email"
                aria-invalid={!!error}
                aria-describedby="admin-login-error"
                className={shake ? "animate-shake" : undefined}
              />
            ) : null}
            <Input
              type="password"
              placeholder={useSupabaseAuth ? "비밀번호" : "관리자 비밀번호"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus={!useSupabaseAuth}
              autoComplete="current-password"
              aria-invalid={!!error}
              aria-describedby="admin-login-error"
              className={shake ? "animate-shake" : undefined}
            />
            {error ? (
              <p id="admin-login-error" role="alert" aria-live="polite" className="text-[13px] text-[#B85C33]">{error}</p>
            ) : null}
            <Button
              type="submit"
              className="w-full"
              disabled={loading || !password || (useSupabaseAuth && !email)}
            >
              {loading ? "로그인 중..." : "로그인"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
