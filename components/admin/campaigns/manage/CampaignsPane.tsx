"use client"

// components/admin/campaigns/manage/CampaignsPane.tsx
// 캠페인 관리 › 캠페인 탭 — 프로젝트 탭과 같은 갤러리형(1b) 문법: 상태 탭(필터·건수) + 상태별 묶음 +
// 보기 토글(갤러리 카드 / 리스트 행). 프로젝트 필터·이름 검색은 툴바 오른쪽에 둔다.
// 데이터·생성·상세·동기화는 부모(CampaignManageClient)가 들고, 여기는 목록 표시만 맡는다.
// DESIGN.md 팔레트만 사용.

import { useMemo, useState } from "react"

import ShowMore, { useVisibleCount } from "@/components/admin/ui/ShowMore"
import type {
  CampaignStatus,
  CampaignWithLinks,
  ProjectWithRollup,
} from "@/lib/types/marketing-campaign"

import { PROJECT_STATUS_ORDER, ProjectStatusGroupHeading } from "../projects/ProjectCard"
import { CampaignGalleryCard } from "./CampaignGalleryCard"
import { CampaignManageEmpty, CampaignRow } from "./CampaignRow"
import {
  GALLERY_GRID,
  ManageListError,
  ManageListSkeleton,
  ManageToolbar,
  StatusFilterTabs,
  ViewModeToggle,
  useStoredViewMode,
  type StatusFilter,
  type ViewMode,
} from "./manage-ui"

// 묶음마다 처음 보이는 개수 — Meta 동기화가 상위 50 미러를 만들면 한 묶음이 곧 50+가 된다.
const CAMPAIGN_GROUP_STEP = 20

/** 프로젝트 필터 값 — 전체 / 미배정 / 특정 프로젝트 id. */
export type CampaignProjectFilter = "all" | "none" | string

