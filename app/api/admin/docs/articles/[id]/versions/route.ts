import { NextRequest, NextResponse } from "next/server"

import { getVerifiedAdminContext, verifyAdmin } from "@/lib/admin-auth"
import {
  createDocsArticleVersionSnapshot,
  listDocsArticleVersions,
} from "@/lib/repositories/docs-articles"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, context: RouteContext) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await context.params
  try {
    return NextResponse.json({ versions: await listDocsArticleVersions(id) })
  } catch (error) {
    const message = error instanceof Error ? error.message : "문서 버전을 조회하지 못했습니다."
    return NextResponse.json({ versions: [], warning: message })
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const admin = await getVerifiedAdminContext(req)
  const updatedBy = admin?.name ?? admin?.userId ?? null
  const { id } = await context.params
  const body = await req.json().catch(() => null) as { changeNote?: unknown } | null
  const changeNote =
    typeof body?.changeNote === "string" && body.changeNote.trim()
      ? body.changeNote.trim()
      : "Manual snapshot"

  try {
    const version = await createDocsArticleVersionSnapshot(id, changeNote, updatedBy)
    if (!version) {
      return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 })
    }
    return NextResponse.json(version, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "스냅샷을 만들지 못했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
