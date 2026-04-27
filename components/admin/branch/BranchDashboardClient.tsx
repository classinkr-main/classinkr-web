"use client"
import { useEffect, useState, useCallback } from "react"
import SyncStatusBar from "./SyncStatusBar"
import CoreKpiGrid from "./sections/CoreKpiGrid"
import RegionHeatmap from "./sections/RegionHeatmap"
import FiscalRoadmap from "./sections/FiscalRoadmap"
import TeamPacingSection from "./sections/TeamPacingSection"
import ManagerScorecard from "./sections/ManagerScorecard"
import KpiActivityMatrix from "./sections/KpiActivityMatrix"
import PipelineTable from "./sections/PipelineTable"
import CampaignsSection from "./sections/CampaignsSection"
import HardwareSection from "./sections/HardwareSection"
import DataQualityPanel from "./sections/DataQualityPanel"

export type Team = "ALL" | "BD" | "MKT" | "CSM"
export type Period = "M" | "Q" | "Y"
const TEAMS: Team[] = ["ALL", "BD", "MKT", "CSM"]
const PERIODS: Period[] = ["M", "Q", "Y"]

function getToken(): string {
  return typeof window !== "undefined" ? sessionStorage.getItem("admin_password") ?? "" : ""
}
async function adminFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json", ...init?.headers } })
}

export default function BranchDashboardClient() {
  const [team, setTeam] = useState<Team>("ALL")
  const [period, setPeriod] = useState<Period>("Q")
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refreshSummary = useCallback(async () => {
    try {
      const res = await adminFetch(`/api/admin/branch/summary?team=${team}&period=${period}`)
      if (!res.ok) { setLastError(`Summary ${res.status}`); return }
      const data = await res.json()
      setLastSync(data.lastSync ?? null)
      setLastError(data.lastError ?? null)
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e))
    }
  }, [team, period])

  useEffect(() => { refreshSummary() }, [refreshSummary, refreshKey])

  const onRefresh = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/branch/sync", { method: "POST" })
      if (!res.ok) setLastError(`동기화 실패: ${res.status}`)
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e))
    }
    setRefreshKey((k) => k + 1)
  }, [])

  return (
    <div className="px-4 pb-24 sm:px-6 lg:px-8">
      <SyncStatusBar lastSync={lastSync} lastError={lastError} onRefresh={onRefresh} />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full border border-[#e8e8e4] bg-white p-1">
          {TEAMS.map((t) => (
            <button key={t} type="button" onClick={() => setTeam(t)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${team === t ? "bg-[#111110] text-white" : "text-[#1a1a1a]/60"}`}>
              {t === "ALL" ? "전체" : t}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-full border border-[#e8e8e4] bg-white p-1">
          {PERIODS.map((p) => (
            <button key={p} type="button" onClick={() => setPeriod(p)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${period === p ? "bg-[#111110] text-white" : "text-[#1a1a1a]/60"}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 space-y-10">
        <CoreKpiGrid team={team} period={period} refreshKey={refreshKey} />
        <RegionHeatmap team={team} period={period} refreshKey={refreshKey} />
        <FiscalRoadmap team={team} period={period} refreshKey={refreshKey} />
        <TeamPacingSection team={team} period={period} refreshKey={refreshKey} />
        <ManagerScorecard team={team} period={period} refreshKey={refreshKey} />
        <KpiActivityMatrix team={team} period={period} refreshKey={refreshKey} />
        <PipelineTable team={team} period={period} refreshKey={refreshKey} />
        <CampaignsSection refreshKey={refreshKey} />
        <HardwareSection refreshKey={refreshKey} />
        <DataQualityPanel refreshKey={refreshKey} />
      </div>
    </div>
  )
}
