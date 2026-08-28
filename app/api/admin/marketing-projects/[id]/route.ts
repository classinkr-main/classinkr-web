import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import {
  getProject,
  updateProject,
  deleteProject,
  listCampaignsByProject,
} from "@/lib/repositories/marketing-projects"
import { sanitizeProjectPatch } from "@/lib/marketing/project-sanitize"
import { computeProjectRollup, eventAdSpendFromMetrics } from "@/lib/marketing/project-rollup"
import { getAllEventMetrics } from "@/lib/repositories/event-metrics"

// sanitizer 를 라우트에서 re-export → 단위테스트가 라우트 파일에서 가져온다.
export { sanitizeProjectPatch }

/**
 * GET /api/admin/marketing-projects/[id]
 * 프로젝트 1건 + 읽기시점 롤업 + 멤버 캠페인 목록(UI 표시용).
 * (getProject 는 오류/부재를 null 로 흡수 → 여기선 404 로 강등, 크래시 없음.)
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await params
  try {
    const project = await getProject(id)
    if (!project) {
      return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 })
    }
    const campaigns = await listCampaignsByProject(id)
    const eventAdSpend = eventAdSpendFromMetrics(await getAllEventMetrics())
    const rollup = computeProjectRollup(campaigns, { eventAdSpend, budget: project.budget })
    return NextResponse.json({ project, rollup, campaigns })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/marketing-projects/[id]
 * 부분 수정. sanitize → 유효하지 않으면 400. 변경 필드가 없으면 400(무의미 update 방지).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await params
  try {
    const body = await req.json().catch(() => null)
    const patch = sanitizeProjectPatch(body)
    if (!patch) {
      return NextResponse.json(
        { error: "수정 입력이 유효하지 않습니다(status/budget/name 확인)." },
        { status: 400 },
      )
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "변경할 필드가 없습니다." }, { status: 400 })
    }
    const project = await updateProject(id, patch)
    return NextResponse.json({ project })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/marketing-projects/[id]
 * 프로젝트 삭제. 멤버 캠페인은 FK ON DELETE SET NULL 로 project_id 만 해제되고 보존된다.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await params
  try {
    await deleteProject(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
