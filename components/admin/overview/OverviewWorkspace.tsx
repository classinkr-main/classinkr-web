"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { ArrowUpRight, RotateCw } from "lucide-react"
import { compassLeadUrl } from "@/lib/compass/normalize"
import type { OverviewOperationsSummary } from "@/lib/admin/overview/operations-summary"
import { SectionSkeleton } from "@/components/admin/viz"

const BORDER = "border-[rgba(0,0,0,0.08)]"
const TONES = { neutral: "text-[#615D59]", success: "text-[#084734]", warning: "text-[#A8741A]", danger: "text-[#B43E3E]" }
export type WorkspaceTone = keyof typeof TONES

export interface OverviewMetric {
  id: string
  group: string
  label: string
  value: string
  note: string
  href: string
  reference?: string
  progress?: number
  trend?: ReactNode
  state: "loading" | "ready" | "error"
  tone?: WorkspaceTone
  onRetry: () => void
}

export function OverviewBriefing({ summary, metrics }: { summary: ReactNode; metrics: OverviewMetric[] }) {
  return (
    <section aria-labelledby="overview-briefing-heading" className={`mb-10 rounded-2xl border ${BORDER} bg-white px-5 py-7 shadow-[0_4px_18px_rgba(0,0,0,0.04)] sm:px-9 sm:py-9`}>
      <h2 id="overview-briefing-heading" className="text-xs font-semibold text-[#084734]">오늘의 요약</h2>
      <p className="mt-3 max-w-4xl text-xl font-semibold leading-relaxed tracking-[-0.025em] text-[#111110] sm:text-[26px]">{summary}</p>
      <div className={`mt-7 grid grid-cols-2 border-t ${BORDER} pt-5 lg:grid-cols-4`}>
        {metrics.map((metric) => (
          <div key={metric.id} className={`min-w-0 border-l ${BORDER} px-4 py-3 first:border-l-0 first:pl-0 sm:px-6 [&:nth-child(3)]:border-l-0 [&:nth-child(3)]:pl-0 lg:[&:nth-child(3)]:border-l lg:[&:nth-child(3)]:pl-6`}>
            <Link href={metric.href} className="block hover:opacity-75">
              <p className="text-xs text-[#615D59]">{metric.label}</p>
              <p aria-busy={metric.state === "loading"} className="mt-3 text-[30px] font-bold leading-none tracking-[-0.04em] tabular-nums text-[#111110] sm:text-[38px]">{metric.state === "ready" ? metric.value : metric.state === "error" ? "확인 필요" : "—"}</p>
              <p className={`mt-3 text-xs leading-relaxed ${TONES[metric.tone ?? "neutral"]}`}>{metric.state === "ready" ? metric.note : metric.state === "loading" ? "불러오는 중" : "조회 실패 · 0건이 아닙니다"}</p>
            </Link>
            {metric.state === "error" && <Retry label={metric.label} onRetry={metric.onRetry} />}
          </div>
        ))}
      </div>
    </section>
  )
}

function Retry({ label, onRetry }: { label: string; onRetry: () => void }) {
  return <button type="button" onClick={onRetry} aria-label={`${label} 지표 다시 시도`} className="inline-flex items-center gap-1 text-xs font-semibold text-[#B43E3E]"><RotateCw className="h-3 w-3" aria-hidden="true" />다시 시도</button>
}

function Panel({ title, href, children, note }: { title: string; href: string; children: ReactNode; note: string }) {
  return <section className={`min-w-0 rounded-2xl border ${BORDER} bg-white p-5 sm:p-6`}>
    <div className="mb-4 flex items-center justify-between gap-2"><h2 className="text-lg font-bold tracking-[-0.025em] text-[#111110]">{title}</h2><Link href={href} aria-label={`${title} 전체 보기`} className="inline-flex items-center gap-1 text-xs font-semibold text-[#084734]">전체 보기<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link></div>
    {children}
    <p className={`mt-4 border-t ${BORDER} pt-3 text-[11px] leading-relaxed text-[#615D59]`}>{note}</p>
  </section>
}

