"use client"

// components/admin/campaigns/projects/ProjectsClient.tsx
// 마케팅 프로젝트 — 리스트 + 생성 드로어(D3-3). 카드 클릭 → 상세 패널(페이싱 + 롤업 + 멤버 캠페인 + 배정 피커).
// 기본 보기는 갤러리(1b): 상태 탭(전체/진행/일시중지/계획/완료) 필터 + 상태별 묶음 + 페이싱 카드.
// 리스트 보기는 기존 한 줄 카드(ProjectCard)를 그대로 쓴다 — 보기 선택은 브라우저에만 기억한다.
// 편집은 상세 패널이 ProjectFormDrawer 를 재사용하므로 여기선 "새 프로젝트"(생성)만 드로어로 연다.
// 마운트 시 adminFetchJson 으로 목록 조회. 마이그레이션 미적용이면 API 가 500 →
// 크래시/화이트스크린 없이 에러 카드 + 재시도로 그레이스풀 강등(필수).
// DESIGN.md 팔레트만 사용.

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AlertCircle, ArrowLeft, LayoutGrid, List, Plus, RefreshCw } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"
import { formatDotDate, startOfToday } from "@/lib/marketing/project-pacing"
import { useToast } from "@/components/ui/toast"
import {
  CAMPAIGN_STATUS_LABEL,
  type ProjectStatus,
  type ProjectWithRollup,
} from "@/lib/types/marketing-campaign"

import {
  ProjectBudgetCaveat,
  ProjectCard,
  ProjectGalleryCard,
  ProjectsEmpty,
  STATUS_GROUP_ORDER,
  StatusGroupHeading,
} from "./ProjectCard"
import { ProjectFormDrawer } from "./ProjectFormDrawer"
import ProjectDetailPanel from "./ProjectDetailPanel"

type StatusFilter = "all" | ProjectStatus
type ViewMode = "grid" | "list"

const VIEW_STORAGE_KEY = "admin.marketingProjects.view"

function readStoredView(): ViewMode {
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "grid"
  } catch {
    return "grid"
  }
}

