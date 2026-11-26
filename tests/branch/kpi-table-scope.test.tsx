import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BranchKpiTable from "@/components/admin/branch/sections/BranchKpiTable";
import type { BranchKpiMemberRow, BranchKpiResponse, Team } from "@/components/admin/branch/types";
import { SHEET_KPI_ACTIVE_TEAMS } from "@/lib/branch/current-organization";

// 파이프라인 탭 KPI 표 — 예전 팀 아코디언과 'BD 활동 병목' 표를 합친 뒤에도 평가 범위 규칙은 같다.
const member = (name: string, team: string, actual: number): BranchKpiMemberRow => ({
  member: name, team, goal: 100, status: 10, achievement_pct: 10, confirmed: 10, deals_total: 1, deals_confirmed: 1,
  new_renew: { new: 10, renew: 0 }, kpi: { LD: { goal: 100, actual }, ACC: { goal: 100, actual: 90 } },
});
const data: BranchKpiResponse = {
  teams: ["BD", "MKT", "CSM"].map((team) => ({ team, goal: 100, status: 10, pacing_pct: 10 })),
  members: [member("BD 담당", "BD", 10), member("MKT 시트 담당", "MKT", 7), member("CSM 이력 담당", "CSM", -5)],
};
const render = (team: Team, extra: Partial<{ data: BranchKpiResponse; error: string | null }> = {}) =>
  renderToStaticMarkup(<BranchKpiTable data={data} loading={false} error={null} team={team} period="M" selectedMonth="2026-10" {...extra} />);

describe("KPI 표의 현재 평가 범위와 원본 이력", () => {
  it("전체에서도 시트 영업 KPI는 BD만 판정하고 MKT 시트 수치·CSM 이력은 싣지 않는다", () => {
    const html = render("ALL");
    expect([...SHEET_KPI_ACTIVE_TEAMS]).toEqual(["BD"]);
    expect(html).toContain("BD 담당"); expect(html).toContain("10/100"); expect(html).toContain("페이스 미달");
    expect(html).toContain("MKT 시트 담당"); expect(html).toContain("Compass 평가표");
    expect(html).not.toContain(">7/100<"); expect(html).not.toContain("CSM 이력 담당");
  });
  it("MKT에서는 시트 수치나 BD 병목을 내보내지 않고 Compass를 안내한다", () => {
    const html = render("MKT");
    expect(html).toContain("Compass 평가표");
    expect(html).not.toContain("BD 담당"); expect(html).not.toContain(">7/100<"); expect(html).not.toContain("페이스 미달");
  });
  it("CSM에서는 음수 원본·목표와 이력 링크를 유지하되 현재 상태를 판정하지 않는다", () => {
    const html = render("CSM");
    expect(html).toContain("CSM · 이전 조직 이력"); expect(html).toContain("원본 시트 이력");
    expect(html).toContain("현재 조직의 병목 권고가 아닙니다");
    expect(html).toContain("CSM 이력 담당"); expect(html).toContain("-5/100"); expect(html).toContain("team=CSM");
    for (const value of ["페이스 미달", ">주의<", "BD 담당", "MKT 시트 담당"]) expect(html).not.toContain(value);
    expect(data.members[2].kpi.LD.actual).toBe(-5);
  });
  it("원천 오류는 빈 표로 숨기지 않고 데이터가 없으면 그렇게 말한다", () => {
    expect(render("BD", { error: "원천 읽기 실패" })).toContain('role="alert"');
    expect(render("BD", { data: { teams: [], members: [] } })).toContain("표시할 담당자 KPI가 없습니다");
  });
  it("이전 조직 팀 합계는 이력으로 표시하고 전체 비교에는 넣지 않는다", () => {
    const teamsOnly: BranchKpiResponse = { teams: data.teams, members: [] };
    expect(render("ALL", { data: teamsOnly })).not.toContain("CSM");
    const legacy = render("CSM", { data: teamsOnly });
    expect(legacy).toContain("CSM · 이전 조직 이력"); expect(legacy).toContain("이전 조직 매출 이력");
  });
  it("개인 범위는 전사 팀 합계가 없어도 과거 CSM 소속 개인의 목표·매출 행을 표시한다", () => {
    const personal: BranchKpiResponse = {
      scope: { manager: "Somang" }, teams: [],
      members: [{ member: "Somang", team: "CSM", goal: 200, status: 70, achievement_pct: 35, confirmed: 70, deals_total: 1, deals_confirmed: 1, new_renew: { new: 1, renew: 0 }, kpi: {} }],
    };
    const html = render("ALL", { data: personal });
    expect(html).toContain("내 담당 · Somang"); expect(html).toContain("35%");
    expect(html).not.toContain("Junhyuk"); expect(html).toContain("Compass");
  });
});
