"use client"

import dynamic from "next/dynamic"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import type { AdminCommandPaletteAccessProps } from "./AdminCommandPalette"

const AdminCommandPalette = dynamic(() => import("./AdminCommandPalette"), {
  ssr: false,
  loading: () => null,
})

export default function AdminCommandPaletteLauncher(props: AdminCommandPaletteAccessProps) {
  const pathname = usePathname()
  // CRM 라우트에서는 CrmCommandPalette(app/admin/crm/layout 마운트)가 ⌘K를 소유한다.
  // 전역 런처까지 바인딩하면 팔레트가 두 개 겹치므로, CRM 스코프에서는 바인딩 컴포넌트를
  // 통째로 언마운트해 리스너·열림 상태를 함께 내린다(effect 내 setState 없이 리셋).
  const crmScoped = (pathname ?? "").startsWith("/admin/crm")
  if (crmScoped) return null
  return <GlobalPaletteBinding {...props} />
}

function GlobalPaletteBinding(props: AdminCommandPaletteAccessProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    const onOpenEvent = () => setOpen(true)

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("admin:open-command-palette", onOpenEvent)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("admin:open-command-palette", onOpenEvent)
    }
  }, [])

  const close = useCallback(() => setOpen(false), [])

  return open ? <AdminCommandPalette open={open} onClose={close} {...props} /> : null
}