export function OverviewOperationsPanels({ leads, leadState, onLeadRetry, operations, loading, onRetry }: {
  leads: { new: number; contacted: number; converted: number; closed: number } | null
  leadState: "loading" | "ready" | "error"
  onLeadRetry: () => void
  operations: OverviewOperationsSummary | null
  loading: boolean
  onRetry: () => void
}) {
  const demos = operations?.demos.data
  const installations = operations?.installations.data
  const total = leads ? leads.new + leads.contacted + leads.converted + leads.closed : 0
  return <div className="mb-10 grid gap-5 xl:grid-cols-3" aria-busy={loading || leadState === "loading"}>
    <Panel title="리드 현황" href="/admin/crm/customers/leads" note="Admin 리드 · 테스트·미확인 제외 · 현재 상태 분포. Compass 데모 건수와 모집단이 다릅니다.">
      {leads ? <>
        <p className="text-[32px] font-bold tracking-[-0.04em] tabular-nums text-[#111110]">{(leads.new + leads.contacted).toLocaleString()}<span className="ml-2 text-xs font-normal tracking-normal text-[#615D59]">진행 중</span></p>
        <div className="mt-5 space-y-3">{[
          { key: "new" as const, label: "신규", color: "#A8741A" },
          { key: "contacted" as const, label: "연락중", color: "#084734" },
          { key: "converted" as const, label: "전환", color: "#615D59" },
          { key: "closed" as const, label: "종료", color: "#A39E98" },
        ].map((item) => <Link key={item.key} href={`/admin/crm/customers/leads?filter=${item.key}`} className="grid grid-cols-[3rem_minmax(0,1fr)_2.5rem] items-center gap-3 text-xs text-[#615D59]">
          <span>{item.label}</span><span className="h-1.5 overflow-hidden rounded-sm bg-[#F6F5F4]"><span style={{ width: `${total ? leads[item.key] / total * 100 : 0}%`, backgroundColor: item.color }} className="block h-full" /></span><span className="text-right font-semibold tabular-nums text-[#111110]">{leads[item.key].toLocaleString()}</span>
        </Link>)}</div>
      </> : leadState === "loading" ? <SectionSkeleton rows={4} /> : <div role="alert" className="py-8 text-sm text-[#615D59]">리드 조회 실패 · 0건이 아닙니다.<div><Retry label="리드" onRetry={onLeadRetry} /></div></div>}
    </Panel>
    <Panel title="데모 현황" href="https://mkt.classin.co.kr/leads" note="Compass 실제 데모 회차 · 예정은 오늘부터 30일 · 완료는 이번 달 done 기록만 집계. 날짜 추정은 별도 표시합니다.">
      {loading && !operations ? <SectionSkeleton rows={3} /> : demos ? <>
        <div className="flex items-end justify-between gap-3"><p className="text-[32px] font-bold tracking-[-0.04em] tabular-nums text-[#111110]">{demos.truncated ? "≥" : ""}{demos.upcomingCount}<span className="ml-2 text-xs font-normal tracking-normal text-[#615D59]">예정 회차</span></p><span className="pb-1 text-xs text-[#615D59]">오늘 {demos.todayCount} · 7일 {demos.next7Count}</span></div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#615D59]"><span>월 완료 {demos.doneThisMonth}</span><span className={demos.unrecordedThisMonth ? TONES.warning : ""}>결과 미기록 {demos.unrecordedThisMonth}</span><span>노쇼 {demos.noShowThisMonth} · 취소 {demos.canceledThisMonth}</span></div>
        <div className={`mt-4 divide-y divide-[rgba(0,0,0,0.08)] border-t ${BORDER}`}>{demos.upcoming.length ? demos.upcoming.map((demo) => <Link key={demo.id} href={demo.leadId != null ? compassLeadUrl(demo.leadId) : "https://mkt.classin.co.kr/leads"} className="flex items-center justify-between gap-3 py-3 hover:bg-[#FAFAF8]">
          <span className="min-w-0"><span className="block text-sm font-semibold text-[#111110]">{demo.leadId != null ? `리드 #${demo.leadId}` : `데모 #${demo.id}`}</span><span className="text-xs text-[#615D59]">{demo.owner || "담당 미지정"}{demo.approximate ? " · 날짜 추정" : ""}</span></span><time className="shrink-0 text-xs tabular-nums text-[#615D59]" dateTime={demo.date}>{demo.date.slice(5).replace("-", "/")}</time>
        </Link>) : <p className="py-6 text-sm text-[#615D59]">{demos.truncated ? "조회된 일부 기록에 예정 데모가 없습니다. 원천에서 전체 기록을 확인하세요." : "30일 내 예약된 데모가 없습니다."}</p>}</div>
        {demos.truncated && <p role="status" className="mt-2 text-xs text-[#A8741A]">조회 상한에 도달해 일부 회차만 표시합니다.</p>}
      </> : <div role="status" className="py-7 text-sm text-[#615D59]">{operations?.demos.status === "forbidden" ? "CRM 읽기 권한이 필요합니다." : "데모 조회 실패 · 0건이 아닙니다."}{operations?.demos.status !== "forbidden" && <div><Retry label="데모" onRetry={onRetry} /></div>}</div>}
    </Panel>
    <Panel title="설치·배송 예정" href="/admin/hardware#hardware-section-planned" note="재고 원본에 남은 미확정 출고 전량 · 건수는 품목 행 기준. 예정일은 원본 기록이며 설치 확정일을 뜻하지 않습니다.">
      {loading && !operations ? <SectionSkeleton rows={3} /> : installations ? <>
        <div className="flex items-end justify-between gap-3"><p className="text-[32px] font-bold tracking-[-0.04em] tabular-nums text-[#111110]">{installations.units.toLocaleString()}<span className="ml-2 text-xs font-normal tracking-normal text-[#615D59]">대 예정</span></p><span className="pb-1 text-xs text-[#615D59]">{installations.count}건 · 7일 {installations.next7Count}건</span></div>
        <p className="mt-3 text-xs text-[#A8741A]">예정일 경과 {installations.overdueCount} · 날짜 미지정 {installations.undatedCount}</p>
        <div className={`mt-4 divide-y divide-[rgba(0,0,0,0.08)] border-t ${BORDER}`}>{installations.upcoming.length ? installations.upcoming.map((row) => <Link key={row.id} href="/admin/hardware#hardware-section-planned" className="flex items-start justify-between gap-3 py-3 hover:bg-[#FAFAF8]">
          <span className="min-w-0"><span className="block truncate text-sm font-semibold text-[#111110]">{row.customer || "도착지 미정"}</span><span className="mt-0.5 block truncate text-xs text-[#615D59]">{row.product} · {row.owner || "담당 미지정"}</span></span><span className="shrink-0 text-right"><span className="block text-sm font-semibold tabular-nums text-[#111110]">{row.quantity}대</span><span className={`text-[11px] ${row.overdue ? TONES.warning : TONES.neutral}`}>{row.date ? `${row.date}${row.overdue ? " · 경과" : ""}` : "날짜 미지정"}</span></span>
        </Link>) : <p className="py-6 text-sm text-[#615D59]">미확정 출고 예정이 없습니다.</p>}</div>
      </> : <div role="status" className="py-7 text-sm text-[#615D59]">설치·배송 조회 실패 · 0건이 아닙니다.<div><Retry label="설치·배송" onRetry={onRetry} /></div></div>}
    </Panel>
  </div>
}

