"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import AdminSidebar from "@/components/admin/AdminSidebar"
import type { AdminRole } from "@/lib/admin-auth"

interface SessionInfo {
  role: AdminRole
  name: string
  branch?: string
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname === "/admin/login"

  const [session, setSession] = useState<SessionInfo | null>(null)

  useEffect(() => {
    const nextSession = (() => {
      if (typeof window === "undefined" || isLoginPage) return null
      const role = sessionStorage.getItem("admin_role") as AdminRole | null
      const name = sessionStorage.getItem("admin_name")
      const branch = sessionStorage.getItem("admin_branch") ?? undefined
      return role && name ? { role, name, branch } : { role: "admin" as AdminRole, name: "Admin" }
    })()

    const frame = window.requestAnimationFrame(() => {
      setSession(nextSession)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [isLoginPage, pathname])

  if (isLoginPage) return <>{children}</>

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#FAFAF8] lg:flex-row">
      {session && (
        <AdminSidebar
          role={session.role}
          name={session.name}
          branch={session.branch}
        />
      )}
      <main className="flex-1 min-w-0 overflow-x-hidden">
        {children}
      </main>
    </div>
  )
}
