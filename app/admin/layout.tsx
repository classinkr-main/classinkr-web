"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import AdminSidebar from "@/components/admin/AdminSidebar"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { hasSupabaseBrowserEnv } from "@/lib/supabase/public-env"

interface SessionInfo {
  role: string
  name: string
  email: string
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const isLoginPage = pathname === "/admin/login"

  const [session, setSession] = useState<SessionInfo | null>(null)

  useEffect(() => {
    if (isLoginPage) return

    // 기존 세션 즉시 복원 (사이드바 flash 방지)
    const cachedRole = sessionStorage.getItem("admin_role")
    const cachedName = sessionStorage.getItem("admin_name")
    const cachedEmail = sessionStorage.getItem("admin_email") ?? ""
    if (cachedRole && cachedName) {
      setSession({ role: cachedRole, name: cachedName, email: cachedEmail })
    }

    // dev 환경 자동 스킵
    if (process.env.NEXT_PUBLIC_SKIP_ADMIN_AUTH === "true") {
      sessionStorage.setItem("admin_password", "dev-skip")
      sessionStorage.setItem("admin_token", "dev-skip")
      sessionStorage.setItem("admin_role", "admin")
      sessionStorage.setItem("admin_name", "Dev")
      sessionStorage.setItem("admin_email", "dev@local")
      setSession({ role: "admin", name: "Dev", email: "dev@local" })
      return
    }

    const load = async () => {
      // Supabase 미설정 시 레거시 쿠키 방식으로 fallback
      if (!hasSupabaseBrowserEnv()) {
        const cookie = document.cookie
          .split("; ")
          .find((c) => c.startsWith("admin_session="))
          ?.split("=")[1]
        if (!cookie) {
          router.replace("/admin/login")
          return
        }
        setSession({ role: "admin", name: "Admin", email: "" })
        return
      }

      const supabase = createSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.replace("/admin/login")
        return
      }

      // admin_profiles에서 역할/이름 조회
      const { data: profile } = await supabase
        .from("admin_profiles")
        .select("display_name, role, status")
        .eq("user_id", user.id)
        .single()

      if (!profile || profile.status !== "ACTIVE") {
        await supabase.auth.signOut()
        router.replace("/admin/login")
        return
      }

      // Supabase 인증 성공 시 sessionStorage 동기화 (페이지별 auth gate 통과용)
      sessionStorage.setItem("admin_password", "supabase-authed")
      sessionStorage.setItem("admin_role", profile.role)
      sessionStorage.setItem("admin_name", profile.display_name)
      sessionStorage.setItem("admin_email", user.email ?? "")

      setSession({
        role: profile.role,
        name: profile.display_name,
        email: user.email ?? "",
      })
    }

    load()
  }, [isLoginPage, pathname, router])

  if (isLoginPage) return <>{children}</>

  return (
    <div className="flex min-h-screen bg-[#FAFAF8]">
      {session && (
        <AdminSidebar
          role={session.role}
          name={session.name}
          email={session.email}
        />
      )}
      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  )
}
