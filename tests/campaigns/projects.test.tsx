import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  BUDGET_CAVEAT,
  ProjectBudgetCaveat,
  ProjectCard,
  ProjectGalleryCard,
  ProjectStatusGroupHeading,
  ProjectsEmpty,
} from "@/components/admin/campaigns/projects/ProjectCard"
import type { ProjectRollup, ProjectWithRollup } from "@/lib/types/marketing-campaign"

// ProjectCard 는 순수 프레젠테이션(props: project) — renderToStaticMarkup 로 롤업·예산·정직 규칙만 검증한다.
function makeRollup(overrides: Partial<ProjectRollup> = {}): ProjectRollup {
  return {
    campaignCount: 8,
    channelCount: 5,
    eventCount: 2,
    budgetAllocated: 10_000_000,
    budgetSpent: 7_100_000,
    spentPct: 71,
    ...overrides,
  }
}

// rollup 만 Partial 을 한 겹 더 허용한다 — Partial<ProjectWithRollup> 은 rollup 을
// "optional 이지만 통째로" 요구해서, 예산 필드만 갈아끼우는 makeRollup 병합을 막는다.
type ProjectOverrides = Partial<Omit<ProjectWithRollup, "rollup">> & {
  rollup?: Partial<ProjectRollup>
}

function makeProject(overrides: ProjectOverrides = {}): ProjectWithRollup {
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
  it("renders name and the active status label", () => {
    const html = renderToStaticMarkup(<ProjectCard project={makeProject()} />)
    expect(html).toContain("2026 하반기 신규 학원 확보")
    expect(html).toContain("진행") // CAMPAIGN_STATUS_LABEL.active
  })

  it("renders rollup numbers with the value leading its small label (수치 위계)", () => {
    const html = renderToStaticMarkup(<ProjectCard project={makeProject()} />)
    // 숫자가 앵커고 라벨은 조역 — <b>값</b><span>라벨</span> 순서가 위계 자체다.
    expect(html).toMatch(/>8<\/b><span[^>]*>캠페인</)
    expect(html).toMatch(/>5<\/b><span[^>]*>채널</)
    expect(html).toMatch(/>2<\/b><span[^>]*>행사</)
  })

  it("shows budget spent% and both amounts", () => {
    const html = renderToStaticMarkup(<ProjectCard project={makeProject()} />)
    expect(html).toContain("71%")
    expect(html).toContain("₩7,100,000") // formatWon(budgetSpent)
    expect(html).toContain("₩10,000,000") // formatBudget(budgetAllocated)
  })

  it("does NOT repeat the honesty caveat per card (섹션 레벨에서 1회만)", () => {
    const html = renderToStaticMarkup(<ProjectCard project={makeProject()} />)
    expect(html).not.toContain(BUDGET_CAVEAT)
    expect(html).not.toContain("Meta(USD)")
  })

  it("keeps the spend indicator a slim fixed-width accent, not a full-width green slab", () => {
    const html = renderToStaticMarkup(<ProjectCard project={makeProject()} />)
    // 그린은 액센트로만 — 고정폭(w-14) 3px 미터. 넓은 면을 채우는 진행바로 되돌아가면 실패한다.
    expect(html).toContain("h-[3px]")
    expect(html).toContain("w-14")
    expect(html).toContain('style="width:71%"')
  })

  it("renders spentPct as '—' and '예산 미정' when no budget is allocated (거짓 0% 금지)", () => {
    const html = renderToStaticMarkup(
      <ProjectCard
        project={makeProject({
          budget: null,
          rollup: { budgetAllocated: null, budgetSpent: 0, spentPct: null },
        })}
      />,
    )
    expect(html).toContain("—") // spentPct null → 대시(거짓 0% 방지)
    expect(html).toContain("예산 미정") // formatBudget(null)
    expect(html).not.toContain("0%")
    // 빈 트랙은 "0% 소진"으로 오독된다 — 예산이 없으면 미터 자체를 그리지 않는다.
    expect(html).not.toContain("h-[3px]")
  })

  it("flags over-budget with a warning token + '초과' label and clamps the meter to 100%", () => {
    const html = renderToStaticMarkup(
      <ProjectCard
        project={makeProject({
          rollup: { budgetAllocated: 10_000_000, budgetSpent: 12_800_000, spentPct: 128 },
        })}
      />,
    )
    expect(html).toContain("128%")
    expect(html).toContain("초과") // 색만으로 신호하지 않는다
    expect(html).toContain("#A8741A") // DESIGN.md §2 Warning 토큰
    expect(html).toContain('style="width:100%"') // 폭은 클램프(128% 로 넘치지 않는다)
  })

  it("never surfaces ROAS or a blended cross-channel total", () => {
    const html = renderToStaticMarkup(<ProjectCard project={makeProject()} />)
    expect(html).not.toContain("ROAS")
    expect(html).not.toContain("roas")
  })
})

