"use client";

import { ChevronDown, ExternalLink } from "lucide-react";
import type { CompassKrTeamResult } from "@/lib/compass/kr-team-contract";
import { comparisonDomain, summarizeCompass } from "@/lib/branch/compass-overview";
import { isLegacyBranchTeam } from "@/lib/branch/current-organization";
import { TEAM_COLORS } from "@/lib/branch/team-colors";
import { cnyExact } from "@/lib/branch/money-format";
import { formatBusinessDateTimeLabel } from "@/lib/business-time";
import type { BranchJsonState } from "../client-api";
import type { Team } from "../types";
import ComparisonBar from "./ComparisonBar";
import CompassKpiDetail from "./CompassKpiDetail";

const rate = (value: number) => (value * 100).toFixed(1) + "%";

export default function CompassTeamSection({ resource, month, onMonthChange, team }: {
  resource: BranchJsonState<CompassKrTeamResult>; month: string; onMonthChange: (month: string) => void; team: Team;
}) {
  const snapshot = resource.data?.state === "ready" ? resource.data.snapshot : null;
  const unavailable = !!resource.error || resource.data?.state === "unavailable";
  const view = snapshot ? summarizeCompass(snapshot, team) : null;
  const roster = new Map(view?.roster.map((person) => [person.name, person]));
  const domain = comparisonDomain(view?.active.filter((person) => person.ratedWeight > 0).map((person) => person.rate) ?? [], 1.2);
  const period = snapshot?.revenue.period;

  if (isLegacyBranchTeam(team)) return <section aria-label="Compass 월별 과정지표" className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-5 py-4 text-[13px] text-[#615D59]">CSM은 이전 조직입니다. 현재 Compass 과정지표는 KR 전체 · BD · MKT에서 확인할 수 있습니다. 원본 평가표와 과거 매출은 보존됩니다.</section>;

  return <section aria-label="Compass 월별 과정지표" className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
      <div>
        <h2 className="text-[16px] font-bold text-[#111110]">Compass 평가 요약</h2>
        <p className="mt-1 text-[12px] text-[#615D59]">월별 진행 상황 · 팀원별 성과</p>
      </div>
      <label className="flex items-center gap-2 text-[12px] text-[#615D59]">평가 월
        <input type="month" aria-label="Compass 평가 월" value={month} onChange={(event) => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) onMonthChange(event.target.value); }} className="min-h-11 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[16px] text-[#111110] md:text-[13px]" />
      </label>
    </div>
    {resource.loading && !resource.data ? <p role="status" className="px-5 py-5 text-[13px] text-[#615D59]">Compass 평가표를 불러오는 중입니다.</p>
      : unavailable ? <p role="alert" className="px-5 py-5 text-[13px] text-[#A8741A]">Compass 평가표를 확인하지 못했습니다. 연결을 확인한 뒤 새로고침해 주세요.</p>
      : !snapshot || !view ? <p role="status" className="px-5 py-5 text-[13px] text-[#615D59]">Compass 과정지표 연결이 설정되지 않았습니다. 시트 영업 KPI와 매출 장부는 아래에서 확인할 수 있습니다.</p>
      : <div className="space-y-5 px-5 py-5">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[13px] text-[#615D59]">평가 완료</span>
              <strong className="text-[30px] font-bold tracking-[-0.02em] text-[#111110]">{view.complete}<span className="ml-1 text-[16px] font-normal text-[#615D59]">/ {view.active.length}명</span></strong>
              <span className="text-[12px] text-[#615D59]">평가 항목·가중치가 있는 팀원 기준</span>
            </div>
            {view.active.length ? <div className="mt-3 h-2 overflow-hidden rounded-sm bg-[#F6F5F4]" aria-hidden="true"><div className="h-full bg-[#084734]" style={{ width: (view.complete / view.active.length * 100) + "%" }} /></div> : null}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-[#615D59]">
              <span>평가 대기 <strong className="text-[#111110]">{view.pending}명</strong></span>
              <span>항목 미설정 <strong className="text-[#111110]">{view.missing.length}명</strong></span>
              <span>수동 조정 <strong className="text-[#111110]">{view.adjustments.length}건</strong></span>
            </div>
          </div>
          <div className="border-t border-[rgba(0,0,0,0.08)] pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0">
            <h3 className="text-[13px] font-semibold text-[#111110]">확인할 항목</h3>
            <ul className="mt-2 space-y-1.5 text-[13px] text-[#615D59]">
              {view.pending > 0 ? <li>평가 대기 {view.pending}명 · 미평가 항목 확인</li> : null}
              {view.missing.length > 0 ? <li>평가 항목 미설정 {view.missing.length}명 · 명부에서 확인</li> : null}
              {view.unweighted.length > 0 ? <li>가중치 확인 {view.unweighted.length}명 · 상세에서 배정 확인</li> : null}
              {view.adjustments.length > 0 ? <li>수동 조정 {view.adjustments.length}건 · 상세에서 사유 확인</li> : null}
              {view.active.length > 0 && !view.pending && !view.missing.length && !view.unweighted.length && !view.adjustments.length ? <li>배정된 평가가 모두 반영됐습니다.</li> : null}
              {snapshot.kpi.report.empty ? <li>이 달의 평가 목표가 아직 설정되지 않았습니다.</li> : null}
            </ul>
          </div>
        </div>

        {view.configured.length ? <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#615D59]">
            <span>팀원별 달성률 · 펼치면 목표와 조정 내역</span><span>점선: 100% 목표 · 개인별 배정 항목 기준</span>
          </div>
          <div className="divide-y divide-[rgba(0,0,0,0.08)] border-y border-[rgba(0,0,0,0.08)]">
            {view.configured.map((person) => {
              const member = roster.get(person.name);
              return <details key={person.name} className="group">
                <summary className="grid min-h-11 cursor-pointer grid-cols-[minmax(0,1fr)_auto_20px] items-center gap-x-4 gap-y-2 px-1 py-4 focus-visible:outline-2 focus-visible:outline-[#084734] md:grid-cols-[minmax(140px,1fr)_minmax(140px,1.2fr)_120px_20px]">
                  <div className="col-start-1 row-start-1 min-w-0">
                    <strong className="text-[14px] text-[#111110]">{person.name}</strong>
                    <span className="ml-2 text-[12px]" style={{ color: member?.team ? TEAM_COLORS[member.team].color : "#615D59" }}>{member?.team ?? "팀 미분류"}</span>
                    <p className="mt-1 text-[12px] text-[#615D59]">{member?.role || "역할 미설정"} · 평가 {(person.ratedWeight * 100).toFixed(0)}%{member?.evaluationOnly ? " · KPI 대상 전용" : ""}</p>
                    {member && member.role !== person.role ? <p className="mt-1 text-[12px] text-[#615D59]">평가표 역할: {person.role || "역할 미설정"}</p> : null}
                  </div>
                  <div className="col-span-3 row-start-2 md:col-span-1 md:col-start-2 md:row-start-1">
                    {person.ratedWeight > 0 ? <ComparisonBar value={person.rate} target={1} domain={domain} label={person.name + " 달성률 " + rate(person.rate) + ", 목표 100%"} /> : <span className="text-[13px] text-[#615D59]">평가 전</span>}
                  </div>
                  <span className="col-start-2 row-start-1 text-right text-[15px] font-semibold tabular-nums text-[#111110] md:col-start-3">{person.ratedWeight > 0 ? person.grade + " · " + rate(person.rate) : "평가 전"}</span>
                  <ChevronDown aria-hidden="true" className="col-start-3 row-start-1 h-4 w-4 text-[#615D59] transition-transform group-open:rotate-180 md:col-start-4" />
                </summary>
                <CompassKpiDetail person={person} month={month} />
              </details>;
            })}
          </div>
        </div> : <p className="text-[13px] text-[#615D59]">선택한 팀의 월별 과정지표가 없습니다.</p>}

        {view.archived.length ? <details className="rounded-lg border border-[rgba(0,0,0,0.08)]">
          <summary className="min-h-11 cursor-pointer px-4 py-3 text-[13px] font-medium text-[#31302E] focus-visible:outline-2 focus-visible:outline-[#084734]">현재 명부 외 원본 평가표 <span className="ml-2 font-normal text-[#615D59]">{view.archived.length}명</span></summary>
          <div className="border-t border-[rgba(0,0,0,0.08)] px-4 py-3 text-[12px] text-[#615D59]">현재 팀 집계에서 제외됩니다. 원본 평가 내역은 보존하며 명부 제외만으로 퇴사·삭제 여부를 판단하지 않습니다.</div>
          {view.archived.map((person) => <details key={person.name} className="border-t border-[rgba(0,0,0,0.08)]">
            <summary className="min-h-11 cursor-pointer px-4 py-3 text-[13px] text-[#31302E]">{person.name} · 평가표 역할 {person.role || "역할 미설정"}</summary>
            <CompassKpiDetail person={person} month={month} />
          </details>)}
        </details> : null}

        <details className="rounded-lg border border-[rgba(0,0,0,0.08)]">
          <summary className="min-h-11 cursor-pointer px-4 py-3 text-[13px] font-medium text-[#31302E] focus-visible:outline-2 focus-visible:outline-[#084734]">팀원 명부 · 원본 자료 <span className="ml-2 font-normal text-[#615D59]">{view.roster.length}명</span></summary>
          <div className="space-y-4 border-t border-[rgba(0,0,0,0.08)] px-4 py-4">
            <div aria-label="Compass 현재 팀 명부" className="space-y-2 text-[13px] text-[#31302E]">
              {view.roster.map((member) => <p key={member.name}><strong>{member.name}</strong> · {member.role || "역할 미설정"}{member.evaluationOnly ? " · KPI 대상 전용" : ""}{view.missing.some((person) => person.name === member.name) ? " · 평가 항목 미설정" : ""}</p>)}
              {!view.roster.length ? <p>현재 명부에 등록된 팀원이 없습니다.</p> : null}
            </div>
            {period ? <div className="text-[13px] text-[#31302E]">
              <p className="font-semibold">Compass 전체 팀 월매출</p>
              <p className="mt-1">실적 {period.actual == null ? "미수집" : "¥" + cnyExact(period.actual)} / 목표 {period.goal == null ? "미설정" : "¥" + cnyExact(period.goal)}</p>
              <p className="mt-1 text-[12px] text-[#615D59]">DSH · CNY · {period.syncedAt ? formatBusinessDateTimeLabel(period.syncedAt) : "수집 시각 없음"} · 장부 금액과 합산하지 않습니다.</p>
            </div> : <p className="text-[13px] text-[#615D59]">해당 월의 Compass 매출 미러가 아직 수집되지 않았습니다.</p>}
          </div>
        </details>
        <div className="flex flex-wrap items-center justify-between gap-3 text-[12px] text-[#615D59]">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <strong className="text-[#084734]">{snapshot.kpi.basis === "closed" ? "확정 평가표" : "집계 중"}</strong>
            <span>{snapshot.kpi.closedAt ? "확정 " + snapshot.kpi.closedAt : "조회 " + formatBusinessDateTimeLabel(snapshot.generatedAt)}</span>
            <span>{resource.stale ? "이전 조회 결과 · 갱신 필요" : month + " 월별 평가"}</span>
            <span>월 경과 {rate(snapshot.kpi.report.elapsed)} · 남은 {snapshot.kpi.report.daysLeft}일</span>
          </div>
          <a href={"https://mkt.classin.co.kr/kpi?m=" + encodeURIComponent(month)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-[#084734] underline underline-offset-2">Compass 평가표 <ExternalLink aria-hidden="true" className="h-3 w-3" /></a>
        </div>
      </div>}
  </section>;
}
