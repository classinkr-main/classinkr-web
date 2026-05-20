import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { listDocsRedirects, upsertDocsRedirect } from "@/lib/repositories/docs-articles"

const ALLOWED_STATUS = new Set([301, 302, 307, 308])

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

function pickStatus(value: unknown) {
  return typeof value === "number" && ALLOWED_STATUS.has(value)
    ? (value as 301 | 302 | 307 | 308)
    : undefined
}

function pickString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    return NextResponse.json({ redirects: await listDocsRedirects() })
  } catch (error) {
    const message = error instanceof Error ? error.message : "리다이렉트를 조회하지 못했습니다."
    return NextResponse.json({ redirects: [], warning: message })
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
  if (!payload) return NextResponse.json({ error: "요청 본문이 비어 있습니다." }, { status: 400 })

  const fromPath = pickPath(payload.fromPath)
  const toPath = pickPath(payload.toPath)
  const toArticleId = pickString(payload.toArticleId)

  if (!fromPath) {
    return NextResponse.json({ error: "fromPath는 /docs/... 형태여야 합니다." }, { status: 400 })
  }
  if (!toPath && !toArticleId) {
    return NextResponse.json({ error: "toPath 또는 toArticleId가 필요합니다." }, { status: 400 })
  }

  try {
    const redirect = await upsertDocsRedirect({
      fromPath,
      toPath: toPath ?? null,
      toArticleId: toArticleId ?? null,
      httpStatus: pickStatus(payload.httpStatus) ?? 301,
    })
    return NextResponse.json(redirect, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "리다이렉트를 저장하지 못했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
