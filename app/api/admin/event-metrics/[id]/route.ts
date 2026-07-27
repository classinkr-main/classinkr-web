import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { saveEventMetrics } from "@/lib/repositories/event-metrics"
import type { AdSpendEntry, RelatedLink } from "@/lib/types/event-metrics"

const VALID_CHANNELS = new Set([
  "google",
  "meta",
  "naver",
  "kakao",
  "youtube",
  "offline",
  "other",
])

function sanitizeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function sanitizeCount(value: unknown): number | null {
  const n = sanitizeNumber(value)
  if (n === null || n < 0) return null
  return Math.floor(n)
}

function sanitizeText(value: unknown): string | null {
  if (typeof value !== "string") return null
  const text = value.trim()
  return text.length > 0 ? text : null
}

function sanitizeAdSpend(value: unknown): AdSpendEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry): AdSpendEntry | null => {
      if (!entry || typeof entry !== "object") return null
      const obj = entry as Record<string, unknown>
      const channel = typeof obj.channel === "string" ? obj.channel : ""
      if (!VALID_CHANNELS.has(channel)) return null
      const amount = sanitizeNumber(obj.amount)
      if (amount === null || amount < 0) return null
      const note = typeof obj.note === "string" ? obj.note : undefined
      return { channel: channel as AdSpendEntry["channel"], amount, note }
    })
    .filter((entry): entry is AdSpendEntry => entry !== null)
}

export function sanitizeRelatedLinks(value: unknown): RelatedLink[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry): RelatedLink | null => {
      if (!entry || typeof entry !== "object") return null
      const obj = entry as Record<string, unknown>
      const label = typeof obj.label === "string" ? obj.label.trim() : ""
      const url = typeof obj.url === "string" ? obj.url.trim() : ""
      if (!label || !/^https?:\/\//i.test(url)) return null
      return { label, url }
    })
    .filter((entry): entry is RelatedLink => entry !== null)
    .slice(0, 10)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await verifyAdmin(req)
  if (err) return err
  const { id } = await params
  try {
    const body = (await req.json()) as Record<string, unknown>
    // 카운트/금액은 모두 음수·소수를 허용하지 않는다(0 이상 정수). 이 값들이
    // ROI·전환율·퍼널 폭·CSV로 그대로 흘러가므로 -5명 / 3.5딜 같은 입력을 원천 차단.
    const patch = {
      targetLeads: sanitizeCount(body.targetLeads),
      targetRevenue: sanitizeCount(body.targetRevenue),
      impressionsCount: sanitizeCount(body.impressionsCount),
      applicationsCount: sanitizeCount(body.applicationsCount),
      qualifiedLeadsCount: sanitizeCount(body.qualifiedLeadsCount),
      attendeesCount: sanitizeCount(body.attendeesCount),
      dealsCount: sanitizeCount(body.dealsCount),
      dealsRevenue: sanitizeCount(body.dealsRevenue),
      closedCustomerCount: sanitizeCount(body.closedCustomerCount),
      dealCustomers: sanitizeText(body.dealCustomers),
      adSpendEntries: sanitizeAdSpend(body.adSpendEntries),
      relatedLinks: sanitizeRelatedLinks(body.relatedLinks),
      notes: sanitizeText(body.notes),
      retrospective: sanitizeText(body.retrospective),
      shareMemo: sanitizeText(body.shareMemo),
    }
    const saved = saveEventMetrics(id, patch)
    return NextResponse.json(saved)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "메트릭 저장 실패" },
      { status: 500 }
    )
  }
}
