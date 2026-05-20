import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { listDocsCategories, upsertDocsCategory } from "@/lib/repositories/docs-articles"

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

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    return NextResponse.json({ categories: await listDocsCategories() })
  } catch (error) {
    const message = error instanceof Error ? error.message : "카테고리를 조회하지 못했습니다."
    return NextResponse.json({ categories: [], warning: message })
  }
}

export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

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

  const id = pickString(payload.id)
  const title = pickString(payload.title)
  if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    return NextResponse.json({ error: "id는 소문자·숫자·하이픈만 허용합니다." }, { status: 400 })
  }
  if (!title) {
    return NextResponse.json({ error: "title은 필수입니다." }, { status: 400 })
  }

  try {
    const category = await upsertDocsCategory({
      id,
      title,
      description: pickString(payload.description) ?? null,
      orderIndex: pickNumber(payload.orderIndex),
      icon: pickString(payload.icon) ?? null,
      isVisible: pickBoolean(payload.isVisible) ?? true,
    })
    return NextResponse.json(category, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "카테고리를 저장하지 못했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