export function OverviewScorecard({ metrics }: { metrics: OverviewMetric[] }) {
  const [onlyIssues, setOnlyIssues] = useState(false)
  const [group, setGroup] = useState("전체")
  const groups = ["전체", ...new Set(metrics.map((metric) => metric.group))]
  const issues = metrics.filter((row) => row.state === "error" || row.tone === "danger" || row.tone === "warning")
  const visible = (onlyIssues ? issues : metrics).filter((row) => group === "전체" || row.group === group)
  return <section aria-labelledby="overview-scorecard-heading" className="mb-10 mt-10">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
      <div><h2 id="overview-scorecard-heading" className="text-xl font-bold tracking-[-0.025em] text-[#111110]">전체 지표</h2><p className="mt-2 text-xs text-[#615D59]">{metrics.length}개 지표 · 주의·조회 실패 {issues.length}개</p></div>
      <label className="inline-flex min-h-11 items-center gap-2 text-xs text-[#615D59]"><input type="checkbox" checked={onlyIssues} onChange={(event) => setOnlyIssues(event.target.checked)} className="h-4 w-4 accent-[#084734]" />주의 항목만 보기</label>
    </div>
    <div role="group" aria-label="전체 지표 영역" className="mb-3 flex flex-wrap gap-x-5 gap-y-1">{groups.map((item) => <button key={item} type="button" aria-pressed={group === item} onClick={() => setGroup(item)} className={`border-b-2 text-xs font-semibold ${group === item ? "border-[#084734] text-[#084734]" : "border-transparent text-[#615D59]"}`}>{item}</button>)}</div>
    <div className={`overflow-hidden rounded-xl border ${BORDER} bg-white`}>
      <div className={`hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_6rem] gap-5 border-b ${BORDER} bg-[#FAFAF8] px-6 py-3 text-[11px] text-[#615D59] lg:grid`}><span>지표 · 범위</span><span>현재</span><span>목표·기준</span><span>실제 추이·진척</span><span>상태</span></div>
      {visible.length ? visible.map((row) => <div key={row.id} aria-busy={row.state === "loading"} className={`border-b ${BORDER} last:border-0`}>
        <Link href={row.href} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 px-5 py-4 hover:bg-[#FAFAF8] lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_6rem] lg:px-6">
          <span className="min-w-0"><span className="block text-[13px] font-semibold text-[#111110]">{row.label}</span><span className="mt-1 block text-[11px] leading-relaxed text-[#615D59]">{row.state === "ready" ? row.note : row.state === "loading" ? "원천을 불러오는 중입니다." : "원천 조회에 실패했습니다. 0건이 아닙니다."}</span></span>
          <span className="text-right text-base font-bold tabular-nums text-[#111110] lg:text-left">{row.state === "ready" ? row.value : row.state === "loading" ? "—" : "확인 필요"}</span>
          <span className="text-xs text-[#615D59]">{row.state === "ready" ? row.reference ?? "별도 목표 없음" : "기준 확인 필요"}</span>
          <span className="min-w-0">{row.state === "ready" && row.trend ? row.trend : row.state === "ready" && row.progress != null ? <span className="flex items-center gap-2"><span className="h-1.5 flex-1 overflow-hidden rounded-sm bg-[#F6F5F4]"><span className="block h-full bg-[#084734]" style={{ width: `${Math.max(0, Math.min(100, row.progress))}%` }} /></span><span className="text-[11px] tabular-nums text-[#615D59]">{Math.round(row.progress)}%</span></span> : <span className="text-xs text-[#A39E98]">—</span>}</span>
          <span className={`col-span-2 text-xs lg:col-span-1 ${TONES[row.state === "error" ? "danger" : row.tone ?? "neutral"]}`}>{row.state === "error" ? "조회 실패" : row.state === "loading" ? "불러오는 중" : row.tone === "warning" || row.tone === "danger" ? "주의" : "확인됨"}</span>
        </Link>
        {row.state === "error" && <div role="alert" className="px-5 pb-2 text-xs text-[#B43E3E]">0이 아니라 조회 실패입니다. <Retry label={row.label} onRetry={row.onRetry} /></div>}
      </div>) : <p className="px-6 py-10 text-sm text-[#615D59]">선택한 조건의 지표가 없습니다.</p>}
    </div>
  </section>
}
