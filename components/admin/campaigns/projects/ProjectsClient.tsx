"use client"

// components/admin/campaigns/projects/ProjectsClient.tsx
// 마케팅 프로젝트 — 갤러리형(1b): 상태 탭(필터) + 상태별 묶음 + 기간 경과 대비 예산 소진(페이싱).
// 카드 클릭 → 상세 패널(페이싱 + 롤업 + 멤버 캠페인 + 배정 피커). 보기 토글로 리스트(행 카드) 전환.
// 편집은 상세 패널이 ProjectFormDrawer 를 재사용하므로 여기선 "새 프로젝트"(생성)만 드로어로 연다.
// 마운트 시 adminFetchJson 으로 목록 조회. 마이그레이션 미적용이면 API 가 500 →
// 크래시/화이트스크린 없이 에러 카드 + 재시도로 그레이스풀 강등(필수).
// DESIGN.md 팔레트만 사용.

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, ArrowLeft, LayoutGrid, List, Plus, RefreshCw } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"
import { getBusinessDateParts } from "@/lib/business-time"
import { useToast } from "@/components/ui/toast"
import {
  CAMPAIGN_STATUS_LABEL,
  type ProjectStatus,
  type ProjectWithRollup,
} from "@/lib/types/marketing-campaign"

import {
  PROJECT_STATUS_ORDER,
  ProjectBudgetCaveat,
  ProjectCard,
  ProjectGalleryCard,
  ProjectStatusGroupHeading,
  ProjectsEmpty,
} from "./ProjectCard"
import { ProjectFormDrawer } from "./ProjectFormDrawer"
import ProjectDetailPanel from "./ProjectDetailPanel"

type StatusFilter = ProjectStatus | "all"
type ViewMode = "gallery" | "list"

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "전체" },
  ...PROJECT_STATUS_ORDER.map((status) => ({ id: status, label: CAMPAIGN_STATUS_LABEL[status] })),
]

const VIEW_OPTIONS: { id: ViewMode; label: string; Icon: typeof List }[] = [
  { id: "list", label: "리스트 보기", Icon: List },
  { id: "gallery", label: "갤러리 보기", Icon: LayoutGrid },
]

// 카드 최소 폭 360px — 좁은 화면에선 100% 로 줄어 가로 스크롤이 생기지 않는다.
const GALLERY_GRID = "grid grid-cols-[repeat(auto-fill,minmax(min(360px,100%),1fr))] gap-3"

export default function ProjectsClient() {
  const toast = useToast()
  const [projects, setProjects] = useState<ProjectWithRollup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [view, setView] = useState<ViewMode>("gallery")
  // 페이싱 기준일(KST YYYY-MM-DD) — 목록을 읽은 날로 고정해 한 화면의 경과율이 서로 어긋나지 않게 한다.
  const [today, setToday] = useState("")
  // 상세 패널이 여는 프로젝트(리스트 요약). null = 닫힘. onClose 는 memoized(상세의 load deps 안정).
  const [detail, setDetail] = useState<ProjectWithRollup | null>(null)
  const closeDetail = useCallback(() => setDetail(null), [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminFetchJson<{ projects: ProjectWithRollup[] }>(
        "/api/admin/marketing-projects",
      )
      setProjects(data.projects ?? [])
      setToday(getBusinessDateParts().date)
    } catch (e) {
      setError(e instanceof Error ? e.message : "프로젝트 목록을 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleCreateSuccess = useCallback(
    async (message: string) => {
      setCreating(false)
      await load()
      toast.success(message)
    },
    [load, toast],
  )

  const countOf = (filter: StatusFilter) =>
    filter === "all" ? projects.length : projects.filter((p) => p.status === filter).length

  // 상태별 묶음 — 묶음 안은 API 순서(최근 생성순)를 그대로 둔다. 빈 묶음은 그리지 않는다.
  const groups = PROJECT_STATUS_ORDER.filter(
    (status) => statusFilter === "all" || statusFilter === status,
  )
    .map((status) => ({ status, items: projects.filter((p) => p.status === status) }))
    .filter((group) => group.items.length > 0)

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
        {loading && projects.length === 0 ? (
          <div className="pt-5" aria-busy="true">
            <div className="mb-2.5 h-4 w-20 animate-pulse rounded bg-[#f0f0ec]" />
            <div className={view === "gallery" ? GALLERY_GRID : "space-y-1.5"}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`animate-pulse rounded-xl border border-[rgba(0,0,0,0.08)] bg-[#f0f0ec] ${
                    view === "gallery" ? "h-48" : "h-[76px]"
                  }`}
                />
              ))}
            </div>
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
            {/* 툴바 — 상태 탭(밑줄 = 선택) | 정직 캐비앗 + 보기 토글.
                기준선은 inset 섀도라 탭의 2px 밑줄이 그 위를 덮는다. 좁은 화면에선 탭 줄만
                기준선을 갖고(가로 스크롤), 캐비앗·토글은 그 아래 줄로 내려간다. */}
            <div className="mb-2 leading-tight lg:flex lg:items-end lg:justify-between lg:gap-4 lg:shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)]">
              <div
                role="group"
                aria-label="상태 필터"
                className="flex gap-5 overflow-x-auto shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)] lg:shadow-none"
              >
                {STATUS_TABS.map((tab) => {
                  const active = statusFilter === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setStatusFilter(tab.id)}
                      aria-pressed={active}
                      className={`flex shrink-0 items-baseline gap-[5px] border-b-2 pb-2.5 text-[13px] transition-colors hover:text-[#111110] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734] ${
                        active
                          ? "border-[#111110] font-bold text-[#111110]"
                          : "border-transparent font-medium text-[#615D59]"
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span className="text-[11.5px] tabular-nums text-[#A39E98]">
                        {countOf(tab.id)}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center justify-between gap-3.5 pt-2.5 lg:justify-end lg:pb-2 lg:pt-0">
                <ProjectBudgetCaveat today={today} />
                <div
                  role="group"
                  aria-label="보기 방식"
                  className="flex shrink-0 rounded-md border border-[rgba(0,0,0,0.08)] bg-white p-0.5"
                >
                  {VIEW_OPTIONS.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setView(id)}
                      aria-pressed={view === id}
                      aria-label={label}
                      title={label}
                      className={`flex rounded px-1.5 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] ${
                        view === id
                          ? "bg-[#F6F5F4] text-[#111110]"
                          : "text-[#A39E98] hover:text-[#615D59]"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {groups.length === 0 ? (
              <p className="mt-5 rounded-xl border border-dashed border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] py-8 text-center text-[12.5px] text-[#A39E98]">
                이 상태의 프로젝트가 없습니다.
              </p>
            ) : (
              groups.map((group) => (
                <section key={group.status} className="pt-5">
                  <ProjectStatusGroupHeading status={group.status} count={group.items.length} />
                  {view === "gallery" ? (
                    <div className={GALLERY_GRID}>
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

      {/* 상세 패널 — 카드 클릭 시. 페이싱 + 롤업 + 멤버 캠페인 + 배정 피커 + 편집(폼 드로어 재사용). */}
      {detail && (
        <ProjectDetailPanel
          project={detail}
          today={today}
          onClose={closeDetail}
          onListChanged={load}
        />
      )}
    </div>
  )
}
