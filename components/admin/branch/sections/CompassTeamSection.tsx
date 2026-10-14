"use client";

import type { CompassKrTeamResult, CompassKpiItem } from "@/lib/compass/kr-team-contract";
import { TEAM_COLORS } from "@/lib/branch/team-colors";
import { cnyExact } from "@/lib/branch/money-format";
import { formatBusinessDateTimeLabel } from "@/lib/business-time";
import type { BranchJsonState } from "../client-api";
import type { Team } from "../types";

const display = (value: number | null) => value == null ? "미설정" : value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
const rate = (value: number | null) => value == null ? "평가 전" : `${(value * 100).toFixed(1)}%`;

function Metric({ item }: { item: CompassKpiItem }) {
  return <tr className="border-t border-[rgba(0,0,0,0.08)] align-top">
    <th scope="row" className="px-3 py-2 text-left font-medium">
      {item.label}
      <span className="ml-2 text-[11px] font-normal text-[#615D59]">{(item.weight * 100).toFixed(0)}% · {item.kind === "qual" ? "정성" : item.unit ?? "정량"}</span>
      {item.reason ? <p className="mt-1 text-[11px] font-normal text-[#615D59]">조정 사유: {item.reason}</p> : null}
      {item.note ? <p className="mt-1 text-[11px] font-normal text-[#615D59]">{item.note}</p> : null}
      {item.memo ? <p className="mt-1 text-[11px] font-normal text-[#615D59]">메모: {item.memo}</p> : null}
      {item.manualBy || item.manualAt ? <p className="mt-1 text-[11px] font-normal text-[#615D59]">평가·조정 {item.manualBy} {item.manualAt}</p> : null}
    </th>
    <td className="px-3 py-2 tabular-nums">{display(item.target)}{item.aside ? <p className="text-[11px] text-[#615D59]">{item.aside}</p> : null}</td>
    <td className="px-3 py-2 tabular-nums">
      {item.kind === "qual" ? item.grade ?? "평가 전" : display(item.actual)}
      <span className="ml-1 text-[11px] text-[#615D59]">{item.source === "manual" ? "수동 조정" : item.source === "auto" ? "자동" : "평가 전"}</span>
      {item.source === "manual" && item.autoValue != null ? <p className="text-[11px] text-[#615D59]">자동 집계 {display(item.autoValue)}</p> : null}
      {item.gradeSource ? <p className="text-[11px] text-[#615D59]">{item.gradeSource === "project" ? "프로젝트 채점" : "책임자 평가"}</p> : null}
    </td>
    <td className="px-3 py-2 tabular-nums">{rate(item.rate)}<span className="ml-2">{item.grade ?? "—"}</span>
      {item.score != null ? <p className="text-[11px] text-[#615D59]">{display(item.score)}점</p> : null}
      {item.projected ? <p className="mt-1 text-[11px] text-[#615D59]">월말 전망 {display(item.projected.value)} · {rate(item.projected.rate)} · {item.projected.grade}</p> : null}
    </td>
  </tr>;
}

