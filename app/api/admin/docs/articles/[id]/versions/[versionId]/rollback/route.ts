import { NextRequest, NextResponse } from "next/server"

import { getVerifiedAdminContext, verifyAdmin } from "@/lib/admin-auth"
import { rollbackDocsArticleToVersion } from "@/lib/repositories/docs-articles"
import { docsReindexNeeded, reindexDocsArticleServerSide } from "../../../../_reindex"
import { revalidateDocsArticlePaths } from "../../../../_revalidate"

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

    revalidateDocsArticlePaths(article)

    // 롤백은 본문/제목만 되돌리므로 상태는 그대로다 — 게시 문서일 때만 재색인.
    const reindexWarning = docsReindexNeeded(article.status, article.status)
      ? await reindexDocsArticleServerSide(
          article.id,
          "POST /api/admin/docs/articles/[id]/versions/[versionId]/rollback"
        )
      : undefined

    return NextResponse.json(reindexWarning ? { ...article, reindexWarning } : article)
  } catch (error) {
    const message = error instanceof Error ? error.message : "롤백하지 못했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
