import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { branchDraftTeamOptions, branchTeamLabel, CURRENT_BRANCH_TEAMS, defaultBranchDraftTeam, isCurrentBranchTeam, isLegacyBranchTeam } from "@/lib/branch/current-organization";
import { CURRENT_TEAM_FILTERS, TEAMS, type BranchKpiResponse, type BranchSummaryResponse, type Team } from "@/components/admin/branch/types";
import BranchHeroGauges from "@/components/admin/branch/sections/BranchHeroGauges";
import BranchKpiAccordion from "@/components/admin/branch/sections/BranchKpiAccordion";

const kpi: BranchKpiResponse = {
  teams: ["BD", "MKT", "CSM"].map((team) => ({ team, goal: 100, status: team === "CSM" ? -20 : 50, pacing_pct: 50 })), members: [],
};
const summary = (team: Team): BranchSummaryResponse => ({
  team, period: "M", revenue: { confirmed: -20, goal: 100, pacing_pct: -20 },
  bottleneck: { metric: null, pct: 0, worst_member: null }, closing: { count: 0, total_target: 0 },
  events_30d: { count: 0, regions: 0 }, campaigns_30d: { count: 0, avg_open_pct: 0 }, campaigns_recent: [], deal_mix: null,
  monthly_series: { months: [], goal_cum: [], revenue_cum: [], revenue_trend_cum: [], confirmed_through_index: 0, events: [], deals: [], campaigns: [] },
  lastSync: null, lastError: null, sheetModifiedAt: null,
});

describe("현재 조직과 장부 이력은 구분한다", () => {
  it("현재 필터에는 BD/MKT만 두고 기존 CSM 파서·링크 지원은 남긴다", () => {
    expect(CURRENT_BRANCH_TEAMS).toEqual(["BD", "MKT"]); expect(CURRENT_TEAM_FILTERS).toEqual(["ALL", "BD", "MKT"]);
    expect(TEAMS).toContain("CSM"); expect(isCurrentBranchTeam("CSM")).toBe(false); expect(isLegacyBranchTeam("CSM")).toBe(true);
    expect(branchTeamLabel("CSM")).toContain("이전 조직 이력");
  });
  it("이력 조회에서 새 입력은 현재 팀으로 시작하고 기존 CSM 초안은 원값을 유지한다", () => {
    expect(defaultBranchDraftTeam("CSM")).toBe("BD"); expect(defaultBranchDraftTeam("MKT")).toBe("MKT");
    expect(branchDraftTeamOptions("BD")).toEqual(["BD", "MKT"]);
    expect(branchDraftTeamOptions("CSM")).toEqual(["BD", "MKT", "CSM"]);
  });
  it("전체 현황의 팀별 비교에서 CSM은 제외하고 전체 장부 음수는 그대로 보여준다", () => {
    const html = renderToStaticMarkup(<BranchHeroGauges summary={summary("ALL")} kpi={kpi} loading={false} periodLabel="10월" />);
    expect(html).toContain("현재 팀별 매출"); expect(html).not.toContain("CSM");
    expect(html).toContain("확정 매출 -20 CNY");
  });
  it("기존 CSM 딥링크는 이력으로 명시하고 원본 음수·목표 비교를 유지한다", () => {
    const html = renderToStaticMarkup(<BranchHeroGauges summary={summary("CSM")} kpi={kpi} loading={false} periodLabel="10월" />);
    expect(html).toContain("CSM · 이전 조직 이력"); expect(html).toContain("이전 조직 매출 이력");
    expect(html).toContain("CSM DSH 실적 -20 CNY");
  });
  it("시트 KPI의 전체 비교와 CSM 이력은 같은 기준으로 구분한다", () => {
    const props = { data: kpi, loading: false, error: null, period: "M" as const, selectedMonth: "2026-10" };
    const current = renderToStaticMarkup(<BranchKpiAccordion {...props} team="ALL" />);
    expect(current).not.toContain("CSM");
    const legacy = renderToStaticMarkup(<BranchKpiAccordion {...props} team="CSM" />);
    expect(legacy).toContain("CSM · 이전 조직 이력"); expect(legacy).toContain("이전 조직 매출 이력");
  });
});
