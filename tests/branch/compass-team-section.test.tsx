import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CompassTeamSection from "@/components/admin/branch/sections/CompassTeamSection";
import type { CompassKrTeamResult } from "@/lib/compass/kr-team-contract";
import type { BranchJsonState } from "@/components/admin/branch/client-api";
import { snapshot } from "../compass/kr-team.fixture";

const resource = (data: CompassKrTeamResult | null, extra = {}): BranchJsonState<CompassKrTeamResult> => ({ key: "month", data, loading: false, error: null, stale: false, staleSince: null, ...extra });
const render = (state: BranchJsonState<CompassKrTeamResult>, team: "ALL" | "MKT" | "CSM" = "ALL") => renderToStaticMarkup(<CompassTeamSection resource={state} month="2026-10" team={team} onMonthChange={() => {}} />);

describe("Compass 과정지표의 표시 상태", () => {
  it("수동 조정과 원본값·부호·가중치·KPI 전용 팀원을 표시한다", () => {
    const html = render(resource({ state: "ready", snapshot: snapshot() }), "CSM");
    for (const value of ["김민재", "CSM", "KPI 대상 전용", "수동 조정", "환불 반영", "자동 집계 100", "-100", "50%", "배정 100%", "평가 월", "참고 2건", "월말 수납 교정", "승인자", "10-14", "월말 전망", "-200", "150.0%", "남은 15일"]) expect(html).toContain(value);
    expect(html).toContain("장부 금액과 합산하지 않습니다");
  });
  it("새 팀 명부와 평가표는 목표가 없더라도 구분해 표시한다", () => {
    const data = snapshot(); data.roster.push({ name: "신규 팀원", role: "MKT조", team: "MKT", evaluationOnly: false });
    const html = render(resource({ state: "ready", snapshot: data }), "MKT");
    expect(html).toContain("신규 팀원"); expect(html).toContain("선택한 팀의 월별 과정지표가 없습니다"); expect(html).not.toContain("환불 반영");
  });
  it("로딩·미설정·장애·미수집·평가 전을 같은 0점으로 표시하지 않는다", () => {
    expect(render(resource(null, { loading: true }))).toContain("불러오는 중");
    expect(render(resource({ state: "not_configured", snapshot: null }))).toContain("설정되지 않았습니다");
    expect(render(resource({ state: "unavailable", snapshot: null }))).toContain('role="alert"');
    const data = snapshot(); data.revenue.period = null; data.kpi.report.people[0].ratedWeight = 0;
    const html = render(resource({ state: "ready", snapshot: data }, { stale: true }));
    expect(html).toContain("아직 수집되지 않았습니다"); expect(html).toContain("평가 전"); expect(html).toContain("이전 조회 결과");
  });
  it("확정 평가표와 실제 확정 시각을 보인다", () => {
    const data = snapshot(); data.kpi.basis = "closed"; data.kpi.closedAt = "2026-10-31 18:00";
    const html = render(resource({ state: "ready", snapshot: data }));
    expect(html).toContain("확정 평가표"); expect(html).toContain("2026-10-31 18:00");
  });
  it("기본 화면은 요약·차트이고 상세표는 닫혀 있다", () => {
    const data = snapshot(); data.kpi.report.people[0].rate = -0.25;
    const html = render(resource({ state: "ready", snapshot: data }));
    expect(html).toContain("평가 완료"); expect(html).toContain("평가 대기"); expect(html).toContain("확인할 항목");
    expect(html).toContain('aria-label="김민재 달성률 -25.0%, 목표 100%"');
    const disclosures = [...html.matchAll(/<details\b[^>]*>/g)];
    expect(disclosures.length).toBeGreaterThan(0);
    expect(disclosures.every(([tag]) => !/\sopen(?:[=>\s])/.test(tag))).toBe(true);
  });
  it("0 가중치의 목표·조정 내역도 상세에서 보존한다", () => {
    const data = snapshot(); data.kpi.report.people[0].weightSum = 0; data.kpi.report.people[0].ratedWeight = 0;
    const html = render(resource({ state: "ready", snapshot: data }));
    expect(html).toContain("가중치 확인"); expect(html).toContain("환불 반영"); expect(html).toContain("월말 수납 교정");
  });
});
