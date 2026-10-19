import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ActivityBottleneckSection from "@/components/admin/branch/sections/ActivityBottleneckSection";
import type { BranchKpiMemberRow, BranchKpiResponse, Team } from "@/components/admin/branch/types";
import { SHEET_KPI_ACTIVE_TEAMS } from "@/lib/branch/current-organization";

const member = (name: string, team: string, actual: number): BranchKpiMemberRow => ({
  member: name, team, goal: 100, status: 10, achievement_pct: 10, confirmed: 10, deals_total: 1, deals_confirmed: 1,
  new_renew: { new: 10, renew: 0 }, kpi: { LD: { goal: 100, actual }, ACC: { goal: 100, actual: 90 } },
});
const data: BranchKpiResponse = { teams: [], members: [member("BD 담당", "BD", 10), member("MKT 시트 담당", "MKT", 0), member("CSM 이력 담당", "CSM", -5)] };
const render = (team: Team, extra = {}) => renderToStaticMarkup(<ActivityBottleneckSection kpi={data} loading={false} team={team} {...extra} />);

describe("활동 병목의 현재 평가 범위와 원본 이력", () => {
  it("전체에서도 현재 BD 시트 영업 KPI만 판정하고 MKT·CSM은 합치지 않는다", () => {
    const html = render("ALL");
    expect([...SHEET_KPI_ACTIVE_TEAMS]).toEqual(["BD"]);
    expect(html).toContain("BD 활동 병목"); expect(html).toContain("BD 시트 영업 KPI 기준");
    expect(html).toContain("BD 담당"); expect(html).toContain("10/100"); expect(html).toContain("페이스 미달");
    expect(html).not.toContain("MKT 시트 담당"); expect(html).not.toContain("CSM 이력 담당");
  });
  it("MKT에서는 시트 수치나 BD 병목을 내보내지 않고 Compass를 안내한다", () => {
    const html = render("MKT");
    expect(html).toContain("MKT 과정지표"); expect(html).toContain("Compass 평가표");
    expect(html).not.toContain("MKT 시트 담당"); expect(html).not.toContain("BD 담당");
    expect(html).not.toContain("페이스 미달"); expect(html).not.toContain("<table");
  });
  it("CSM에서는 음수 원본·목표와 이력 링크를 유지하되 현재 상태를 판정하지 않는다", () => {
    const html = render("CSM");
    expect(html).toContain("CSM 활동 지표 · 시트 이력"); expect(html).toContain("원본 시트 이력");
    expect(html).toContain("현재 조직의 병목 권고가 아닙니다");
    expect(html).toContain("CSM 이력 담당"); expect(html).toContain("-5/100"); expect(html).toContain("team=CSM");
    for (const value of ["페이스 미달", ">주의<", ">양호<", "BD 담당", "MKT 시트 담당"]) expect(html).not.toContain(value);
    expect(data.members.map((row) => row.team)).toEqual(["BD", "MKT", "CSM"]);
    expect(data.members[2].kpi.LD.actual).toBe(-5);
  });
  it("BD의 원천 오류는 빈 데이터로 숨기지 않고 MKT는 별도 평가 원천을 안내한다", () => {
    expect(render("BD", { error: "원천 읽기 실패" })).toContain('role="alert"');
    expect(render("MKT", { error: "시트 읽기 실패" })).toContain("Compass 평가표");
    const empty = renderToStaticMarkup(<ActivityBottleneckSection kpi={{ teams: [], members: [] }} loading={false} team="BD" />);
    expect(empty).toContain("목표가 설정된 활동 KPI 데이터가 없습니다");
  });
});
