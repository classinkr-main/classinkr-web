import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

// 최종 수리 — 항목 2: BranchHeroGauges의 teams는 kpi.data에서 파생되는데(BranchHeroGauges.tsx
// `kpi?.teams`), 부모(BranchDashboardClient)는 error prop으로 summary.error만 넘기고 있었다.
// kpi fetch만 실패하면(summary는 성공) error가 비어 있어 BranchHeroGauges의 !error 분기를 타고,
// teams가 조용히 빈 배열([])이 돼 팀별 게이지 3개가 아무 에러 표시 없이 그냥 사라졌다 —
// 사용자에게는 "이번 달은 팀 실적이 없다"처럼 보이는 무음 실패.
// 소스 스캔 방식은 이 디렉터리의 다른 테스트(ledger-entry-reverse-action 등)와 동일 관례를
// 따른다 — 이 저장소는 React 렌더 테스트 하네스(@testing-library/react)가 없다(vitest.config.ts
// environment: "node").
const dashboardClientPath = join(
  process.cwd(),
  "components/admin/branch/BranchDashboardClient.tsx",
)
const heroGaugesPath = join(
  process.cwd(),
  "components/admin/branch/sections/BranchHeroGauges.tsx",
)

function dashboardClientSource() {
  return readFileSync(dashboardClientPath, "utf8")
}

function heroGaugesSource() {
  return readFileSync(heroGaugesPath, "utf8")
}

describe("BranchDashboardClient -> BranchHeroGauges error prop (항목 2)", () => {
  it("BranchHeroGauges에 summary.error와 kpi.error를 모두 반영한 error를 전달한다", () => {
    const source = dashboardClientSource()
    const callStart = source.indexOf("<BranchHeroGauges")
    expect(callStart).toBeGreaterThan(-1)
    const callEnd = source.indexOf("/>", callStart)
    expect(callEnd).toBeGreaterThan(callStart)
    const callBlock = source.slice(callStart, callEnd)

    expect(callBlock).toContain("summary={summary.data}")
    expect(callBlock).toContain("kpi={kpi.data}")
    expect(callBlock).toContain("error={summary.error ?? kpi.error}")
  })

  it("teams는 kpi에서만 파생된다 — error prop이 kpi 실패를 반영해야 하는 이유(교차 검증)", () => {
    const source = heroGaugesSource()
    expect(source).toContain("if (!kpi?.teams) return []")
    expect(source).toContain("return kpi.teams.filter((t) => TEAM_LABEL[t.team])")
  })
})
