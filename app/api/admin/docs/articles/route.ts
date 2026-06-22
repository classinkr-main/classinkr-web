import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin, getVerifiedAdminContext } from "@/lib/admin-auth"
import {
  createDocsArticle,
  type DocsArticleCreateInput,
  type DocsArticleDocType,
  type DocsArticleProductArea,
  type DocsArticleStatus,
  type DocsArticleVisibility,
  type DocsArticleDifficulty,
} from "@/lib/repositories/docs-articles"
import { revalidateDocsArticlePaths } from "./_revalidate"
import { validateDocsArticlePatchForPublish } from "./_payload"

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

function pickNullableString(value: unknown): string | null | undefined {
  if (value === null) return null
  return pickString(value)
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

export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const admin = await getVerifiedAdminContext(req)
  const updatedBy = admin?.name ?? admin?.userId ?? null

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
  const categoryId = pickString(payload.categoryId)
  const slug = pickString(payload.slug)
  const title = pickString(payload.title)
  const description = pickString(payload.description)

  if (!categoryId || !slug || !title || !description) {
    return NextResponse.json(
      { error: "categoryId, slug, title, description는 필수입니다." },
      { status: 400 }
    )
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return NextResponse.json(
      { error: "slug는 소문자·숫자·하이픈만 허용합니다." },
      { status: 400 }
    )
  }

  const input: DocsArticleCreateInput = {
    categoryId,
    slug,
    title,
    description,
    audience: pickStringArray(payload.audience),
    productArea: pickEnum(payload.productArea, ALLOWED_PRODUCT_AREA),
    docType: pickEnum(payload.docType, ALLOWED_DOC_TYPE),
    difficulty: pickEnum(payload.difficulty, ALLOWED_DIFFICULTY),
    status: pickEnum(payload.status, ALLOWED_STATUS),
    visibility: pickEnum(payload.visibility, ALLOWED_VISIBILITY),
    noindex: pickBoolean(payload.noindex),
    featured: pickBoolean(payload.featured),
    orderIndex: pickNumber(payload.orderIndex),
    tags: pickStringArray(payload.tags),
    keywords: pickStringArray(payload.keywords),
    symptoms: pickStringArray(payload.symptoms),
    chatbotSummary: pickString(payload.chatbotSummary) ?? null,
    contentMarkdown: pickString(payload.contentMarkdown),
    contentJson: pickJson(payload.contentJson),
    seoTitle: pickString(payload.seoTitle) ?? null,
    seoDescription: pickString(payload.seoDescription) ?? null,
    publishedAt: pickNullableString(payload.publishedAt) ?? null,
    updatedBy,
  }

  const status = input.status ?? "draft"
  const validationError = validateDocsArticlePatchForPublish(
    {
      categoryId,
      slug,
      title,
      description,
      status: input.status,
      contentMarkdown: input.contentMarkdown,
    },
    {
      categoryId,
      slug,
      title,
      description,
      status,
      contentMarkdown: input.contentMarkdown ?? "",
    }
  )
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  try {
    const detail = await createDocsArticle(input)
    revalidateDocsArticlePaths(detail)
    return NextResponse.json(detail, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "문서 생성에 실패했습니다."
    const isConflict = /duplicate key|unique/i.test(message)
    return NextResponse.json(
      { error: isConflict ? "같은 카테고리에 동일한 slug가 있습니다." : message },
      { status: isConflict ? 409 : 500 }
    )
  }
}
