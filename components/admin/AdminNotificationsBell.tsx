"use client"

import { Bell, CheckCheck, Loader2, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { adminFetchJson } from "@/lib/admin-client"
import type { NotificationInboxItem } from "@/lib/notifications/types"
import { NOTIFICATION_TONE_STYLES } from "@/lib/notifications/ui"
import { cn } from "@/lib/utils"
import { NotificationIcon } from "@/components/notifications/NotificationIcon"

function formatRelativeTime(value: string) {
  const now = Date.now()
  const createdAt = new Date(value).getTime()
  const diffMinutes = Math.max(Math.floor((now - createdAt) / 60_000), 0)

  if (diffMinutes < 1) return "just now"
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

interface BellProps {
  placement?: "floating" | "inline"
}

export default function AdminNotificationsBell({ placement = "floating" }: BellProps = {}) {
  const router = useRouter()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [items, setItems] = useState<NotificationInboxItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const load = useCallback(async (background = false) => {
    if (!background) {
      setLoading(true)
    }

    try {
      const data = await adminFetchJson<{
        items: NotificationInboxItem[]
        unreadCount: number
      }>("/api/admin/notifications?limit=12")
      setItems(data.items)
      setUnreadCount(data.unreadCount)
    } catch (error) {
      console.error("[admin notifications] load failed", error)
    } finally {
      if (!background) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void load()

    const timer = window.setInterval(() => {
      void load(true)
    }, 60_000)

    return () => window.clearInterval(timer)
  }, [load])

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!panelRef.current) return
      if (panelRef.current.contains(event.target as Node)) return
      setOpen(false)
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleEscape)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [])

  const handleMarkAllRead = useCallback(async () => {
    setBusy(true)
    try {
      await adminFetchJson("/api/admin/notifications", { method: "PATCH" })
      setItems((current) =>
        current.map((item) => ({
          ...item,
          status: "read",
          readAt: item.readAt ?? new Date().toISOString(),
        }))
      )
      setUnreadCount(0)
    } catch (error) {
      console.error("[admin notifications] mark all read failed", error)
    } finally {
      setBusy(false)
    }
  }, [])

  const handleDeleteItem = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setItems((current) => current.filter((item) => item.id !== id))
    setUnreadCount((current) => {
      const item = items.find((i) => i.id === id)
      return item?.status === "unread" ? Math.max(current - 1, 0) : current
    })
    try {
      await adminFetchJson(`/api/admin/notifications/${id}`, { method: "DELETE" })
    } catch (error) {
      console.error("[admin notifications] delete failed", error)
      void load(true)
    }
  }, [items, load])

  const handleOpenItem = useCallback(
    async (item: NotificationInboxItem) => {
      if (item.status === "unread") {
        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  status: "read",
                  readAt: entry.readAt ?? new Date().toISOString(),
                }
              : entry
          )
        )
        setUnreadCount((current) => Math.max(current - 1, 0))

        try {
          await adminFetchJson(`/api/admin/notifications/${item.id}`, {
            method: "PATCH",
          })
        } catch (error) {
          console.error("[admin notifications] mark single read failed", error)
        }
      }

      setOpen(false)

      if (item.routeUrl) {
        router.push(item.routeUrl)
      }
    },
    [router]
  )

  const wrapperClass = placement === "inline"
    ? "relative"
    : "fixed right-3 top-2.5 z-50 lg:hidden"
  const buttonClass = placement === "inline"
    ? "relative flex h-8 w-8 items-center justify-center rounded-md text-[#111110] transition-colors hover:bg-[#f5f5f2]"
    : "relative flex h-11 w-11 items-center justify-center rounded-md border border-[#e8e8e4] bg-white text-[#111110] shadow-sm transition-colors hover:bg-[#f7f7f4]"
  const panelClass = placement === "inline"
    ? "fixed left-3 top-16 max-h-[calc(100dvh-5rem)] overflow-hidden rounded-[16px] border border-[#e8e8e4] bg-white shadow-2xl lg:absolute lg:left-auto lg:right-[-380px] lg:top-0 lg:mt-0 lg:w-[360px] lg:rounded-[16px] z-50"
    : "fixed inset-x-3 top-16 max-h-[calc(100dvh-5rem)] overflow-hidden rounded-[16px] border border-[#e8e8e4] bg-white shadow-2xl"

  return (
    <div className={wrapperClass} ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={buttonClass}
        aria-label="Open notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-[#111110] px-1 py-0.5 text-[9px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className={panelClass}>
          <div className="flex items-center justify-between border-b border-[#efefea] px-5 py-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#1a1a1a]/35">
                Admin Inbox
              </p>
              <h2 className="mt-1 text-[15px] font-semibold text-[#111110]">
                Notifications
              </h2>
            </div>
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              disabled={busy || unreadCount === 0}
              className="inline-flex items-center gap-1 rounded-full border border-[#e8e8e4] px-3 py-1.5 text-[11px] font-medium text-[#1a1a1a]/65 transition-colors hover:bg-[#f7f7f4] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCheck className="h-3.5 w-3.5" />
              )}
              Mark all read
            </button>
          </div>

          <div className="max-h-[calc(100dvh-12rem)] overflow-y-auto lg:max-h-[420px]">
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-5 py-10 text-[13px] text-[#1a1a1a]/45">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading notifications...
              </div>
            ) : items.length === 0 ? (
              <div className="px-5 py-10 text-center text-[13px] text-[#1a1a1a]/45">
                New notifications will appear here.
              </div>
            ) : (
              <div className="divide-y divide-[#f0f0ec]">
                {items.map((item) => {
                  const tone = NOTIFICATION_TONE_STYLES[item.tone]

                  return (
                    <div key={item.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => void handleOpenItem(item)}
                        className={cn(
                          "flex w-full items-start gap-3 px-5 py-4 pr-10 text-left transition-colors",
                          tone.panel
                        )}
                      >
                        <div
                          className={cn(
                            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl",
                            tone.icon
                          )}
                        >
                          <NotificationIcon iconKey={item.iconKey} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="truncate text-[13px] font-semibold text-[#111110]">
                              {item.title}
                            </p>
                            <div className="flex items-center gap-2">
                              {item.status === "unread" ? (
                                <span className="h-2 w-2 rounded-full bg-[#111110]" />
                              ) : null}
                              <span className="shrink-0 text-[11px] text-[#1a1a1a]/35">
                                {formatRelativeTime(item.createdAt)}
                              </span>
                            </div>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#1a1a1a]/60">
                            {item.message}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <span
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                                tone.badge
                              )}
                            >
                              {item.notificationType.replaceAll("_", " ")}
                            </span>
                            <span className="text-[10px] uppercase tracking-wide text-[#1a1a1a]/30">
                              {item.categoryTag}
                            </span>
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => void handleDeleteItem(e, item.id)}
                        className="absolute right-3 top-3 hidden h-6 w-6 items-center justify-center rounded-full text-[#1a1a1a]/30 transition-colors hover:bg-[#f0f0ec] hover:text-[#1a1a1a]/70 group-hover:flex"
                        aria-label="알림 삭제"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
