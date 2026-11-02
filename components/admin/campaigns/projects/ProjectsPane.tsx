"use client"

// components/admin/campaigns/projects/ProjectsPane.tsx
// 캠페인 관리 › 프로젝트 탭 — 갤러리형(1b): 상태 탭(필터) + 상태별 묶음 + 기간 경과 대비 예산 소진(페이싱).
// 카드 클릭 → 상세 패널(부모 CampaignManageClient 가 연다). 보기 토글로 리스트(행 카드) 전환.
// 데이터·생성·상세는 부모가 들고(캠페인 탭과 상세를 오가야 해서), 여기는 목록 표시만 맡는다.
// (2026-10 통합 전에는 /admin/campaigns/projects 의 ProjectsClient 였다 — 그 주소는 이 탭으로 넘긴다.)
// DESIGN.md 팔레트만 사용.

import { useState } from "react"

import type { ProjectWithRollup } from "@/lib/types/marketing-campaign"

import {
  GALLERY_GRID,
  ManageListError,
  ManageListSkeleton,
  ManageToolbar,
  StatusFilterTabs,
  ViewModeToggle,
  useStoredViewMode,
  type StatusFilter,
} from "../manage/manage-ui"
import {
  PROJECT_STATUS_ORDER,
  ProjectBudgetCaveat,
  ProjectCard,
  ProjectGalleryCard,
  ProjectStatusGroupHeading,
  ProjectsEmpty,
} from "./ProjectCard"

export default function ProjectsPane({
  projects,
  loading,
  error,
  today,
  onRetry,
  onCreate,
  onOpen,
}: {
  projects: ProjectWithRollup[]
  loading: boolean
  error: string | null
  today: string // 페이싱 기준일(KST YYYY-MM-DD) — 목록을 읽은 날로 고정(부모가 내려준다).
  onRetry: () => void
  onCreate: () => void
  onOpen: (project: ProjectWithRollup) => void
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [view, setView] = useStoredViewMode("admin.campaigns.manage.projects.view")

  if (loading && projects.length === 0) return <ManageListSkeleton view={view} />
  if (error) {
    return (
      <ManageListError
        title="프로젝트 목록을 불러오지 못했습니다"
        message={error}
        hint="마이그레이션(marketing_projects)이 아직 적용되지 않았을 수 있습니다."
        onRetry={onRetry}
      />
    )
  }
  if (projects.length === 0) {
    return (
      <div className="pt-5">
        <ProjectsEmpty onCreate={onCreate} />
      </div>
    )
  }

  const countOf = (filter: StatusFilter) =>
    filter === "all" ? projects.length : projects.filter((p) => p.status === filter).length

  // 상태별 묶음 — 묶음 안은 API 순서(최근 생성순)를 그대로 둔다. 빈 묶음은 그리지 않는다.
  const groups = PROJECT_STATUS_ORDER.filter(
    (status) => statusFilter === "all" || statusFilter === status,
  )
    .map((status) => ({ status, items: projects.filter((p) => p.status === status) }))
    .filter((group) => group.items.length > 0)

  return (
    <>
      <ManageToolbar
        tabs={<StatusFilterTabs value={statusFilter} onChange={setStatusFilter} countOf={countOf} />}
      >
        <ProjectBudgetCaveat today={today} />
        <ViewModeToggle value={view} onChange={setView} />
      </ManageToolbar>

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
                    onOpen={() => onOpen(project)}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                {group.items.map((project) => (
                  <ProjectCard key={project.id} project={project} onOpen={() => onOpen(project)} />
                ))}
              </div>
            )}
          </section>
        ))
      )}
    </>
  )
}
