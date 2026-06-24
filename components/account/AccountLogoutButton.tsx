"use client"

import * as React from "react"

export function AccountLogoutButton() {
  const [pending, setPending] = React.useState(false)

  async function handleLogout() {
    if (pending) return
    setPending(true)
    try {
      await fetch("/api/auth/session/logout", { method: "POST" })
    } catch {
      // best-effort: even if the request fails, send the user home so the
      // stale UI is dismissed; the next protected fetch will re-gate them.
    } finally {
      window.location.assign("/")
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className="inline-flex items-center justify-center rounded-[6px] border border-black/[0.08] bg-white px-4 py-2 text-sm font-semibold text-[#615D59] transition-colors hover:bg-[#F6F5F4] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "로그아웃 중…" : "로그아웃"}
    </button>
  )
}
