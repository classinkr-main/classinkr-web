import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ProjectCard, ProjectsEmpty } from "@/components/admin/campaigns/projects/ProjectCard"
import type { ProjectRollup, ProjectWithRollup } from "@/lib/types/marketing-campaign"

// ProjectCard 는 순수 프레젠테이션(props: project) — renderToStaticMarkup 로 롤업·예산·정직 규칙만 검증한다.
function makeRollup(overrides: Partial<ProjectRollup> = {}): ProjectRollup {
  return {
    campaignCount: 3,
    channelCount: 4,
    eventCount: 2,
    budgetAllocated: 10_000_000,
    budgetSpent: 4_200_000,
    spentPct: 42,
    ...overrides,
  }
}

function makeProject(overrides: Partial<ProjectWithRollup> = {}): ProjectWithRollup {
  const { rollup, ...rest } = overrides
  return {
    id: "prj-1",
    name: "2026 하반기 신규 학원 확보",
    objective: "신규 학원 파이프라인 확대",
    status: "active",
    startsAt: "2026-07-01",
    endsAt: "2026-12-31",
    budget: 10_000_000,
    owner: "Minjae",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    rollup: makeRollup(rollup),
    ...rest,
  }
}

describe("ProjectCard", () => {
  it("renders name, active status label, and rollup counts (캠페인/채널/행사)", () => {
    const html = renderToStaticMarkup(<ProjectCard project={makeProject()} />)
    expect(html).toContain("2026 하반기 신규 학원 확보")
    expect(html).toContain("진행") // CAMPAIGN_STATUS_LABEL.active
    expect(html).toContain("캠페인")
    expect(html).toContain("채널")
    expect(html).toContain("행사")
  })

  it("shows budget spent% and the honesty caveat (소진=행사 KRW only)", () => {
    const html = renderToStaticMarkup(<ProjectCard project={makeProject()} />)
    expect(html).toContain("42%")
    expect(html).toContain("₩4,200,000") // formatWon(budgetSpent)
    expect(html).toContain("소진은 행사 KRW 광고비 기준")
  })

  it("renders spentPct as '—' and '예산 미정' when no budget is allocated", () => {
    const html = renderToStaticMarkup(
      <ProjectCard
        project={makeProject({
          budget: null,
          rollup: { budgetAllocated: null, budgetSpent: 0, spentPct: null },
        })}
      />,
    )
    expect(html).toContain("(—)") // spentPct null → 대시 라벨(거짓 0% 방지)
    expect(html).toContain("예산 미정") // formatBudget(null)
  })
})

describe("ProjectsEmpty", () => {
  it("renders the empty-state copy", () => {
    const html = renderToStaticMarkup(<ProjectsEmpty />)
    expect(html).toContain("아직 프로젝트가 없습니다")
  })
})