export default function CompassTeamSection({ resource, month, onMonthChange, team }: {
  resource: BranchJsonState<CompassKrTeamResult>; month: string; onMonthChange: (month: string) => void; team: Team;
}) {
  const snapshot = resource.data?.state === "ready" ? resource.data.snapshot : null;
  const unavailable = !!resource.error || resource.data?.state === "unavailable";
  const roster = new Map(snapshot?.roster.map((person) => [person.name, person]));
  const currentMembers = snapshot?.roster.filter((person) => team === "ALL" || person.team === team) ?? [];
  const people = snapshot?.kpi.report.people.filter((person) => team === "ALL" || roster.get(person.name)?.team === team) ?? [];
  const period = snapshot?.revenue.period;
  return <section aria-label="Compass 월별 과정지표" className="mb-5 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
      <div>
        <h2 className="text-[14px] font-bold text-[#111110]">Compass · 월별 과정지표</h2>
        <p className="mt-1 text-[12px] text-[#615D59]">팀 명부·평가 항목·수동 조정·확정 평가표를 Compass 기준으로 표시합니다.</p>
      </div>
      <label className="flex items-center gap-2 text-[12px] text-[#615D59]">평가 월
        <input type="month" aria-label="Compass 평가 월" value={month} onChange={(event) => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) onMonthChange(event.target.value); }} className="min-h-11 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[16px] text-[#111110] md:text-[12px]" />
      </label>
    </div>
    {resource.loading && !resource.data ? <p role="status" className="px-5 py-5 text-[13px] text-[#615D59]">Compass 평가표를 불러오는 중입니다.</p>
      : unavailable ? <p role="alert" className="px-5 py-5 text-[13px] text-[#A8741A]">Compass 평가표를 확인하지 못했습니다. 연결을 확인한 뒤 새로고침해 주세요.</p>
      : !snapshot ? <p role="status" className="px-5 py-5 text-[13px] text-[#615D59]">Compass 과정지표 연결이 설정되지 않았습니다. 시트 영업 KPI와 매출 장부는 아래에서 확인할 수 있습니다.</p>
      : <div className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#615D59]">
          <strong className="text-[#084734]">{snapshot.kpi.basis === "closed" ? "확정 평가표" : "집계 중"}</strong>
          <span>{snapshot.kpi.closedAt ? `확정 ${snapshot.kpi.closedAt}` : `조회 ${formatBusinessDateTimeLabel(snapshot.generatedAt)}`}</span>
          <span>{resource.stale ? "이전 조회 결과 · 갱신 필요" : `${month} 월별 평가 · ${people.length}명`}</span>
          <span>월 경과 {rate(snapshot.kpi.report.elapsed)} · 남은 {snapshot.kpi.report.daysLeft}일</span>
          <a href={`https://mkt.classin.co.kr/kpi?m=${encodeURIComponent(month)}`} target="_blank" rel="noreferrer" className="underline underline-offset-2">Compass 평가표 열기 ↗</a>
        </div>
        <div aria-label="Compass 현재 팀 명부" className="flex flex-wrap gap-2">
          {currentMembers.map((member) => <span key={member.name} className="rounded-md border border-[rgba(0,0,0,0.08)] px-3 py-2 text-[12px] text-[#31302E]">
            <strong>{member.name}</strong> · {member.role || "역할 미설정"}{member.evaluationOnly ? " · KPI 대상 전용" : ""}
          </span>)}
          {!currentMembers.length ? <span className="text-[12px] text-[#615D59]">현재 명부에 등록된 팀원이 없습니다.</span> : null}
        </div>
        {period ? <div className="rounded-lg bg-[#F6F5F4] px-4 py-3 text-[12px] text-[#31302E]">
          <span className="font-semibold">Compass 전체 팀 월매출</span> · 실적 {period.actual == null ? "미수집" : `¥${cnyExact(period.actual)}`} / 목표 {period.goal == null ? "미설정" : `¥${cnyExact(period.goal)}`}
          <p className="mt-1 text-[11px] text-[#615D59]">DSH 동기화 기준 · CNY · {period.syncedAt ? formatBusinessDateTimeLabel(period.syncedAt) : "수집 시각 없음"} · 팀 필터와 무관한 전사 금액입니다. 장부 금액과 합산하지 않습니다.</p>
        </div> : <p className="text-[12px] text-[#615D59]">해당 월의 Compass 매출 미러가 아직 수집되지 않았습니다.</p>}
        {snapshot.kpi.report.empty ? <p className="text-[13px] text-[#615D59]">이 달의 평가 목표가 아직 설정되지 않았습니다.</p> : null}
        {!people.length ? <p className="text-[13px] text-[#615D59]">선택한 팀의 월별 과정지표가 없습니다.</p> : people.map((person) => {
          const member = roster.get(person.name); const color = member?.team ? TEAM_COLORS[member.team].color : "#615D59";
          return <details key={person.name} className="rounded-lg border border-[rgba(0,0,0,0.08)]" open={people.length === 1}>
            <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-[13px]">
              <strong>{person.name}</strong><span style={{ color }}>{member?.team ?? "팀 미분류"}</span><span className="text-[#615D59]">{person.role}</span>
              <span className="ml-auto tabular-nums">{person.ratedWeight > 0 ? `${person.grade} · ${person.score.toFixed(2)}점 · ${rate(person.rate)}` : "평가 전"}</span>
              <span className="text-[11px] text-[#615D59]">평가 {(person.ratedWeight * 100).toFixed(0)}% / 배정 {(person.weightSum * 100).toFixed(0)}%</span>
              {person.projected ? <span className="text-[11px] text-[#615D59]">월말 전망 {person.projected.grade} · {rate(person.projected.rate)}</span> : null}
              {member?.evaluationOnly ? <span className="text-[11px] text-[#615D59]">KPI 대상 전용</span> : null}
            </summary>
            {person.items.length ? <div className="overflow-x-auto"><table className="w-full min-w-[540px] text-[12px] text-[#31302E]">
              <caption className="sr-only">{person.name}의 {month} 평가 항목</caption>
              <thead className="bg-[#F6F5F4] text-left text-[#615D59]"><tr><th scope="col" className="px-3 py-2">항목 · 가중치</th><th scope="col" className="px-3 py-2">목표</th><th scope="col" className="px-3 py-2">실적 · 출처</th><th scope="col" className="px-3 py-2">달성률 · 등급</th></tr></thead>
              <tbody>{person.items.map((item) => <Metric key={item.metric} item={item} />)}</tbody>
            </table></div> : <p className="px-4 pb-3 text-[12px] text-[#615D59]">이 달의 평가 항목이 없습니다.</p>}
          </details>;
        })}
      </div>}
  </section>;
}
