import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import {
  getEventMetrics,
  saveEventMetrics,
  deleteEventMetrics,
} from "@/lib/repositories/event-metrics"
import type { AdSpendEntry } from "@/lib/types/event-metrics"

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await verifyAdmin(req)
  if (err) return err
  const { id } = await params
  try {
    return NextResponse.json(getEventMetrics(id))
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "메트릭 조회 실패" },
      { status: 500 }
    )
  }
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
    const patch = {
      targetLeads: sanitizeNumber(body.targetLeads),
      targetRevenue: sanitizeNumber(body.targetRevenue),
      impressionsCount: sanitizeNumber(body.impressionsCount),
      applicationsCount: sanitizeNumber(body.applicationsCount),
      qualifiedLeadsCount: sanitizeNumber(body.qualifiedLeadsCount),
      attendeesCount: sanitizeNumber(body.attendeesCount),
      dealsCount: sanitizeNumber(body.dealsCount),
      dealsRevenue: sanitizeNumber(body.dealsRevenue),
      closedCustomerCount: sanitizeCount(body.closedCustomerCount),
      dealCustomers: sanitizeText(body.dealCustomers),
      adSpendEntries: sanitizeAdSpend(body.adSpendEntries),
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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await verifyAdmin(req)
  if (err) return err
  const { id } = await params
  try {
    deleteEventMetrics(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "메트릭 삭제 실패" },
      { status: 500 }
    )
  }
}
