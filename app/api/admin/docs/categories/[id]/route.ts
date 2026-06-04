import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { patchDocsCategory } from "@/lib/repositories/docs-articles"

interface RouteContext {
  params: Promise<{ id: string }>
}

function getBodyObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function pickString(value: unknown) {
  return typeof value === "string" ? value.trim() : undefined
}

function pickNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : undefined
}

function pickBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await context.params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 })
  }

  const payload = getBodyObject(body)
  if (!payload) {
    return NextResponse.json({ error: "요청 본문이 비어 있습니다." }, { status: 400 })
  }

  try {
    const category = await patchDocsCategory(id, {
      title: "title" in payload ? pickString(payload.title) : undefined,
      description: "description" in payload ? pickString(payload.description) ?? null : undefined,
      orderIndex: "orderIndex" in payload ? pickNumber(payload.orderIndex) : undefined,
      icon: "icon" in payload ? pickString(payload.icon) ?? null : undefined,
      isVisible: "isVisible" in payload ? pickBoolean(payload.isVisible) : undefined,
    })
    if (!category) {
      return NextResponse.json({ error: "카테고리를 찾을 수 없습니다." }, { status: 404 })
    }
    return NextResponse.json(category)
  } catch (error) {
    const message = error instanceof Error ? error.message : "카테고리를 수정하지 못했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
