"use client"

// components/admin/campaigns/projects/ProjectsClient.tsx
// 마케팅 프로젝트 — 리스트 + 생성 드로어(D3-3). 행 클릭 → 상세 패널(롤업 + 멤버 캠페인 + 배정 피커).
// 편집은 상세 패널이 ProjectFormDrawer 를 재사용하므로 여기선 "새 프로젝트"(생성)만 드로어로 연다.
// 마운트 시 adminFetchJson 으로 목록 조회. 마이그레이션 미적용이면 API 가 500 →
// 크래시/화이트스크린 없이 에러 카드 + 재시도로 그레이스풀 강등(필수).
// DESIGN.md 팔레트만 사용.

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, ArrowLeft, Plus, RefreshCw } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"
import { useToast } from "@/components/ui/toast"
import type { ProjectWithRollup } from "@/lib/types/marketing-campaign"

import { ProjectBudgetCaveat, ProjectCard, ProjectsEmpty } from "./ProjectCard"
import { ProjectFormDrawer } from "./ProjectFormDrawer"
import ProjectDetailPanel from "./ProjectDetailPanel"

export default function ProjectsClient() {
  const toast = useToast()
  const [projects, setProjects] = useState<ProjectWithRollup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
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
      <div className="px-4 pt-6 sm:px-6 lg:px-9">
        {loading ? (
          <div className="space-y-1.5" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[76px] animate-pulse rounded-xl border border-[rgba(0,0,0,0.08)] bg-[#f0f0ec]" />
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
          <div className="space-y-1.5">
            {/* 정직 캐비앗은 여기서 한 번만 — 카드마다 반복하면 벽지가 된다.
                우측 정렬이라 카드의 "소진" 열 바로 위에 붙어 열 주석처럼 읽힌다. */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pb-0.5">
              <p className="text-[12px] text-[#615D59]">
                프로젝트 <span className="font-semibold tabular-nums text-[#111110]">{projects.length}</span>개
              </p>
              <ProjectBudgetCaveat />
            </div>
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={() => setDetail(project)}
              />
            ))}
          </div>
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
