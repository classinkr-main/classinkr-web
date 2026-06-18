import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import {
  getAllSubscribers,
  countSubscribers,
  upsertSubscriber,
  deleteSubscriber,
} from "@/lib/repositories/marketing"
import type { UpsertSubscriberRequest } from "@/lib/marketing-types"

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const statusFilter = searchParams.get("status")
  const tagFilter = searchParams.get("tag")

  // ?count=1 은 행을 전송하지 않고 총 구독자 수만 반환한다.(대시보드 KPI용)
  if (searchParams.get("count") === "1") {
    const total = await countSubscribers({
      status: statusFilter ?? undefined,
      tag: tagFilter ?? undefined,
    })
    return adminCachedJson({ subscribers: [], total })
  }

  const subscribers = await getAllSubscribers(1000, 0, {
    status: statusFilter ?? undefined,
    tag: tagFilter ?? undefined,
  })

  return adminCachedJson({ subscribers, total: subscribers.length })
}

export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const body: UpsertSubscriberRequest = await req.json()

    if (!body.email || !body.name) {
      return NextResponse.json(
        { error: "?대쫫怨??대찓?쇱? ?꾩닔?낅땲??" },
        { status: 400 }
      )
    }

    const subscriber = await upsertSubscriber({
      name: body.name,
      email: body.email,
      org: body.org,
      role: body.role,
      size: body.size,
      phone: body.phone,
      tags: body.tags ?? [],
      source: "manual",
    })

    return NextResponse.json({ ok: true, subscriber })
  } catch {
    return NextResponse.json({ error: "?섎せ???붿껌?낅땲??" }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json({ error: "id ?뚮씪誘명꽣媛 ?꾩슂?⑸땲??" }, { status: 400 })
  }

  const deleted = await deleteSubscriber(id)
  if (!deleted) {
    return NextResponse.json({ error: "援щ룆?먮? 李얠쓣 ???놁뒿?덈떎." }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
