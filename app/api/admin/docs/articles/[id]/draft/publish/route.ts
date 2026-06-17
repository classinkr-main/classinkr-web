import { NextRequest, NextResponse } from "next/server"

import { getVerifiedAdminContext, verifyAdmin } from "@/lib/admin-auth"
import {
  getDocsArticleById,
  getDocsArticleDraft,
  publishDocsArticleDraft,
  upsertDocsRedirect,
} from "@/lib/repositories/docs-articles"
import { validateDocsArticlePatchForPublish } from "../../../_payload"
import { revalidateDocsArticlePaths } from "../../../_revalidate"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, context: RouteContext) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const admin = await getVerifiedAdminContext(req)
  const updatedBy = admin?.name ?? admin?.userId ?? null
  const { id } = await context.params

  try {
    const [existing, draft] = await Promise.all([
      getDocsArticleById(id),
      getDocsArticleDraft(id),
    ])
    if (!existing) return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 })
    if (!draft) return NextResponse.json({ error: "저장된 작업 초안이 없습니다." }, { status: 404 })

    const validationError = validateDocsArticlePatchForPublish(draft.draftPayload, existing)
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

    const detail = await publishDocsArticleDraft(id, updatedBy)
    if (!detail) return NextResponse.json({ error: "작업 초안을 반영하지 못했습니다." }, { status: 404 })

    if (existing.publicPath !== detail.publicPath) {
      await upsertDocsRedirect({
        fromPath: existing.publicPath,
        toPath: detail.publicPath,
        httpStatus: 301,
      }).catch((redirectError) => {
        console.warn(
          "[POST /api/admin/docs/articles/[id]/draft/publish] redirect creation failed:",
          redirectError instanceof Error ? redirectError.message : redirectError
        )
      })
    }

    revalidateDocsArticlePaths(existing, detail)
    return NextResponse.json(detail)
  } catch (error) {
    const message = error instanceof Error ? error.message : "작업 초안을 공개본에 반영하지 못했습니다."
    const isConflict = /duplicate key|unique/i.test(message)
    return NextResponse.json(
      { error: isConflict ? "같은 카테고리에 동일한 slug가 있습니다." : message },
      { status: isConflict ? 409 : 500 }
    )
  }
}
