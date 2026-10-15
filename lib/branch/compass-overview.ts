import type { CompassKrTeamSnapshot, CompassTeam } from "@/lib/compass/kr-team-contract";
import { isLegacyBranchTeam } from "@/lib/branch/current-organization";

/** 요약은 평가 진행과 출처만 센다. 개인 점수·등급·전망은 원본을 그대로 사용한다. */
export function summarizeCompass(snapshot: CompassKrTeamSnapshot, team: CompassTeam | "ALL") {
  // 폐지된 팀 표기가 오래된 응답에 남아 있어도 현재 팀으로 되살리지 않는다.
  const currentRoster = snapshot.roster.map((person) => isLegacyBranchTeam(person.team) ? { ...person, team: null } : person);
  const roster = currentRoster.filter((person) => team === "ALL" || person.team === team);
  const names = new Set(roster.map((person) => person.name));
  const currentNames = new Set(snapshot.roster.map((person) => person.name));
  const people = snapshot.kpi.report.people.filter((person) => names.has(person.name));
  // 명부 변경은 현재 조직 집계에만 적용한다. 명부에서 빠진 원본 평가표는 삭제·재배정하지 않는다.
  const archived = team === "ALL" ? snapshot.kpi.report.people.filter((person) => !currentNames.has(person.name)) : [];
  const configured = people.filter((person) => person.items.length > 0);
  const active = configured.filter((person) => person.weightSum > 0);
  const complete = active.filter((person) => person.ratedWeight >= person.weightSum).length;
  const missing = roster.filter((member) => !configured.some((person) => person.name === member.name));
  const unweighted = configured.filter((person) => person.weightSum <= 0);
  const adjustments = configured.flatMap((person) => person.items
    .filter((item) => item.reason?.trim())
    .map((item) => ({ person: person.name, label: item.label, reason: item.reason! })));
  return { roster, people, archived, configured, active, complete, pending: active.length - complete, missing, unweighted, adjustments };
}

export type BarDomain = { min: number; max: number };

/** 공통 축은 0과 목표를 포함한다. 음수·초과 달성을 잘라 정상 0/100으로 바꾸지 않는다. */
export function comparisonDomain(values: readonly (number | null)[], baselineMax = 1): BarDomain {
  const finite = values.filter((value): value is number => value != null && Number.isFinite(value));
  return { min: Math.min(0, ...finite), max: Math.max(baselineMax, ...finite) };
}

export function comparisonGeometry(value: number | null, domain: BarDomain, target?: number | null) {
  if (value == null || !Number.isFinite(value) || !Number.isFinite(domain.min) || !Number.isFinite(domain.max) || domain.max <= domain.min) return null;
  const position = (number: number) => Math.max(0, Math.min(100, (number - domain.min) / (domain.max - domain.min) * 100));
  const zero = position(0), end = position(value);
  return {
    zero, start: Math.min(zero, end), width: Math.abs(end - zero),
    target: target == null || !Number.isFinite(target) ? null : position(target),
  };
}
