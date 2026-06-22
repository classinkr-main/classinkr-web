"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useState } from "react"

const AdminCommandPalette = dynamic(() => import("./AdminCommandPalette"), {
  ssr: false,
  loading: () => null,
})

export default function AdminCommandPaletteLauncher() {
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

  return open ? <AdminCommandPalette open={open} onClose={close} /> : null
}