export default function ProjectsClient() {
  const toast = useToast()
  const [projects, setProjects] = useState<ProjectWithRollup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  // 상세 패널이 여는 프로젝트(리스트 요약). null = 닫힘. onClose 는 memoized(상세의 load deps 안정).
  const [detail, setDetail] = useState<ProjectWithRollup | null>(null)
  const closeDetail = useCallback(() => setDetail(null), [])
  const [filter, setFilter] = useState<StatusFilter>("all")
  const [view, setView] = useState<ViewMode>("grid")
  // 페이싱 기준일 — 렌더마다 new Date() 하지 않도록 목록을 불러올 때 한 번 정한다.
  const [today, setToday] = useState(() => startOfToday())

  useEffect(() => {
    setView(readStoredView())
  }, [])

  const changeView = useCallback((next: ViewMode) => {
    setView(next)
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next)
    } catch {
      // 사생활 보호 모드 등 — 기억만 못 할 뿐 보기 전환은 동작한다.
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setToday(startOfToday())
    try {
      const data = await adminFetchJson<{ projects: ProjectWithRollup[] }>(
        "/api/admin/marketing-projects",
      )
      setProjects(data.projects ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "프로젝트 목록을 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // 탭 개수는 필터와 무관하게 전체 기준. 그룹은 진행 → 일시중지 → 계획 → 완료 순서.
  const counts = useMemo(() => {
    const byStatus = { planned: 0, active: 0, paused: 0, done: 0 } as Record<ProjectStatus, number>
    for (const p of projects) byStatus[p.status] += 1
    return byStatus
  }, [projects])
  const groups = useMemo(
    () =>
      STATUS_GROUP_ORDER.filter((status) => filter === "all" || filter === status)
        .map((status) => ({ status, items: projects.filter((p) => p.status === status) }))
        .filter((g) => g.items.length > 0),
    [projects, filter],
  )
  const tabs: { id: StatusFilter; label: string; count: number }[] = [
    { id: "all", label: "전체", count: projects.length },
    ...STATUS_GROUP_ORDER.map((status) => ({
      id: status,
      label: CAMPAIGN_STATUS_LABEL[status],
      count: counts[status],
    })),
  ]

  const handleCreateSuccess = useCallback(
    async (message: string) => {
      setCreating(false)
      await load()
      toast.success(message)
    },
    [load, toast],
  )

  return (
    <div className="pb-24">
      {/* 헤더 — 캠페인 관리와 동일한 TopBar 패턴 */}
      <header className="border-b border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 pb-5 pt-6 sm:px-6 lg:px-9 lg:pt-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#615D59]">
              <span>ADMIN</span>
              <span className="opacity-50">›</span>
              <span>그로스</span>
              <span className="opacity-50">›</span>
              <span>캠페인</span>
              <span className="opacity-50">›</span>
              <span className="text-[#111110]">프로젝트</span>
            </div>
            <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-[-0.02em] text-[#111110] sm:text-[30px]">
              마케팅 프로젝트
            </h1>
            <p className="mt-1.5 text-[13px] text-[#615D59]">
              여러 캠페인을 하나의 프로젝트로 묶어 예산 소진과 실행을 한눈에 봅니다.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              새로고침
            </button>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#084734] px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#065c41]"
            >
              <Plus className="h-3.5 w-3.5" />
              새 프로젝트
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link
            href="/admin/campaigns"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#615D59] transition-colors hover:text-[#111110]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            캠페인 허브로
          </Link>
          <Link
            href="/admin/campaigns/manage"
            className="text-[12px] font-medium text-[#615D59] transition-colors hover:text-[#111110]"
          >
            캠페인 관리 →
          </Link>
        </div>
      </header>

      {/* 본문 */}
      <div className="px-4 pt-5 sm:px-6 lg:px-9">
        {loading ? (
          <div
            className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,360px),1fr))] gap-3 pt-5"
            aria-busy="true"
          >
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[188px] animate-pulse rounded-xl border border-[rgba(0,0,0,0.08)] bg-[#f0f0ec]" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-[#F2B8B8] bg-[#FCE9E9] px-5 py-6">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#B43E3E]" />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[#8F2C2C]">프로젝트 목록을 불러오지 못했습니다</p>
                <p className="mt-1 break-words text-[12px] text-[#B43E3E]">{error}</p>
                <p className="mt-1.5 text-[11px] text-[#B43E3E]/80">
                  마이그레이션(marketing_projects)이 아직 적용되지 않았을 수 있습니다.
                </p>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[#F2B8B8] bg-white px-3 py-1.5 text-[12px] font-bold text-[#B43E3E] transition hover:bg-[#FCE9E9]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  다시 시도
                </button>
              </div>
            </div>
          </div>
        ) : projects.length === 0 ? (
          <ProjectsEmpty onCreate={() => setCreating(true)} />
        ) : (
          <>
            {/* 툴바 — 상태 탭(필터) | 정직 캐비앗(섹션당 1회) · 보기 전환 */}
            <div className="mb-2 flex flex-col-reverse gap-2 border-b border-[rgba(0,0,0,0.08)] lg:flex-row lg:items-end lg:justify-between lg:gap-4">
              <div role="tablist" aria-label="프로젝트 상태" className="-mb-px flex gap-5 overflow-x-auto">
                {tabs.map((tab) => {
                  const active = filter === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setFilter(tab.id)}
                      className={`flex shrink-0 items-baseline gap-1.5 border-b-2 pb-2.5 text-[13px] transition-colors hover:text-[#111110] ${
                        active
                          ? "border-[#111110] font-bold text-[#111110]"
                          : "border-transparent font-medium text-[#615D59]"
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span className="text-[11.5px] font-medium tabular-nums text-[#A39E98]">
                        {tab.count}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center justify-between gap-3.5 lg:justify-end lg:pb-2">
                <ProjectBudgetCaveat todayLabel={formatDotDate(today)} />
                <div
                  role="group"
                  aria-label="보기 방식"
                  className="flex shrink-0 rounded-md border border-[rgba(0,0,0,0.08)] bg-white p-0.5"
                >
                  {(
                    [
                      { id: "list", label: "리스트 보기", Icon: List },
                      { id: "grid", label: "갤러리 보기", Icon: LayoutGrid },
                    ] as const
                  ).map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => changeView(id)}
                      aria-pressed={view === id}
                      aria-label={label}
                      title={label}
                      className={`flex rounded px-1.5 py-1 transition-colors ${
                        view === id
                          ? "bg-[#F6F5F4] text-[#111110]"
                          : "text-[#A39E98] hover:text-[#111110]"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {groups.length === 0 ? (
              <p className="mt-5 rounded-xl border border-dashed border-[rgba(0,0,0,0.08)] bg-[#fafaf8] px-4 py-8 text-center text-[12px] text-[#615D59]">
                {filter === "all"
                  ? "프로젝트가 없습니다."
                  : `${CAMPAIGN_STATUS_LABEL[filter]} 상태인 프로젝트가 없습니다.`}
              </p>
            ) : (
              groups.map((group) => (
                <section key={group.status} className="pt-5">
                  <StatusGroupHeading status={group.status} count={group.items.length} />
                  {view === "grid" ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,360px),1fr))] gap-3">
                      {group.items.map((project) => (
                        <ProjectGalleryCard
                          key={project.id}
                          project={project}
                          today={today}
                          onOpen={() => setDetail(project)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {group.items.map((project) => (
                        <ProjectCard
                          key={project.id}
                          project={project}
                          onOpen={() => setDetail(project)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              ))
            )}
          </>
        )}
      </div>

      {/* 생성 드로어 — "새 프로젝트" 전용(편집은 상세 패널이 담당). */}
      {creating && (
        <ProjectFormDrawer
          initial={null}
          onClose={() => setCreating(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {/* 상세 패널 — 행 클릭 시. 롤업 + 멤버 캠페인 + 배정 피커 + 편집(폼 드로어 재사용). */}
      {detail && (
        <ProjectDetailPanel project={detail} onClose={closeDetail} onListChanged={load} />
      )}
    </div>
  )
}
