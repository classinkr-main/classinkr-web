import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { deleteBugReport, updateBugReport } from "@/lib/repositories/bugs"
import { isBugSeverity, isBugStatus } from "@/lib/admin/dev-workflow"
import type { BugReport } from "@/lib/bugs-data"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = await verifyAdmin(req)
  if (err) return err
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const raw = body as Record<string, unknown>
  if (raw.status !== undefined && !isBugStatus(raw.status)) {
    return NextResponse.json({ error: "Invalid bug status" }, { status: 400 })
  }
  if (raw.severity !== undefined && !isBugSeverity(raw.severity)) {
    return NextResponse.json({ error: "Invalid bug severity" }, { status: 400 })
  }
  let updated: BugReport | null
  try {
    updated = await updateBugReport(id, body as Partial<Omit<BugReport, "id" | "createdAt">>)
  } catch (error) {
    // 저장 장애를 404 로 가리지 않는다 — 화면은 "없음"과 "저장 실패"를 다르게 다뤄야 한다.
    console.error("[PATCH /api/admin/bugs/:id] update failed:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "버그 리포트를 저장하지 못했습니다." }, { status: 500 })
  }
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = await verifyAdmin(req)
  if (err) return err
  const { id } = await params
  // 삭제 실패를 성공으로 응답하지 않는다 — 예전에는 결과를 버려 화면이 "삭제했습니다"를 띄우고 행은 남았다.
  const deleted = await deleteBugReport(id)
  if (!deleted) return NextResponse.json({ error: "버그 리포트를 삭제하지 못했습니다." }, { status: 500 })
  return NextResponse.json({ ok: true })
}
