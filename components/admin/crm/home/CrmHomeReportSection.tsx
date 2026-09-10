"use client"

// CRM 홈 — 리포트 · 분석 아코디언(참조 블록 단일화). app/admin/crm/page.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import { type KeyboardEvent as ReactKeyboardEvent } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { BarChart3, ChevronDown, ExternalLink } from "lucide-react"
import CrmOperationsDashboard from "./CrmOperationsDashboard"
import CrmTeamKpiBoard, { ActivityGoalGauge, CrmRankingBoard } from "./CrmTeamKpiBoard"
import type { AdminCrmOverview, BranchKpiResponse, LeadActionKpis } from "./shared"

// Recharts 번들을 현황 초기 로드에서 분리 — 차트는 지연 로드.
const CrmHomeCharts = dynamic(() => import("@/components/admin/crm/CrmHomeCharts"), {
  ssr: false,
  // 참조 섹션이 베이지(#fafaf8)로 가라앉아(W2-6) 스켈레톤은 한 단 진한 뉴트럴로 유지.
  loading: () => <div className="h-40 animate-pulse rounded-xl bg-[#f0f0ec]" />,
})
const CrmPerformanceCharts = dynamic(() => import("@/components/admin/crm/CrmPerformanceCharts"), {
  ssr: false,
  loading: () => <div className="h-44 animate-pulse rounded-xl bg-[#f0f0ec]" />,
})
// 팀 성과 패널(보고성 블록, 기본 접힘) 코드 스플리팅(감사 #6) — teamReportOpen일 때만
// 렌더되는 기존 게이트는 그대로 두고, 청크도 접힘을 펼치는 시점에만 내려받는다.
// 폴백은 펼친 섹션 안에서만 잠깐 보이는 골격 스켈레톤(닫힌 첫 화면 노출 없음).
const NeoCrmTeamPanel = dynamic(() => import("@/components/admin/crm/NeoCrmTeamPanel"), {
  // 실제 패널은 다중 섹션(수백 px) — 폴백이 낮으면 교체 순간 하단 콘텐츠가 크게 밀린다(코덱스 리뷰 P2).
  loading: () => <div className="h-96 animate-pulse rounded-xl bg-[#f0f0ec]" />,
})

// ─── 리포트 · 분석 (참조 블록 단일화) ──────────────────────────
// 매출 상세 / 성과 분석 / 리드 분석 / 팀 KPI / 수납·로그가 각각 최상위 섹션으로 쌓여
// 아침 화면 아래쪽이 다섯 덩어리였다. 전부 "보고서를 볼 때 여는" 참조 표면이라 한 아코디언
// 안의 탭으로 접는다. 기본 접힘 + 선택한 탭만 렌더 — Recharts 청크(성과·리드)가 첫 페인트에서
// 아예 빠지고, 작업대(우선순위 큐)가 화면의 주인공으로 남는다.
export type CrmReportTab = "revenue" | "performance" | "leads" | "team" | "ops"

const CRM_REPORT_TABS: Array<{ key: CrmReportTab; label: string; hint: string }> = [
  { key: "revenue", label: "매출 상세", hint: "견적 · 계약 · 수금 분해 · 통화별" },
  { key: "performance", label: "성과 분석", hint: "CRM 매출(¥, REV 동기화) 기준 · 최근 6개월" },
  { key: "leads", label: "리드 분석", hint: "리드 KPI 기반 시각화" },
  { key: "team", label: "팀 KPI", hint: "총 · 팀별 · 개인별 · NEO 팀 현황" },
  { key: "ops", label: "수납 · 로그", hint: "미수 리스크 · 최근 고객별 로그" },
]

