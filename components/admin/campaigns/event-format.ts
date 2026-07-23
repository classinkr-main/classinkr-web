import type { EventStatus } from "@/lib/types/public-events"

export const KRW = new Intl.NumberFormat("ko-KR")
const KRW_CURRENCY = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
})
export const won = (n: number | null | undefined) => (n == null ? "—" : KRW_CURRENCY.format(Math.round(n)))
export const pct = (n: number | null | undefined) => (n == null ? "—" : `${n}%`)
export const compact = new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 })

export function previewText(value: string | null | undefined, maxLength = 160) {
  const text = value?.replace(/\s+/g, " ").trim()
  if (!text) return null
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

export function money(value: number | null | undefined, currency = "USD") {
  if (value == null) return "—"
  if (currency === "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  }
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

export function statusTone(status: EventStatus): string {
  switch (status) {
    case "진행 중":
      return "bg-emerald-50 text-emerald-700 border-emerald-200"
    case "예정":
      return "bg-blue-50 text-blue-700 border-blue-200"
    case "마감":
      return "bg-[#f0f0ec] text-[#1a1a1a]/40 border-[#e8e8e4]"
  }
}

export function formatRange(startsAt: string, endsAt: string | null) {
  const s = new Date(startsAt)
  const sLabel = `${s.getMonth() + 1}/${s.getDate()}`
  if (!endsAt) return sLabel
  const e = new Date(endsAt)
  const eLabel = `${e.getMonth() + 1}/${e.getDate()}`
  return `${sLabel} ~ ${eLabel}`
}

export function formatMetaDate(value?: string) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`
}
