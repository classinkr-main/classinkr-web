import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin, getVerifiedAdminContext } from "@/lib/admin-auth"
import {
  deleteDocsArticle,
  getDocsArticleById,
  patchDocsArticle,
  upsertDocsRedirect,
  type DocsArticleDocType,
  type DocsArticleProductArea,
  type DocsArticleStatus,
  type DocsArticleVisibility,
  type DocsArticleDifficulty,
  type DocsArticlePatchInput,
} from "@/lib/repositories/docs-articles"
import { revalidateDocsArticlePaths } from "../_revalidate"

const ALLOWED_STATUS: DocsArticleStatus[] = ["draft", "review", "published", "archived"]
const ALLOWED_VISIBILITY: DocsArticleVisibility[] = ["public", "unlisted", "internal"]
const ALLOWED_DOC_TYPE: DocsArticleDocType[] = [
  "guide",
  "manual",
  "faq",
  "troubleshooting",
  "release_note",
  "reference",
]
const ALLOWED_PRODUCT_AREA: DocsArticleProductArea[] = [
  "general",
  "software",
  "hardware",
  "billing",
  "onboarding",
  "classroom",
  "admin",
  "partner",
]
const ALLOWED_DIFFICULTY: DocsArticleDifficulty[] = ["beginner", "intermediate", "advanced"]

function pickEnum<T extends string>(value: unknown, allowed: T[]): T | undefined {
  return typeof value === "string" && (allowed as string[]).includes(value)
    ? (value as T)
    : undefined
}

function pickStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const filtered = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
  return Array.from(new Set(filtered))
}

function pickString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function pickBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function pickNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function pickJson(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return undefined
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await params
  try {
    const detail = await getDocsArticleById(id)
    if (!detail) return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 })
    return NextResponse.json(detail)
  } catch (error) {
    const message = error instanceof Error ? error.message : "문서 조회에 실패했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const admin = await getVerifiedAdminContext(req)
  const updatedBy = admin?.name ?? admin?.userId ?? null

  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 })
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "요청 본문이 비어 있습니다." }, { status: 400 })
  }

  const payload = body as Record<string, unknown>
  const patch: DocsArticlePatchInput = { updatedBy }

  if ("categoryId" in payload) patch.categoryId = pickString(payload.categoryId)
  if ("slug" in payload) {
    const slug = pickString(payload.slug)
    if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return NextResponse.json(
        { error: "slug는 소문자·숫자·하이픈만 허용합니다." },
        { status: 400 }
      )
    }
    patch.slug = slug
  }
  if ("title" in payload) patch.title = pickString(payload.title)
  if ("description" in payload) patch.description = pickString(payload.description)
  if ("audience" in payload) patch.audience = pickStringArray(payload.audience)
  if ("productArea" in payload) patch.productArea = pickEnum(payload.productArea, ALLOWED_PRODUCT_AREA)
  if ("docType" in payload) patch.docType = pickEnum(payload.docType, ALLOWED_DOC_TYPE)
  if ("difficulty" in payload) patch.difficulty = pickEnum(payload.difficulty, ALLOWED_DIFFICULTY)
  if ("status" in payload) patch.status = pickEnum(payload.status, ALLOWED_STATUS)
  if ("visibility" in payload) patch.visibility = pickEnum(payload.visibility, ALLOWED_VISIBILITY)
  if ("noindex" in payload) patch.noindex = pickBoolean(payload.noindex)
  if ("featured" in payload) patch.featured = pickBoolean(payload.featured)
  if ("orderIndex" in payload) patch.orderIndex = pickNumber(payload.orderIndex)
  if ("tags" in payload) patch.tags = pickStringArray(payload.tags)
  if ("keywords" in payload) patch.keywords = pickStringArray(payload.keywords)
  if ("symptoms" in payload) patch.symptoms = pickStringArray(payload.symptoms)
  if ("chatbotSummary" in payload) {
    patch.chatbotSummary = payload.chatbotSummary === null ? null : pickString(payload.chatbotSummary) ?? null
  }
  if ("contentMarkdown" in payload) patch.contentMarkdown = pickString(payload.contentMarkdown)
  if ("contentJson" in payload) patch.contentJson = pickJson(payload.contentJson)
  if ("seoTitle" in payload) {
    patch.seoTitle = payload.seoTitle === null ? null : pickString(payload.seoTitle) ?? null
  }
  if ("seoDescription" in payload) {
    patch.seoDescription = payload.seoDescription === null ? null : pickString(payload.seoDescription) ?? null
  }

  try {
    const existing = await getDocsArticleById(id)
    if (!existing) return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 })

    const detail = await patchDocsArticle(id, patch)
    if (!detail) return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 })

    if (existing.publicPath !== detail.publicPath) {
      await upsertDocsRedirect({
        fromPath: existing.publicPath,
        toPath: detail.publicPath,
        httpStatus: 301,
      }).catch((redirectError) => {
        console.warn(
          "[PATCH /api/admin/docs/articles/[id]] redirect creation failed:",
          redirectError instanceof Error ? redirectError.message : redirectError
        )
      })
    }

    revalidateDocsArticlePaths(existing, detail)
    return NextResponse.json(detail)
  } catch (error) {
    const message = error instanceof Error ? error.message : "문서 수정에 실패했습니다."
    const isConflict = /duplicate key|unique/i.test(message)
    return NextResponse.json(
      { error: isConflict ? "같은 카테고리에 동일한 slug가 있습니다." : message },
      { status: isConflict ? 409 : 500 }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await params
  try {
    const existing = await getDocsArticleById(id)
    if (!existing) return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 })

    await deleteDocsArticle(id)
    revalidateDocsArticlePaths(existing)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "문서 삭제에 실패했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
