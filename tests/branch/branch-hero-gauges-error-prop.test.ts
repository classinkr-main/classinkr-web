import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

// 최종 수리 — 항목 2: BranchHeroGauges의 teams는 kpi.data에서 파생되는데(BranchHeroGauges.tsx
// `kpi?.teams`), 부모(BranchOverviewPanel)는 KPI 요청 상태를 별도로 넘겨야 한다.
// kpi fetch만 실패하면(summary는 성공) error가 비어 있어 BranchHeroGauges의 !error 분기를 타고,
// teams가 조용히 빈 배열([])이 돼 팀별 게이지 3개가 아무 에러 표시 없이 그냥 사라졌다 —
// 사용자에게는 "이번 달은 팀 실적이 없다"처럼 보이는 무음 실패.
// 소스 스캔 방식은 이 디렉터리의 다른 테스트(ledger-entry-reverse-action 등)와 동일 관례를
// 따른다 — 이 저장소는 React 렌더 테스트 하네스(@testing-library/react)가 없다(vitest.config.ts
// environment: "node").
const overviewPanelPath = join(
  process.cwd(),
  "components/admin/branch/BranchOverviewPanel.tsx",
)
const heroGaugesPath = join(
  process.cwd(),
  "components/admin/branch/sections/BranchHeroGauges.tsx",
)

function overviewPanelSource() {
  return readFileSync(overviewPanelPath, "utf8")
}

function heroGaugesSource() {
  return readFileSync(heroGaugesPath, "utf8")
}

describe("BranchOverviewPanel -> BranchHeroGauges request state (항목 2)", () => {
  it("요약이 준비된 뒤 팀 KPI의 data/loading/error를 각각 전달한다", () => {
    const source = overviewPanelSource()
    const callStart = source.indexOf("<BranchHeroGauges")
    expect(callStart).toBeGreaterThan(-1)
    const callEnd = source.indexOf("/>", callStart)
    expect(callEnd).toBeGreaterThan(callStart)
    const callBlock = source.slice(callStart, callEnd)

    expect(callBlock).toContain("summary={summary.data}")
    expect(callBlock).toContain("kpi={kpi.data}")
    expect(callBlock).toContain("loading={kpi.loading}")
    expect(callBlock).toContain("error={kpi.error}")
  })

  it("팀 KPI의 로딩·오류·데이터 없음 상태를 서로 구분한다", () => {
    const source = heroGaugesSource()
    expect(source).toContain("if (!kpi?.teams) return []")
    expect(source).toContain("return kpi.teams.filter((t) => TEAM_LABEL[t.team])")
    expect(source).toContain("loading && !kpi")
    expect(source).toContain("error && !kpi")
    expect(source).toContain("!kpi || teams.length === 0")
  })
})
