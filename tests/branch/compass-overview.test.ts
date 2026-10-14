import { describe, expect, it } from "vitest";
import { comparisonDomain, comparisonGeometry, summarizeCompass } from "@/lib/branch/compass-overview";
import { snapshot } from "../compass/kr-team.fixture";

describe("평가 진행 요약은 원본 점수와 미배정을 구분한다", () => {
  it("부분 평가와 미배정 팀원을 완료·대기 분모에 섞지 않는다", () => {
    const data = snapshot(); data.roster.push({ name: "박한", role: "BD", team: "BD", evaluationOnly: false });
    const view = summarizeCompass(data, "ALL");
    expect(view.active).toHaveLength(1); expect(view.complete).toBe(0); expect(view.pending).toBe(1);
    expect(view.missing.map((person) => person.name)).toEqual(["박한"]);
    expect(view.active[0]).toBe(data.kpi.report.people[0]); expect(view.active[0].grade).toBe("A");
    data.kpi.report.people[0].ratedWeight = 1;
    expect(summarizeCompass(data, "ALL").complete).toBe(1);
  });
  it("현재 팀 변경을 적용하고 평가 당시 역할·수치·사유는 원본 그대로 둔다", () => {
    const data = snapshot(); data.roster[0].team = "MKT";
    expect(summarizeCompass(data, "CSM").active).toHaveLength(0);
    const view = summarizeCompass(data, "MKT"); expect(view.active[0].role).toBe("CS");
    expect(view.adjustments).toEqual([{ person: "김민재", label: "매출", reason: "환불 반영" }]);
  });
  it("정성 수동 채점 자체를 조정 건수로 세지 않는다", () => {
    const data = snapshot(); data.kpi.report.people[0].items[0].reason = null;
    expect(summarizeCompass(data, "ALL").adjustments).toHaveLength(0);
  });
  it("명부에서 빠진 확정 평가자도 전체 조회에서는 평가표를 보존한다", () => {
    const data = snapshot(); data.kpi.basis = "closed"; data.roster = [];
    expect(summarizeCompass(data, "ALL").active[0]).toBe(data.kpi.report.people[0]);
    expect(summarizeCompass(data, "MKT").active).toHaveLength(0);
  });
  it("평가 목표가 없으면 완료·대기 0명과 미배정 상태를 구분한다", () => {
    const data = snapshot(); data.kpi.report.people[0].items = []; data.kpi.report.people[0].weightSum = 0;
    const view = summarizeCompass(data, "ALL");
    expect(view.active).toHaveLength(0); expect(view.pending).toBe(0); expect(view.missing).toHaveLength(1);
  });
  it("가중치가 0인 평가표도 원본 상세를 숨기지 않는다", () => {
    const data = snapshot(); data.kpi.report.people[0].weightSum = 0; data.kpi.report.people[0].ratedWeight = 0;
    const view = summarizeCompass(data, "ALL");
    expect(view.configured[0]).toBe(data.kpi.report.people[0]); expect(view.unweighted).toHaveLength(1);
    expect(view.active).toHaveLength(0); expect(view.missing).toHaveLength(0);
  });
});

describe("비교 막대의 부호·목표·공통 축", () => {
  it("목표 초과를 100%로 잘라 표시하지 않는다", () => {
    const domain = comparisonDomain([0.5, 3], 1.2);
    expect(domain).toEqual({ min: 0, max: 3 });
    expect(comparisonGeometry(3, domain, 1)?.width).toBe(100);
    expect(comparisonGeometry(3, domain, 1)?.target).toBeCloseTo(100 / 3);
    expect(comparisonGeometry(0.5, domain)?.width).toBeCloseTo(100 / 6);
  });
  it("음수 조정은 공통 0 기준선의 왼쪽에 놓인다", () => {
    const domain = comparisonDomain([-2, 0.8], 1.2);
    expect(domain).toEqual({ min: -2, max: 1.2 });
    const negative = comparisonGeometry(-2, domain, 1)!;
    expect(negative.start).toBe(0); expect(negative.zero).toBeCloseTo(62.5); expect(negative.width).toBeCloseTo(62.5);
    expect(negative.target).toBeCloseTo(93.75);
    const positive = comparisonGeometry(0.8, domain)!; expect(positive.start).toBe(negative.zero);
  });
  it("실제 0과 미평가·잘못된 축을 구분한다", () => {
    expect(comparisonGeometry(0, { min: 0, max: 1 })?.width).toBe(0);
    for (const value of [null, Number.NaN, Infinity]) expect(comparisonGeometry(value, { min: 0, max: 1 })).toBeNull();
    expect(comparisonGeometry(1, { min: 1, max: 1 })).toBeNull();
  });
});
