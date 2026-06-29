"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LogIn, UserRound } from "lucide-react"

interface SessionResponse {
  user: { id: string; email: string | null; name: string | null } | null
}

type SessionState = "loading" | "in" | "out"

export function SessionNavEntry({ className }: { className?: string }) {
  const [state, setState] = React.useState<SessionState>("loading")
  const pathname = usePathname()

  React.useEffect(() => {
    let active = true
    fetch("/api/auth/session", { credentials: "same-origin" })
      .then((res) => (res.ok ? (res.json() as Promise<SessionResponse>) : null))
      .then((data) => {
        if (active) setState(data?.user ? "in" : "out")
      })
      .catch(() => {
        if (active) setState("out")
      })
    return () => {
      active = false
    }
  }, [pathname])

  // 세션 확인 전에는 로그인/내 계정 어느 쪽도 깜빡이지 않도록 비워 둔다.
  if (state === "loading") return null

  const linkClass =
    className ??
    "inline-flex items-center gap-1.5 whitespace-nowrap text-[15px] font-semibold text-[#615D59] transition-colors hover:text-[#084734]"

  if (state === "out") {
    const next = pathname && pathname.startsWith("/") ? pathname : "/account"
    return (
      <Link
        href={`/login?next=${encodeURIComponent(next)}`}
        prefetch={false}
        className={linkClass}
      >
        <LogIn className="h-4 w-4" />
        로그인
      </Link>
    )
  }

  return (
    <Link href="/account" prefetch={false} className={linkClass}>
      <UserRound className="h-4 w-4" />
      내 계정
    </Link>
  )
}
