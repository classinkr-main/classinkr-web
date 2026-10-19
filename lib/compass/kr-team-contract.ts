/** Compass /api/cron/kr-team v1. 평가 산식은 Compass가 소유하고 관리자는 표시만 한다. */
export interface CompassKpiItem {
  metric: string; label: string; weight: number; target: number | null; actual: number | null;
  unit: string | null; kind: "quant" | "qual"; rate: number | null; score: number | null;
  grade: string | null; source: "auto" | "manual" | "none"; autoValue: number | null;
  reason: string | null; note: string | null;
  gradeSource?: "project" | "manual" | null; aside?: string | null; memo?: string | null;
  manualValue?: number | null; manualBy?: string | null; manualAt?: string | null;
  projected?: { value: number; rate: number; grade: string } | null;
}
export interface CompassKpiPerson {
  name: string; role: string; rate: number; score: number; grade: string;
  ratedWeight: number; weightSum: number; items: CompassKpiItem[];
  projected?: { rate: number; grade: string } | null;
}
export type CompassTeam = "BD" | "MKT" | "CSM";
export interface CompassKrTeamSnapshot {
  version: 1; month: string; generatedAt: string;
  roster: { name: string; role: string; team: CompassTeam | null; evaluationOnly: boolean }[];
  kpi: {
    basis: "live" | "closed"; closedAt: string | null;
    report: { month: string; people: CompassKpiPerson[]; elapsed: number; daysLeft: number; empty: boolean };
  };
  revenue: {
    currency: "CNY";
    period: { goal: number | null; actual: number | null; swGoal: number | null; swActual: number | null; hwGoal: number | null; hwActual: number | null; syncedAt: string | null } | null;
    people: { person: string; goal: number | null; actual: number | null; actualNew: number | null; actualRenew: number | null; syncedAt: string | null }[];
  };
}
export type CompassKrTeamResult =
  | { state: "ready"; snapshot: CompassKrTeamSnapshot }
  | { state: "not_configured" | "unavailable"; snapshot: null };

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const nullableNumber = (value: unknown) => value === null || number(value);
const nullableString = (value: unknown) => value === null || typeof value === "string";
const numbers = (value: Record<string, unknown>, keys: string[]) => keys.every((key) => number(value[key]));
const projection = (value: unknown, item = false) => value == null || (object(value) && number(value.rate) && typeof value.grade === "string" && (!item || number(value.value)));

/** 깨진 계약을 정상 0건으로 표시하지 않는다. 다른 달의 응답도 거부한다. */
export function isCompassKrTeamSnapshot(value: unknown, month: string): value is CompassKrTeamSnapshot {
  if (!object(value) || value.version !== 1 || value.month !== month || typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt))) return false;
  if (!Array.isArray(value.roster) || value.roster.length > 100 || !value.roster.every((p) => object(p) && typeof p.name === "string" && typeof p.role === "string" && [null, "MKT", "BD", "CSM"].includes(p.team as string | null) && typeof p.evaluationOnly === "boolean")) return false;
  const kpi = value.kpi;
  if (!object(kpi) || !["live", "closed"].includes(kpi.basis as string) || !nullableString(kpi.closedAt) || !object(kpi.report)) return false;
  const report = kpi.report;
  if (report.month !== month || !numbers(report, ["elapsed", "daysLeft"]) || typeof report.empty !== "boolean" || !Array.isArray(report.people) || report.people.length > 100) return false;
  for (const person of report.people) {
    if (!object(person) || typeof person.name !== "string" || typeof person.role !== "string" || !numbers(person, ["rate", "score", "ratedWeight", "weightSum"]) || typeof person.grade !== "string" || !Array.isArray(person.items) || person.items.length > 100) return false;
    if (!projection(person.projected)) return false;
    for (const item of person.items) {
      if (!object(item) || typeof item.metric !== "string" || typeof item.label !== "string" || !number(item.weight) || !["quant", "qual"].includes(item.kind as string) || !["auto", "manual", "none"].includes(item.source as string)) return false;
      if (!["target", "actual", "rate", "score", "autoValue"].every((key) => nullableNumber(item[key])) || !["unit", "grade", "reason", "note"].every((key) => nullableString(item[key]))) return false;
      // 오래된 확정 스냅샷에는 이 부연 칸이 없을 수 있다. 있으면 원본 타입을 검증한다.
      if (!["aside", "memo", "manualBy", "manualAt"].every((key) => item[key] === undefined || nullableString(item[key])) || (item.manualValue !== undefined && !nullableNumber(item.manualValue)) || !projection(item.projected, true)) return false;
      if (item.gradeSource !== undefined && ![null, "project", "manual"].includes(item.gradeSource as string | null)) return false;
    }
  }
  const revenue = value.revenue;
  if (!object(revenue) || revenue.currency !== "CNY" || !Array.isArray(revenue.people) || revenue.people.length > 100) return false;
  if (revenue.period !== null && (!object(revenue.period) || !["goal", "actual", "swGoal", "swActual", "hwGoal", "hwActual"].every((key) => nullableNumber((revenue.period as Record<string, unknown>)[key])) || !nullableString(revenue.period.syncedAt))) return false;
  return revenue.people.every((p) => object(p) && typeof p.person === "string" && ["goal", "actual", "actualNew", "actualRenew"].every((key) => nullableNumber(p[key])) && nullableString(p.syncedAt));
}
