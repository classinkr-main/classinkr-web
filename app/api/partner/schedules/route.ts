import { createServerClient } from "@supabase/ssr"
import { NextRequest, NextResponse } from "next/server"

import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import {
  createInstallSchedule,
  getSalesSummary,
  listInstallSchedules,
  updateInstallSchedule,
} from "@/lib/repositories/install-schedules"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { Database } from "@/lib/supabase/database.types"
import {
  getSupabaseBrowserEnv,
  hasSupabaseBrowserEnv,
} from "@/lib/supabase/public-env"

async function verifyPartner(req: NextRequest): Promise<string | null> {
  if (!hasSupabaseBrowserEnv()) return null

  const { url, publishableKey } = getSupabaseBrowserEnv()
  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll() {},
    },
  })

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return null

  const admin = createSupabaseAdminClient()
  const { data } = await admin
    .from("partner_users")
    .select("partner_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single()

  return data?.partner_id ?? null
}

export async function GET(req: NextRequest) {
  const partnerId = await verifyPartner(req)
  if (!partnerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const searchParams = req.nextUrl.searchParams
    if (searchParams.get("summary") === "true") {
      return NextResponse.json({ summary: await getSalesSummary() })
    }

    const schedules = await listInstallSchedules({
      contractId: searchParams.get("contract_id") ?? undefined,
      teamId: searchParams.get("team_id") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
    })

    return NextResponse.json({ schedules })
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch schedules" },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const partnerId = await verifyPartner(req)
  if (!partnerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const schedule = await createInstallSchedule({
      ...body,
      partner_id: partnerId,
      requested_by: "partner",
    })

    void emitNotificationEvent({
      eventType: "partner.schedule.requested",
      notificationType: "action_required",
      categoryTag: "schedule",
      severity: "warning",
      scopeTag: "team",
      title: "파트너 일정 요청이 등록되었습니다",
      message: [
        body.scheduled_date ?? "일정 미정",
        body.location ?? "위치 미입력",
        body.notes ?? "메모 없음",
      ].join(" / "),
      routeUrl: "/admin/calendar",
      source: "install_schedule",
      sourceId: schedule.id,
      payload: {
        scheduleId: schedule.id,
        partnerId,
        requestedBy: "partner",
        scheduledDate: body.scheduled_date,
        location: body.location,
        notes: body.notes,
      },
      channels: ["wecom_webhook"],
    }).catch((error) => {
      console.error("[POST /api/partner/schedules] notification emit failed:", error)
    })

    return NextResponse.json({ schedule }, { status: 201 })
  } catch {
    return NextResponse.json(
      { error: "Failed to create schedule" },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  const partnerId = await verifyPartner(req)
  if (!partnerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id, ...body } = await req.json()
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 })
    }

    const schedule = await updateInstallSchedule(id, body)
    return NextResponse.json({ schedule })
  } catch {
    return NextResponse.json(
      { error: "Failed to update schedule" },
      { status: 500 }
    )
  }
}
