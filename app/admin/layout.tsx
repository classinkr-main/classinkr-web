"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import AdminSidebar from "@/components/admin/AdminSidebar"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

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

    const load = async () => {
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
