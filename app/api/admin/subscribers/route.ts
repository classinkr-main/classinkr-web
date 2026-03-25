import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import {
  getAllSubscribers,
  upsertSubscriber,
  deleteSubscriber,
} from "@/lib/repositories/marketing"
import type { UpsertSubscriberRequest } from "@/lib/marketing-types"

export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const statusFilter = searchParams.get("status")
  const tagFilter = searchParams.get("tag")

  let subscribers = await getAllSubscribers()

  if (statusFilter) {
    subscribers = subscribers.filter((s) => s.status === statusFilter)
  }
  if (tagFilter) {
    subscribers = subscribers.filter((s) => s.tags.includes(tagFilter))
  }

  return NextResponse.json({ subscribers, total: subscribers.length })
}

export async function POST(req: NextRequest) {
  const authError = verifyAdmin(req)
  if (authError) return authError

  try {
    const body: UpsertSubscriberRequest = await req.json()

    if (!body.email || !body.name) {
      return NextResponse.json(
        { error: "이름과 이메일은 필수입니다." },
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
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const authError = verifyAdmin(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json({ error: "id 파라미터가 필요합니다." }, { status: 400 })
  }

  const deleted = await deleteSubscriber(id)
  if (!deleted) {
    return NextResponse.json({ error: "구독자를 찾을 수 없습니다." }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
