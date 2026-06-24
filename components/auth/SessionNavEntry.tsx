"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { UserRound } from "lucide-react"

interface SessionResponse {
  user: { id: string; email: string | null; name: string | null } | null
}

export function SessionNavEntry({ className }: { className?: string }) {
  const [loggedIn, setLoggedIn] = React.useState(false)
  const pathname = usePathname()

  React.useEffect(() => {
    let active = true
    fetch("/api/auth/session", { credentials: "same-origin" })
      .then((res) => (res.ok ? (res.json() as Promise<SessionResponse>) : null))
      .then((data) => {
        if (active) setLoggedIn(Boolean(data?.user))
      })
      .catch(() => {
        if (active) setLoggedIn(false)
      })
    return () => {
      active = false
    }
  }, [pathname])

  if (!loggedIn) return null

  return (
    <Link
      href="/account"
      prefetch={false}
      className={
        className ??
        "inline-flex items-center gap-1.5 whitespace-nowrap text-[15px] font-semibold text-[#615D59] transition-colors hover:text-[#084734]"
      }
    >
      <UserRound className="h-4 w-4" />
      내 계정
    </Link>
  )
}
