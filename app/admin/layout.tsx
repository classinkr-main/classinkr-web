"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

import AdminSidebar from "@/components/admin/AdminSidebar"
import { clearAdminSessionStorage } from "@/lib/admin-client"
import { isAdminAuthBypassEnabled } from "@/lib/admin-env"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { hasSupabaseBrowserEnv } from "@/lib/supabase/public-env"

interface SessionInfo {
  role: string
  name: string
  email: string
}

function readCachedSession(): SessionInfo | null {
  if (typeof window === "undefined") return null

  const role = sessionStorage.getItem("admin_role")
  const name = sessionStorage.getItem("admin_name")
  const email = sessionStorage.getItem("admin_email") ?? ""

  if (!role || !name) return null
  return { role, name, email }
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const isLoginPage = pathname === "/admin/login"
  const [session, setSession] = useState<SessionInfo | null>(() => {
    if (process.env.NEXT_PUBLIC_SKIP_ADMIN_AUTH === "true") {
      return { role: "admin", name: "Dev", email: "dev@local" }
    }

    return readCachedSession()
  })

  useEffect(() => {
    if (isLoginPage) return

    const cachedSession = readCachedSession()

    if (cachedSession) {
      queueMicrotask(() => setSession((prev) => prev ?? cachedSession))
    }

    if (isAdminAuthBypassEnabled()) {
      queueMicrotask(() => {
        sessionStorage.setItem("admin_password", "dev-skip")
        sessionStorage.setItem("admin_token", "dev-skip")
        sessionStorage.setItem("admin_role", "admin")
        sessionStorage.setItem("admin_name", "Dev")
        sessionStorage.setItem("admin_email", "dev@local")
        setSession({ role: "admin", name: "Dev", email: "dev@local" })
      })
      return
    }

    let cancelled = false

    const load = async () => {
      if (!hasSupabaseBrowserEnv()) {
        if (cachedSession) {
          if (!cancelled) setSession(cachedSession)
          return
        }

        try {
          const response = await fetch("/api/admin/auth")
          const data = await response.json().catch(() => null)

          if (!response.ok || !data) {
            clearAdminSessionStorage()
            router.replace("/admin/login")
            return
          }

          sessionStorage.setItem("admin_password", "legacy-session")
          sessionStorage.setItem("admin_token", "legacy-session")
          sessionStorage.setItem("admin_role", data.role ?? "admin")
          sessionStorage.setItem("admin_name", data.name ?? "Admin")
          sessionStorage.setItem("admin_email", "")

          if (data.branch) sessionStorage.setItem("admin_branch", data.branch)
          else sessionStorage.removeItem("admin_branch")

          if (!cancelled) {
            setSession({
              role: data.role ?? "admin",
              name: data.name ?? "Admin",
              email: "",
            })
          }
        } catch {
          clearAdminSessionStorage()
          router.replace("/admin/login")
        }

        return
      }

      const supabase = createSupabaseBrowserClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        clearAdminSessionStorage()
        router.replace("/admin/login")
        return
      }

      const { data: profile } = await supabase
        .from("admin_profiles")
        .select("display_name, role, status")
        .eq("user_id", user.id)
        .single()

      if (!profile || profile.status !== "ACTIVE") {
        clearAdminSessionStorage()
        await supabase.auth.signOut()
        router.replace("/admin/login")
        return
      }

      if (!cancelled) {
        sessionStorage.setItem("admin_password", "supabase-authed")
        sessionStorage.setItem("admin_token", "supabase-authed")
        sessionStorage.setItem("admin_role", profile.role)
        sessionStorage.setItem("admin_name", profile.display_name)
        sessionStorage.setItem("admin_email", user.email ?? "")
        sessionStorage.removeItem("admin_branch")

        setSession({
          role: profile.role,
          name: profile.display_name,
          email: user.email ?? "",
        })
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [isLoginPage, router])

  if (isLoginPage) return <>{children}</>

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#FAFAF8] lg:flex-row">
      {session ? (
        <AdminSidebar
          role={session.role}
          name={session.name}
          email={session.email}
        />
      ) : (
        <aside
          aria-hidden="true"
          className="hidden border-b border-[#e8e8e4] bg-white lg:flex lg:min-h-screen lg:w-60 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0"
        >
          <div className="border-b border-[#e8e8e4] px-5 py-6">
            <div className="h-3 w-12 rounded-full bg-[#f0f0ec] animate-pulse" />
            <div className="mt-2 h-4 w-20 rounded-full bg-[#f0f0ec] animate-pulse" />
          </div>
          <div className="flex-1 px-4 py-5">
            <div className="h-32 rounded-2xl border border-dashed border-[#ecece8] bg-[#fafaf8]" />
          </div>
          <div className="px-4 pb-5">
            <div className="h-10 rounded-lg bg-[#f5f5f2] animate-pulse" />
          </div>
        </aside>
      )}
      <main className="min-w-0 flex-1 overflow-x-hidden pt-16 pb-24 lg:pt-0 lg:pb-0">
        <div className="mx-auto w-full max-w-[1320px]">{children}</div>
      </main>
    </div>
  )
}
