"use client"
import dynamic from "next/dynamic"
import { useState, useCallback } from "react"
import SyncStatusBar from "./SyncStatusBar"
import CoreKpiGrid from "./sections/CoreKpiGrid"
import RegionHeatmap from "./sections/RegionHeatmap"
import TeamPacingSection from "./sections/TeamPacingSection"
import TeamKpiIndexSection from "./sections/TeamKpiIndexSection"
import PipelineTable from "./sections/PipelineTable"
import CampaignsSection from "./sections/CampaignsSection"
import HardwareSection from "./sections/HardwareSection"
import DataQualityPanel from "./sections/DataQualityPanel"
import CrmVariancePanel from "./sections/CrmVariancePanel"
import InsightCard from "./sections/InsightCard"
import DealMixSection from "./sections/DealMixSection"
import { adminFetchJson, clearBranchRequestCache, useBranchJson } from "./client-api"
import { PERIODS, TEAMS, type BranchKpiResponse, type BranchSummaryResponse, type Period, type Team } from "./types"

type BranchTab = "dashboard" | "team" | "insights" | "ops"

const BRANCH_TABS: Array<{ id: BranchTab; label: string }> = [
  { id: "dashboard", label: "대시보드" },
  { id: "team", label: "팀 상세" },
  { id: "insights", label: "AI 인사이트" },
  { id: "ops", label: "운영 점검" },
]

const FiscalRoadmap = dynamic(() => import("./sections/FiscalRoadmap"), {
  loading: () => <div className="h-72 animate-pulse rounded-2xl bg-[#f0f0ec]" />,
})

export default function BranchDashboardClient() {
  const [team, setTeam] = useState<Team>("ALL")
  const [period, setPeriod] = useState<Period>("Q")
  const [activeTab, setActiveTab] = useState<BranchTab>("dashboard")
  const [syncError, setSyncError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const summaryUrl = `/api/admin/branch/summary?team=${team}&period=${period}`
  const kpiUrl = `/api/admin/branch/kpi?team=${team}&period=${period}`
  const summary = useBranchJson<BranchSummaryResponse>(summaryUrl, refreshKey)
  const kpi = useBranchJson<BranchKpiResponse>(kpiUrl, refreshKey)

  const onRefresh = useCallback(async () => {
    setSyncError(null)
    try {
      await adminFetchJson("/api/admin/branch/sync", { method: "POST" })
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e))
    } finally {
      clearBranchRequestCache()
      setRefreshKey((k) => k + 1)
    }
  }, [])

  const lastSync = summary.data?.lastSync ?? null
  const lastError = syncError ?? summary.error ?? summary.data?.lastError ?? null

  return (
    <div className="px-4 pb-24 sm:px-6 lg:px-8">
      <SyncStatusBar lastSync={lastSync} lastError={lastError} onRefresh={onRefresh} />

      <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex overflow-x-auto border-b border-[#e8e8e4]" role="tablist" aria-label="지사 대시보드 보기">
          {BRANCH_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-10 whitespace-nowrap border-b-2 px-4 text-[13px] font-semibold transition ${
                activeTab === tab.id
                  ? "border-[#111110] text-[#111110]"
                  : "border-transparent text-[#1a1a1a]/45 hover:text-[#1a1a1a]/70"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-full border border-[#e8e8e4] bg-white p-1" role="group" aria-label="팀 필터">
            {TEAMS.map((t) => (
              <button key={t} type="button" onClick={() => setTeam(t)}
                aria-pressed={team === t}
                className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${team === t ? "bg-[#111110] text-white" : "text-[#1a1a1a]/60"}`}>
                {t === "ALL" ? "전체" : t}
              </button>
            ))}
          </div>
          <div className="flex gap-1 rounded-full border border-[#e8e8e4] bg-white p-1" role="group" aria-label="기간 필터">
            {PERIODS.map((p) => (
              <button key={p} type="button" onClick={() => setPeriod(p)}
                aria-pressed={period === p}
                className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${period === p ? "bg-[#111110] text-white" : "text-[#1a1a1a]/60"}`}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6">
        {activeTab === "dashboard" && (
          <div role="tabpanel" className="space-y-6">
            <CoreKpiGrid data={summary.data} loading={summary.loading} error={summary.error} />
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
              <FiscalRoadmap data={summary.data?.monthly_series ?? null} loading={summary.loading} error={summary.error} />
              <RegionHeatmap team={team} period={period} refreshKey={refreshKey} />
            </div>
            <DealMixSection period={period} refreshKey={refreshKey} />
            <div className="grid gap-6 xl:grid-cols-[minmax(340px,0.8fr)_minmax(0,1.2fr)]">
              <TeamPacingSection rows={kpi.data?.teams ?? null} loading={kpi.loading} error={kpi.error} />
              <CampaignsSection rows={summary.data?.campaigns_recent ?? null} loading={summary.loading} error={summary.error} />
            </div>
            <PipelineTable key={`dashboard-rev-${team}`} team={team} period={period} refreshKey={refreshKey} />
          </div>
        )}

        {activeTab === "team" && (
          <div role="tabpanel" className="space-y-6">
            <TeamPacingSection rows={kpi.data?.teams ?? null} loading={kpi.loading} error={kpi.error} />
            <TeamKpiIndexSection team={team} />
            <PipelineTable key={`team-rev-${team}`} team={team} period={period} refreshKey={refreshKey} />
          </div>
        )}

        {activeTab === "insights" && (
          <div role="tabpanel" className="space-y-6">
            <InsightCard team={team} refreshKey={refreshKey} />
          </div>
        )}

        {activeTab === "ops" && (
          <div role="tabpanel" className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.7fr)]">
            <HardwareSection refreshKey={refreshKey} />
            <div className="space-y-6">
              <DataQualityPanel refreshKey={refreshKey} />
              <CrmVariancePanel />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
