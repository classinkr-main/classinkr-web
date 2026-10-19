"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import CrmAnalysisNavigation from "../insights/CrmAnalysisNavigation"
import CrmRegionMapPanel from "./CrmRegionMapPanel"

const CrmRegionAssignmentPanel = dynamic(() => import("./CrmRegionAssignmentPanel"))
const CrmNaverMapSourceClient = dynamic(() => import("../CrmNaverMapSourceClient"))
const VIEWS = [{ key: "distribution", label: "지역 분포·비교" }, { key: "assignment", label: "담당 배정" }, { key: "source", label: "지도 원천 검수" }] as const
type View = typeof VIEWS[number]["key"]
function resolveView(value: string | null): View { return value === "assignment" || value === "source" ? value : "distribution" }

export default function CrmRegionWorkspace() {
  const params = useSearchParams()
  const viewParam = params.get("view")
  const [view, setView] = useState<View>(() => resolveView(viewParam))
  const [visited, setVisited] = useState<View[]>(() => [resolveView(viewParam)])
  const [previousParam, setPreviousParam] = useState(viewParam)
  if (previousParam !== viewParam) {
    const next = resolveView(viewParam)
    setPreviousParam(viewParam)
    setView(next)
    setVisited(current => current.includes(next) ? current : [...current, next])
  }
  const select = (next: View) => {
    setView(next)
    setVisited(current => current.includes(next) ? current : [...current, next])
    const query = new URLSearchParams(window.location.search)
    if (next === "distribution") query.delete("view")
    else query.set("view", next)
    window.history.replaceState(null, "", `${window.location.pathname}${query.size ? `?${query}` : ""}`)
  }
  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">지역 분석</h1>
      <p className="mb-4 mt-1 text-[13px] text-[#615D59]">지역별 영업 현황을 비교하고, 담당 배정과 원천 검수를 이어갑니다.</p>
      <CrmAnalysisNavigation active="region" />
      <div role="tablist" aria-label="지역 분석 작업" className="mb-5 flex flex-wrap gap-2">
        {VIEWS.map(item => <button id={`region-tab-${item.key}`} key={item.key} type="button" role="tab" aria-selected={view === item.key} aria-controls={`region-panel-${item.key}`} onClick={() => select(item.key)} className={`min-h-11 rounded-md border px-3 text-[13px] font-semibold ${view === item.key ? "border-[#084734] text-[#084734]" : "border-[#e8e8e4] bg-white text-[#615D59]"}`}>{item.label}</button>)}
      </div>
      {VIEWS.filter(item => visited.includes(item.key)).map(item => (
        <div key={item.key} id={`region-panel-${item.key}`} role="tabpanel" aria-labelledby={`region-tab-${item.key}`} hidden={view !== item.key}>
          {item.key === "distribution" ? <CrmRegionMapPanel /> : item.key === "assignment" ? <CrmRegionAssignmentPanel /> : <CrmNaverMapSourceClient />}
        </div>
      ))}
    </div>
  )
}