/** 상태 묶음 하나 — 묶음마다 "더보기" 상태를 따로 든다(훅이라 컴포넌트로 분리). */
function CampaignStatusSection({
  status,
  items,
  view,
  today,
  projectNameOf,
  onOpen,
}: {
  status: CampaignStatus
  items: CampaignWithLinks[]
  view: ViewMode
  today: string
  projectNameOf: (projectId: string | null) => string | null
  onOpen: (campaign: CampaignWithLinks) => void
}) {
  const visible = useVisibleCount(items.length, CAMPAIGN_GROUP_STEP)
  const shown = items.slice(0, visible.visible)

  return (
    <section className="pt-5">
      <ProjectStatusGroupHeading status={status} count={items.length} />
      {view === "gallery" ? (
        <div className={GALLERY_GRID}>
          {shown.map((campaign) => (
            <CampaignGalleryCard
              key={campaign.id}
              campaign={campaign}
              projectName={projectNameOf(campaign.projectId)}
              today={today}
              onOpen={() => onOpen(campaign)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {shown.map((campaign) => (
            <CampaignRow
              key={campaign.id}
              campaign={campaign}
              projectName={projectNameOf(campaign.projectId)}
              onOpen={() => onOpen(campaign)}
            />
          ))}
        </div>
      )}
      {(visible.canMore || visible.canCollapse) && (
        <div className="flex justify-center pt-2">
          <ShowMore
            visible={visible.visible}
            total={items.length}
            step={CAMPAIGN_GROUP_STEP}
            onMore={visible.showMore}
            onCollapse={visible.canCollapse ? visible.collapse : undefined}
          />
        </div>
      )}
    </section>
  )
}

export default function CampaignsPane({
  campaigns,
  projects,
  loading,
  error,
  today,
  projectFilter,
  onProjectFilterChange,
  onRetry,
  onCreate,
  onOpen,
}: {
  campaigns: CampaignWithLinks[]
  projects: ProjectWithRollup[] // 소속 표기·프로젝트 필터용(못 읽었으면 빈 배열 — 필터를 숨긴다)
  loading: boolean
  error: string | null
  today: string
  projectFilter: CampaignProjectFilter
  onProjectFilterChange: (next: CampaignProjectFilter) => void
  onRetry: () => void
  onCreate: () => void
  onOpen: (campaign: CampaignWithLinks) => void
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  // 이름 검색(2026-08-18) — Meta 동기화가 상위 50 미러를 만들면 목록이 곧 50+행이 된다.
  const [query, setQuery] = useState("")
  const [view, setView] = useStoredViewMode("admin.campaigns.manage.campaigns.view")

  const projectNames = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects])
  // 목록에 없는 프로젝트 id(다른 탭에서 방금 삭제 등)는 이름을 지어내지 않고 미배정처럼 흐리게 둔다.
  const projectNameOf = (projectId: string | null) =>
    projectId ? (projectNames.get(projectId) ?? null) : null

  // 프로젝트·검색으로 좁힌 집합 — 상태 탭 건수는 이 집합 기준이다(지금 보는 범위의 분포).
  const scoped = useMemo(() => {
    const q = query.trim().toLowerCase()
    return campaigns.filter((c) => {
      if (projectFilter === "none" && c.projectId != null) return false
      if (projectFilter !== "all" && projectFilter !== "none" && c.projectId !== projectFilter) return false
      return q ? c.name.toLowerCase().includes(q) : true
    })
  }, [campaigns, projectFilter, query])

  if (loading && campaigns.length === 0) return <ManageListSkeleton view={view} />
  if (error) {
    return (
      <ManageListError
        title="캠페인 목록을 불러오지 못했습니다"
        message={error}
        hint="마이그레이션(marketing_campaigns)이 아직 적용되지 않았을 수 있습니다."
        onRetry={onRetry}
      />
    )
  }
  if (campaigns.length === 0) {
    return (
      <div className="pt-5">
        <CampaignManageEmpty onCreate={onCreate} />
      </div>
    )
  }

  const countOf = (filter: StatusFilter) =>
    filter === "all" ? scoped.length : scoped.filter((c) => c.status === filter).length

  const groups = PROJECT_STATUS_ORDER.filter(
    (status) => statusFilter === "all" || statusFilter === status,
  )
    .map((status) => ({ status, items: scoped.filter((c) => c.status === status) }))
    .filter((group) => group.items.length > 0)

  const narrowed = query.trim() !== "" || projectFilter !== "all"
  // 선택된 프로젝트가 목록에서 사라졌으면(삭제 등) 셀렉트가 빈칸이 되지 않게 옵션을 하나 남긴다.
  const missingSelected =
    projectFilter !== "all" && projectFilter !== "none" && !projectNames.has(projectFilter)

  return (
    <>
      <ManageToolbar
        tabs={<StatusFilterTabs value={statusFilter} onChange={setStatusFilter} countOf={countOf} />}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {(projects.length > 0 || projectFilter !== "all") && (
            <select
              value={projectFilter}
              onChange={(event) => onProjectFilterChange(event.target.value)}
              aria-label="프로젝트 필터"
              className="h-7 max-w-[11rem] rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-[12px] text-[#111110] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
            >
              <option value="all">모든 프로젝트</option>
              <option value="none">프로젝트 미배정</option>
              {missingSelected && <option value={projectFilter}>(삭제된 프로젝트)</option>}
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          )}
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="캠페인 이름 검색"
            aria-label="캠페인 이름 검색"
            className="h-7 w-40 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2.5 text-[12px] text-[#111110] placeholder:text-[#A39E98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
          />
        </div>
        <ViewModeToggle value={view} onChange={setView} />
      </ManageToolbar>

      {groups.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] py-8 text-center text-[12.5px] text-[#A39E98]">
          <p>{narrowed ? "조건과 일치하는 캠페인이 없습니다." : "이 상태의 캠페인이 없습니다."}</p>
          {narrowed && (
            <button
              type="button"
              onClick={() => {
                setQuery("")
                onProjectFilterChange("all")
              }}
              className="mt-2 text-[12px] font-medium text-[#084734] hover:underline"
            >
              검색·프로젝트 필터 해제
            </button>
          )}
        </div>
      ) : (
        groups.map((group) => (
          <CampaignStatusSection
            key={group.status}
            status={group.status}
            items={group.items}
            view={view}
            today={today}
            projectNameOf={projectNameOf}
            onOpen={onOpen}
          />
        ))
      )}
    </>
  )
}
