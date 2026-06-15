import { NextRequest, NextResponse } from "next/server"

import { getVerifiedAdminContext, verifyAdmin } from "@/lib/admin-auth"
import {
  bulkPatchDocsArticles,
  type DocsArticleStatus,
  type DocsArticleVisibility,
} from "@/lib/repositories/docs-articles"
import { revalidateDocsIndexPaths } from "../_revalidate"

const ALLOWED_STATUS: DocsArticleStatus[] = ["draft", "review", "published", "archived"]
const ALLOWED_VISIBILITY: DocsArticleVisibility[] = ["public", "unlisted", "internal"]

function getBodyObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function pickIds(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
}

function pickEnum<T extends string>(value: unknown, allowed: T[]) {
  return typeof value === "string" && (allowed as string[]).includes(value)
    ? (value as T)
    : undefined
}

export async function PATCH(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const admin = await getVerifiedAdminContext(req)
  const updatedBy = admin?.name ?? admin?.userId ?? null
  const body = await req.json().catch(() => null)
  const payload = getBodyObject(body)

  if (!payload) return NextResponse.json({ error: "요청 본문이 비어 있습니다." }, { status: 400 })

  const ids = pickIds(payload.ids)
  if (ids.length === 0) {
    return NextResponse.json({ error: "수정할 문서를 선택해 주세요." }, { status: 400 })
  }

  try {
    const result = await bulkPatchDocsArticles(ids, {
      categoryId: typeof payload.categoryId === "string" && payload.categoryId ? payload.categoryId : undefined,
      status: pickEnum(payload.status, ALLOWED_STATUS),
      visibility: pickEnum(payload.visibility, ALLOWED_VISIBILITY),
      featured: typeof payload.featured === "boolean" ? payload.featured : undefined,
      noindex: typeof payload.noindex === "boolean" ? payload.noindex : undefined,
      updatedBy,
    })
    revalidateDocsIndexPaths()
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "문서를 일괄 수정하지 못했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
