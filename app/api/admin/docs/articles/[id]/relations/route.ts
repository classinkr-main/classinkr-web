import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import {
  listDocsArticleRelations,
  replaceDocsArticleRelations,
  type DocsArticleRelationInput,
} from "@/lib/repositories/docs-articles"

interface RouteContext {
  params: Promise<{ id: string }>
}

const RELATION_TYPES = new Set(["related", "next_step", "prerequisite", "replaces"])

function normalizeRelations(value: unknown): DocsArticleRelationInput[] {
  if (!Array.isArray(value)) return []

  const relations: DocsArticleRelationInput[] = []

  value.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return
    const row = item as Record<string, unknown>
    const relatedArticleId = typeof row.relatedArticleId === "string" ? row.relatedArticleId : ""
    if (!relatedArticleId) return

    const relationType =
      typeof row.relationType === "string" && RELATION_TYPES.has(row.relationType)
        ? (row.relationType as DocsArticleRelationInput["relationType"])
        : "related"

    relations.push({
      relatedArticleId,
      relationType,
      orderIndex:
        typeof row.orderIndex === "number" && Number.isFinite(row.orderIndex)
          ? Math.floor(row.orderIndex)
          : (index + 1) * 10,
      note: typeof row.note === "string" && row.note.trim() ? row.note.trim() : null,
    })
  })

  return relations
}

export async function GET(req: NextRequest, context: RouteContext) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await context.params
  try {
    return NextResponse.json({ relations: await listDocsArticleRelations(id) })
  } catch (error) {
    const message = error instanceof Error ? error.message : "관련 문서를 조회하지 못했습니다."
    return NextResponse.json({ relations: [], warning: message })
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await context.params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 })
  }

  const payload = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {}

  try {
    await replaceDocsArticleRelations(id, normalizeRelations(payload.relations))
    return NextResponse.json({ relations: await listDocsArticleRelations(id) })
  } catch (error) {
    const message = error instanceof Error ? error.message : "관련 문서를 저장하지 못했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
