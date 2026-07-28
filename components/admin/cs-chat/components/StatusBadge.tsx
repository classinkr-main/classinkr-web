"use client"

import { cn } from "@/lib/utils"

import { STATUS_META } from "../constants"
import type { ConversationStatus } from "../types"

export default function StatusBadge({ status }: { status: ConversationStatus }) {
  const meta = STATUS_META[status]
  return (
    <span className={cn("inline-flex h-7 items-center rounded-md border px-2 text-[11px] font-semibold", meta.className)}>
      {meta.label}
    </span>
  )
}
