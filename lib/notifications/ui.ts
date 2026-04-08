import type { NotificationTone } from "@/lib/notifications/types"

export const NOTIFICATION_TONE_STYLES: Record<
  NotificationTone,
  {
    badge: string
    icon: string
    panel: string
    text: string
  }
> = {
  slate: {
    badge: "border-slate-200 bg-slate-50 text-slate-700",
    icon: "bg-slate-100 text-slate-700",
    panel: "hover:bg-slate-50/70",
    text: "text-slate-700",
  },
  blue: {
    badge: "border-blue-200 bg-blue-50 text-blue-700",
    icon: "bg-blue-100 text-blue-700",
    panel: "hover:bg-blue-50/70",
    text: "text-blue-700",
  },
  green: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: "bg-emerald-100 text-emerald-700",
    panel: "hover:bg-emerald-50/70",
    text: "text-emerald-700",
  },
  amber: {
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    icon: "bg-amber-100 text-amber-700",
    panel: "hover:bg-amber-50/70",
    text: "text-amber-700",
  },
  red: {
    badge: "border-red-200 bg-red-50 text-red-700",
    icon: "bg-red-100 text-red-700",
    panel: "hover:bg-red-50/70",
    text: "text-red-700",
  },
  sky: {
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    icon: "bg-sky-100 text-sky-700",
    panel: "hover:bg-sky-50/70",
    text: "text-sky-700",
  },
}
