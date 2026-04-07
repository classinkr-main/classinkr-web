import {
  BadgeCheck,
  Bell,
  Bug,
  Building2,
  CalendarClock,
  CircleHelp,
  FileText,
  Inbox,
  Mail,
  Megaphone,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  Users,
  Wallet,
} from "lucide-react"
import type { ComponentType } from "react"

import { cn } from "@/lib/utils"
import type { NotificationIconKey } from "@/lib/notifications/types"

const ICON_MAP = {
  bell: Bell,
  triangle_alert: TriangleAlert,
  shield_alert: ShieldAlert,
  badge_check: BadgeCheck,
  users: Users,
  calendar_clock: CalendarClock,
  building: Building2,
  bug: Bug,
  wallet: Wallet,
  megaphone: Megaphone,
  mail: Mail,
  inbox: Inbox,
  file_text: FileText,
  sparkles: Sparkles,
  circle_help: CircleHelp,
} satisfies Record<NotificationIconKey, ComponentType<{ className?: string }>>

export function NotificationIcon({
  iconKey,
  className,
}: {
  iconKey: NotificationIconKey
  className?: string
}) {
  const Icon = ICON_MAP[iconKey] ?? Bell

  return <Icon className={cn("h-4 w-4", className)} />
}