export default function CrmHomeReportSection({
  open,
  onToggle,
  tab,
  onTabChange,
  overview,
  loading,
  error,
  branchKpis,
  branchError,
  leadKpis,
  refreshing,
  neoCrmRefreshKey,
  branchKpiMonth,
}: {
  open: boolean
  onToggle: () => void
  tab: CrmReportTab
  onTabChange: (tab: CrmReportTab) => void
  overview: AdminCrmOverview | null
  loading: boolean
  error: string | null
  branchKpis: BranchKpiResponse | null
  branchError: string | null
  leadKpis: LeadActionKpis | null
  refreshing: boolean
  neoCrmRefreshKey: number
  branchKpiMonth: string
}) {
  const activeTab = CRM_REPORT_TABS.find((item) => item.key === tab) ?? CRM_REPORT_TABS[0]

  // 화살표로 탭 사이를 옮기고 Home/End로 양 끝으로 — 탭 위젯의 표준 키보드 계약.
  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const index = CRM_REPORT_TABS.findIndex((item) => item.key === tab)
    let nextIndex: number | null = null
    if (event.key === "ArrowRight") nextIndex = (index + 1) % CRM_REPORT_TABS.length
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + CRM_REPORT_TABS.length) % CRM_REPORT_TABS.length
    else if (event.key === "Home") nextIndex = 0
    else if (event.key === "End") nextIndex = CRM_REPORT_TABS.length - 1
    if (nextIndex == null) return
    event.preventDefault()
    const nextTab = CRM_REPORT_TABS[nextIndex]
    onTabChange(nextTab.key)
    document.getElementById(`crm-report-tab-${nextTab.key}`)?.focus()
  }

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        // 참조(보고) 표면 — 행동 표면과의 톤차 위계(W2-6): 베이지로 가라앉힌다
        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-3 transition-colors hover:bg-white"
      >
        <span className="flex min-w-0 items-center gap-2">
          <BarChart3 className="h-4 w-4 shrink-0 text-[#1a1a1a]/40" />
          <span className="shrink-0 text-[14px] font-bold text-[#111110]">리포트 · 분석</span>
          <span className="hidden truncate text-[11px] text-[#1a1a1a]/35 sm:inline">
            {CRM_REPORT_TABS.map((item) => item.label).join(" · ")}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#1a1a1a]/35 transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>

      {open ? (
        <div className="mt-3">
          <div className="mb-3 flex flex-wrap items-center gap-1.5" role="tablist" aria-label="리포트 · 분석">
            {CRM_REPORT_TABS.map((item) => {
              const active = item.key === tab
              return (
                <button
                  key={item.key}
                  id={`crm-report-tab-${item.key}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`crm-report-panel-${item.key}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => onTabChange(item.key)}
                  onKeyDown={handleTabKeyDown}
                  className={`inline-flex h-[30px] items-center rounded-full px-3 text-[12px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734] ${
                    active
                      ? "bg-[#111110] text-white"
                      : "border border-[#e8e8e4] bg-white text-[#111110] hover:border-[#c8c8c4]"
                  }`}
                >
                  {item.label}
                </button>
              )
            })}
            <span className="ml-auto hidden text-[11px] text-[#1a1a1a]/35 sm:inline">{activeTab.hint}</span>
          </div>

          <div
            id={`crm-report-panel-${tab}`}
            role="tabpanel"
            aria-labelledby={`crm-report-tab-${tab}`}
            tabIndex={-1}
          >
          {tab === "revenue" ? (
            <CrmOperationsDashboard part="revenue" overview={overview} loading={loading} error={error} />
          ) : null}

          {tab === "performance" ? (
            <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-bold text-[#111110]">성과 분석 · 팀/개인</h2>
                  <p className="text-[11px] text-[#1a1a1a]/35">CRM 매출(¥, REV 동기화) 기준 · 최근 6개월</p>
                </div>
                <ActivityGoalGauge branchKpis={branchKpis} />
              </div>
              <CrmPerformanceCharts />
            </section>
          ) : null}

          {tab === "leads" ? (
            <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-[15px] font-bold text-[#111110]">리드 분석</h2>
                <Link
                  href="/admin/crm/customers/leads"
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#1a1a1a]/45 transition-colors hover:text-[#111110]"
                >
                  리드 보드
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              {leadKpis && leadKpis.total > 0 ? (
                <CrmHomeCharts leadKpis={leadKpis} />
              ) : (
                <p className="rounded-xl bg-white px-3 py-8 text-center text-[13px] text-[#1a1a1a]/30">
                  집계할 리드가 아직 없습니다.
                </p>
              )}
            </section>
          ) : null}

          {tab === "team" ? (
            <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
              <NeoCrmTeamPanel refreshKey={neoCrmRefreshKey} />
              <CrmTeamKpiBoard
                overview={overview}
                branchKpis={branchKpis}
                loading={refreshing}
                branchError={branchError}
                month={branchKpiMonth}
              />
              <CrmRankingBoard branchKpis={branchKpis} />
            </section>
          ) : null}

          {tab === "ops" ? (
            <CrmOperationsDashboard part="risk" overview={overview} loading={loading} error={error} />
          ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
