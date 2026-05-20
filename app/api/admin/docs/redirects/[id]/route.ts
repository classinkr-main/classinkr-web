import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { deleteDocsRedirect, patchDocsRedirect } from "@/lib/repositories/docs-articles"

const ALLOWED_STATUS = new Set([301, 302, 307, 308])

interface RouteContext {
  params: Promise<{ id: string }>
}

function getBodyObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function pickPath(value: unknown) {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.startsWith("/") && !trimmed.includes("://") ? trimmed : undefined
}

function pickNullablePath(value: unknown) {
  if (value == null || value === "") return null
  return pickPath(value)
}

function pickString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function pickStatus(value: unknown) {
  return typeof value === "number" && ALLOWED_STATUS.has(value)
    ? (value as 301 | 302 | 307 | 308)
    : undefined
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await context.params
  const body = await req.json().catch(() => null)
  const payload = getBodyObject(body)
  if (!payload) return NextResponse.json({ error: "요청 본문이 비어 있습니다." }, { status: 400 })

  try {
    const redirect = await patchDocsRedirect(id, {
      fromPath: "fromPath" in payload ? pickPath(payload.fromPath) : undefined,
      toPath: "toPath" in payload ? pickNullablePath(payload.toPath) : undefined,
      toArticleId: "toArticleId" in payload ? pickString(payload.toArticleId) ?? null : undefined,
      httpStatus: "httpStatus" in payload ? pickStatus(payload.httpStatus) : undefined,
    })
    if (!redirect) {
      return NextResponse.json({ error: "리다이렉트를 찾을 수 없습니다." }, { status: 404 })
    }
    return NextResponse.json(redirect)
  } catch (error) {
    const message = error instanceof Error ? error.message : "리다이렉트를 수정하지 못했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await context.params
  try {
    await deleteDocsRedirect(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "리다이렉트를 삭제하지 못했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
