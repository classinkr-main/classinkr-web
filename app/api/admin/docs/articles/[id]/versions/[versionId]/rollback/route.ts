import { NextRequest, NextResponse } from "next/server"

import { getVerifiedAdminContext, verifyAdmin } from "@/lib/admin-auth"
import { rollbackDocsArticleToVersion } from "@/lib/repositories/docs-articles"

interface RouteContext {
  params: Promise<{ id: string; versionId: string }>
}

export async function POST(req: NextRequest, context: RouteContext) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const admin = await getVerifiedAdminContext(req)
  const updatedBy = admin?.name ?? admin?.userId ?? null
  const { id, versionId } = await context.params

  try {
    const article = await rollbackDocsArticleToVersion(id, versionId, updatedBy)
    if (!article) {
      return NextResponse.json({ error: "문서 또는 버전을 찾을 수 없습니다." }, { status: 404 })
    }
    return NextResponse.json(article)
  } catch (error) {
    const message = error instanceof Error ? error.message : "롤백하지 못했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