describe("ProjectGalleryCard", () => {
  // 시안 기준일 — makeProject 의 2026-07-01 ~ 2026-12-31 은 이날 61% 경과.
  const TODAY = "2026-10-21"

  it("pairs elapsed time with budget spend and states the pace verdict", () => {
    const html = renderToStaticMarkup(<ProjectGalleryCard project={makeProject()} today={TODAY} />)
    expect(html).toContain("기간 경과")
    expect(html).toContain("61%") // 183일 중 112일
    expect(html).toContain("71%") // rollup.spentPct
    expect(html).toContain("일정에 맞는 소진") // 71 − 61 = +10%p ≤ 15%p
    expect(html).toContain("D-71")
    expect(html).toContain("₩7,100,000")
    expect(html).toContain("₩10,000,000")
    expect(html).toMatch(/>8<\/b><span[^>]*>캠페인</)
    expect(html).toContain("2026.07.01 ~ 2026.12.31")
    expect(html).toContain("Minjae")
  })

  it("leaves the status to its group heading (no chip per card) and never repeats the caveat", () => {
    const html = renderToStaticMarkup(<ProjectGalleryCard project={makeProject()} today={TODAY} />)
    expect(html).not.toContain(">진행<") // CampaignStatusChip 라벨
    expect(html).not.toContain(BUDGET_CAVEAT)
  })

  it("draws no spend track and no pace verdict without a budget (거짓 0% 금지)", () => {
    const html = renderToStaticMarkup(
      <ProjectGalleryCard
        project={makeProject({
          budget: null,
          rollup: { budgetAllocated: null, budgetSpent: 0, spentPct: null },
        })}
        today={TODAY}
      />,
    )
    expect(html).toContain("예산 미정")
    expect(html).toContain("예산 미배정 · 페이싱 없음")
    // 경과 미터(웜 그레이 채움)만 남고 소진 미터의 그린 채움은 그리지 않는다.
    expect(html).toContain("bg-[#A39E98]")
    expect(html).not.toContain("bg-[#084734]")
    expect(html).not.toMatch(/>0%</) // 소진 "0%" 텍스트 없음
  })

  it("warns on overspend with a clamped meter", () => {
    const html = renderToStaticMarkup(
      <ProjectGalleryCard
        project={makeProject({
          rollup: { budgetAllocated: 10_000_000, budgetSpent: 12_800_000, spentPct: 128 },
        })}
        today={TODAY}
      />,
    )
    expect(html).toContain("128%")
    expect(html).toContain("배정 예산 초과") // 색만으로 신호하지 않는다
    expect(html).toContain("bg-[#A8741A]")
    expect(html).toContain('style="width:100%"')
  })

  it("dims a done project and stops counting down", () => {
    const html = renderToStaticMarkup(
      <ProjectGalleryCard project={makeProject({ status: "done" })} today={TODAY} />,
    )
    expect(html).toContain("완료된 프로젝트")
    expect(html).toContain("종료")
    expect(html).toContain("bg-[#FAFAF8]")
  })
})

describe("ProjectStatusGroupHeading", () => {
  it("renders the status label with its count", () => {
    const html = renderToStaticMarkup(<ProjectStatusGroupHeading status="paused" count={3} />)
    expect(html).toMatch(/<h2[^>]*>일시중지<\/h2>/)
    expect(html).toContain(">3<")
  })

  it("marks done with a hollow ring rather than the heatmap-only grey", () => {
    const html = renderToStaticMarkup(<ProjectStatusGroupHeading status="done" count={1} size="sm" />)
    expect(html).toMatch(/<h4[^>]*>완료<\/h4>/)
    expect(html).toContain("border border-[#A39E98]")
    expect(html).not.toContain("#D5D2CB")
  })
})

describe("ProjectBudgetCaveat", () => {
  it("carries the honesty caveat at section level (list header / detail summary)", () => {
    const html = renderToStaticMarkup(<ProjectBudgetCaveat />)
    expect(html).toContain(BUDGET_CAVEAT)
    // 의미가 약해지지 않았는지: 집계 범위(행사 KRW)와 제외 대상이 모두 남아 있어야 한다.
    expect(html).toContain("행사 KRW 광고비 기준")
    expect(html).toContain("Meta(USD)")
    expect(html).toContain("이메일")
    expect(html).toContain("문자 제외")
  })

  it("pins the pacing reference date when given today", () => {
    const html = renderToStaticMarkup(<ProjectBudgetCaveat today="2026-10-21" />)
    expect(html).toContain(BUDGET_CAVEAT)
    expect(html).toContain("기간 경과는 오늘(2026.10.21) 기준")
  })
})

describe("ProjectsEmpty", () => {
  it("renders the empty-state copy", () => {
    const html = renderToStaticMarkup(<ProjectsEmpty />)
    expect(html).toContain("아직 프로젝트가 없습니다")
  })
})
