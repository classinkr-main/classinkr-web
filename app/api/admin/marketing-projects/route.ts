import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import {
  listProjects,
  createProject,
  listCampaignsByProject,
} from "@/lib/repositories/marketing-projects"
import { sanitizeProjectInput } from "@/lib/marketing/project-sanitize"
import { computeProjectRollup, eventAdSpendFromMetrics } from "@/lib/marketing/project-rollup"
import { getAllEventMetrics } from "@/lib/repositories/event-metrics"
import type { ProjectWithRollup } from "@/lib/types/marketing-campaign"

// sanitizer 를 라우트에서 re-export → 단위테스트가 라우트 파일에서 가져온다
// (repo 관행: marketing-campaigns/route.ts 동일).
export { sanitizeProjectInput }

/**
 * GET /api/admin/marketing-projects
 * 프로젝트 목록 + 각 프로젝트의 읽기시점 롤업(멤버 캠페인 수·채널/행사 수·예산 소진%).
 *
 * 효율: getAllEventMetrics() 는 요청당 1회만 호출해 모든 프로젝트 롤업에 재사용한다(N+1 회피).
 *       멤버 캠페인 조회(listCampaignsByProject)는 프로젝트별 1쿼리이나 Promise.all 로 동시 실행한다.
 *
 * 그레이스풀 강등: 저장소는 DB 오류 시 throw 한다(마이그레이션 미적용이면 relation 부재로 throw).
 *       라우트가 크래시하지 않도록 try/catch 로 500 강등 → UI 가 빈/에러 상태를 렌더한다.
 */
export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const projects = await listProjects()
    // 요청당 1회 — 파일 기반 event-metrics 전량을 eventId별 KRW 광고비 맵으로 변환해 재사용.
    const eventAdSpend = eventAdSpendFromMetrics(getAllEventMetrics())

    const withRollup: ProjectWithRollup[] = await Promise.all(
      projects.map(async (project) => {
        const campaigns = await listCampaignsByProject(project.id)
        const rollup = computeProjectRollup(campaigns, {
          eventAdSpend,
          budget: project.budget,
        })
        return { ...project, rollup }
      }),
    )

    return NextResponse.json({ projects: withRollup })
  } catch (err) {
    return NextResponse.json(
      { error: `프로젝트 목록을 불러오지 못했습니다: ${String(err)}` },
      { status: 500 },
    )
  }
}

/**
 * POST /api/admin/marketing-projects
 * 프로젝트 생성. 본문 sanitize → 유효하지 않으면 400.
 */
export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const body = await req.json().catch(() => null)
    const input = sanitizeProjectInput(body)
    if (!input) {
      return NextResponse.json(
        { error: "프로젝트 입력이 유효하지 않습니다(name 필수, status/budget 확인)." },
        { status: 400 },
      )
    }
    const project = await createProject(input)
    return NextResponse.json({ project }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
