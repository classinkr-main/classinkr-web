import { NextRequest, NextResponse } from "next/server"

import { getVerifiedAdminContext, verifyAdmin } from "@/lib/admin-auth"
import {
  deleteDocsArticleDraft,
  getDocsArticleById,
  getDocsArticleDraft,
  upsertDocsArticleDraft,
} from "@/lib/repositories/docs-articles"
import { normalizeDocsArticlePatchPayload, validateDocsArticlePatchContent } from "../../_payload"

interface RouteContext {
  params: Promise<{ id: string }>
}

function getBodyObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export async function GET(req: NextRequest, context: RouteContext) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await context.params
  try {
    const draft = await getDocsArticleDraft(id)
    return NextResponse.json({ draft })
  } catch (error) {
    const message = error instanceof Error ? error.message : "작업 초안을 조회하지 못했습니다."
    return NextResponse.json({ draft: null, warning: message })
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const admin = await getVerifiedAdminContext(req)
  const updatedBy = admin?.name ?? admin?.userId ?? null
  const { id } = await context.params
  const body = await req.json().catch(() => null)
  const payload = getBodyObject(body)
  if (!payload) return NextResponse.json({ error: "요청 본문이 비어 있습니다." }, { status: 400 })

  const article = await getDocsArticleById(id)
  if (!article) return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 })

  const draftPayload = normalizeDocsArticlePatchPayload(payload)
  if (draftPayload.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draftPayload.slug)) {
    return NextResponse.json(
      { error: "slug는 소문자·숫자·하이픈만 허용합니다." },
      { status: 400 }
    )
  }
  const contentError = validateDocsArticlePatchContent(draftPayload)
  if (contentError) return NextResponse.json({ error: contentError }, { status: 400 })

  try {
    const draft = await upsertDocsArticleDraft({
      articleId: id,
      draftPayload,
      changeNote:
        typeof payload.changeNote === "string" && payload.changeNote.trim()
          ? payload.changeNote.trim()
          : null,
      updatedBy,
    })
    return NextResponse.json({ draft })
  } catch (error) {
    const message = error instanceof Error ? error.message : "작업 초안을 저장하지 못했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await context.params
  try {
    await deleteDocsArticleDraft(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "작업 초안을 삭제하지 못했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
