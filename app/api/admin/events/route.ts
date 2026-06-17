import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { validatePublicMarkdownContent } from "@/lib/admin/public-content-validation"
import { getAllEventsForAdmin, createPublicEvent } from "@/lib/repositories/public-events"
import { revalidatePublicEventSurfaces } from "./_revalidate"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err
  try {
    const events = await getAllEventsForAdmin()
    return adminCachedJson(events)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "행사 목록 조회에 실패했습니다." },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err
  try {
    const body = await req.json()
    if (!body.title || !body.category || !body.startsAt) {
      return NextResponse.json(
        { error: "title, category, startsAt은 필수입니다." },
        { status: 400 }
      )
    }
    const contentError = validatePublicMarkdownContent(body.contentMarkdown)
    if (contentError) {
      return NextResponse.json({ error: contentError }, { status: 400 })
    }
    const event = await createPublicEvent(body)
    revalidatePublicEventSurfaces(event.slug)
    return NextResponse.json(event, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "행사 생성에 실패했습니다." },
      { status: 500 }
    )
  }
}
