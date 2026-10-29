"use client"

// components/admin/campaigns/manage/CampaignManageClient.tsx
// 캠페인 관리 — 캠페인과 마케팅 프로젝트를 한 화면에서 관리한다(2026-10 통합).
// 이전에는 두 메뉴(/admin/campaigns/manage · /admin/campaigns/projects)였다. 지금은 헤더 아래
// 탭 두 개(캠페인 · 프로젝트)이고, 두 탭이 갤러리형 1b 시안의 같은 문법(상태 탭 + 상태별 묶음 +
// 갤러리/리스트 토글)을 쓴다. 예전 프로젝트 주소는 ?view=projects 로 넘어온다.
//
// 이 컴포넌트가 드는 것: 두 목록의 데이터, 탭(URL 동기화), 생성 드로어, 두 상세 패널, 동기화.
// 상세 패널을 여기서 들어야 프로젝트 상세 ↔ 캠페인 상세를 바로 오갈 수 있다.
// 목록 표시는 CampaignsPane / ProjectsPane 이 맡는다.
//
// 마이그레이션 미적용이면 각 API 가 500 → 크래시/화이트스크린 없이 탭별 에러 카드 + 재시도로
// 그레이스풀 강등(필수). 한쪽 목록이 실패해도 다른 탭은 그대로 쓴다.
// DESIGN.md 팔레트만 사용.

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Activity, ArrowLeft, FolderKanban, Layers, Link2, Plus, RefreshCw, type LucideIcon } from "lucide-react"

import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
import { getBusinessDateParts } from "@/lib/business-time"
import { manageViewSearch, type ManageView } from "@/lib/marketing/manage-view"
import { useToast } from "@/components/ui/toast"
import type { CampaignWithLinks, ProjectWithRollup } from "@/lib/types/marketing-campaign"

import { ProjectFormDrawer } from "../projects/ProjectFormDrawer"
import ProjectDetailPanel from "../projects/ProjectDetailPanel"
import ProjectsPane from "../projects/ProjectsPane"
import { CampaignFormDrawer } from "./CampaignFormDrawer"
import CampaignDetailPanel from "./CampaignDetailPanel"
import CampaignsPane, { type CampaignProjectFilter } from "./CampaignsPane"
import {
  AD_SYNC_CHANNEL_LABEL,
  AdSyncBanner,
  MetaSyncBanner,
  type AdSyncResult,
  type MetaSyncResult,
} from "./SyncResultBanners"

const VIEW_TABS: { id: ManageView; label: string; Icon: LucideIcon }[] = [
  { id: "campaigns", label: "캠페인", Icon: Layers },
  { id: "projects", label: "프로젝트", Icon: FolderKanban },
]

const SECONDARY_BUTTON =
  "inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] disabled:opacity-60"

export default function CampaignManageClient({
  initialView = "campaigns",
}: {
  initialView?: ManageView
}) {
  const toast = useToast()
  const [view, setView] = useState<ManageView>(initialView)
  // 기간 경과·D-day 기준일(KST YYYY-MM-DD) — 목록을 읽은 날로 고정해 한 화면의 판정이 어긋나지 않게 한다.
  const [today, setToday] = useState("")

  const [campaigns, setCampaigns] = useState<CampaignWithLinks[]>([])
  const [campaignsLoading, setCampaignsLoading] = useState(true)
  const [campaignsError, setCampaignsError] = useState<string | null>(null)

  const [projects, setProjects] = useState<ProjectWithRollup[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projectsError, setProjectsError] = useState<string | null>(null)

  // 캠페인 탭의 프로젝트 필터 — 프로젝트 상세의 "캠페인 탭에서 보기"가 바깥에서 바꾼다.
  const [projectFilter, setProjectFilter] = useState<CampaignProjectFilter>("all")
  // 생성 드로어 — 어느 탭의 "새 …"인지. 편집은 각 상세 패널이 폼 드로어를 재사용한다.
  const [creating, setCreating] = useState<ManageView | null>(null)
  // 상세 패널 — 한 번에 하나만 연다(프로젝트 ↔ 캠페인으로 넘어갈 때 앞의 것을 닫는다).
  // onClose 는 memoized(상세의 load deps 안정).
  const [campaignDetail, setCampaignDetail] = useState<CampaignWithLinks | null>(null)
  const [projectDetail, setProjectDetail] = useState<ProjectWithRollup | null>(null)
  const closeCampaignDetail = useCallback(() => setCampaignDetail(null), [])
  const closeProjectDetail = useCallback(() => setProjectDetail(null), [])

  // Meta 동기화 — 실행 중 여부 + 마지막 결과 배너(닫기 전까지 유지).
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<MetaSyncResult | null>(null)
  // setState 는 비동기라 연타를 못 막는다 — 동기 ref 로 실행 중 잠금(중복 가져오기 방지).
  const syncingRef = useRef(false)
  // Google·네이버 링크 동기화 — Meta 와 별개 버튼이다(하는 일이 다르다: 이쪽은 붙이기만).
  const [adSyncing, setAdSyncing] = useState(false)
  const [adSyncResult, setAdSyncResult] = useState<AdSyncResult | null>(null)
  const adSyncingRef = useRef(false)

  // 캠페인 목록 라우트는 롤업 포함이라 서버가 Meta Graph 를 부른다 — 30초 캐시로 마운트·재방문
  // 재조회를 흡수하고, 생성·수정·동기화 직후에만 force 로 우회한다.
  const loadCampaigns = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    setCampaignsLoading(true)
    setCampaignsError(null)
    try {
      const data = await adminFetchJsonCached<{ campaigns: CampaignWithLinks[] }>(
        "/api/admin/marketing-campaigns",
        undefined,
        { ttlMs: 30_000, force, staleIfError: !force },
      )
      setCampaigns(data.campaigns ?? [])
      setToday(getBusinessDateParts().date)
    } catch (e) {
      setCampaignsError(e instanceof Error ? e.message : "캠페인 목록을 불러오지 못했습니다.")
    } finally {
      setCampaignsLoading(false)
    }
  }, [])

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true)
    setProjectsError(null)
    try {
      const data = await adminFetchJson<{ projects: ProjectWithRollup[] }>("/api/admin/marketing-projects")
      setProjects(data.projects ?? [])
      setToday(getBusinessDateParts().date)
    } catch (e) {
      setProjectsError(e instanceof Error ? e.message : "프로젝트 목록을 불러오지 못했습니다.")
    } finally {
      setProjectsLoading(false)
    }
  }, [])

  // 한쪽 변경이 다른 쪽에 번진다 — 캠페인 링크는 프로젝트 롤업(행사·채널·소진)을, 프로젝트 배정은
  // 캠페인의 소속을 바꾼다. 그래서 상세 패널의 변경 뒤에는 두 목록을 함께(병렬로) 다시 읽는다.
  const reloadAll = useCallback(async () => {
    await Promise.all([loadCampaigns({ force: true }), loadProjects()])
  }, [loadCampaigns, loadProjects])

  useEffect(() => {
    void loadCampaigns()
    void loadProjects()
  }, [loadCampaigns, loadProjects])

  // 탭 전환 — state 를 즉시 바꾸고 주소는 history.replaceState 로 뒤따른다(서버 재조회 없음,
  // Next App Router 가 가로채 useSearchParams 와 동기화한다). 새로고침·공유해도 같은 탭이 열린다.
  const selectView = useCallback((next: ManageView) => {
    setView(next)
    const { pathname, hash } = window.location
    window.history.replaceState(null, "", `${pathname}${manageViewSearch(next)}${hash}`)
  }, [])

  const handleCampaignCreated = useCallback(
    async (message: string) => {
      setCreating(null)
      await loadCampaigns({ force: true })
      toast.success(message)
    },
    [loadCampaigns, toast],
  )

  const handleProjectCreated = useCallback(
    async (message: string) => {
      setCreating(null)
      await loadProjects()
      toast.success(message)
    },
    [loadProjects, toast],
  )

  // 프로젝트 상세의 멤버 캠페인 이름 → 캠페인 상세.
  const openCampaignFromProject = useCallback((campaign: CampaignWithLinks) => {
    setProjectDetail(null)
    setCampaignDetail(campaign)
  }, [])

  // 캠페인 상세의 소속 프로젝트 → 프로젝트 상세. 목록에 없으면(다른 곳에서 삭제 등) 지어내지 않는다.
  const openProjectFromCampaign = useCallback(
    (projectId: string) => {
      const project = projects.find((p) => p.id === projectId)
      if (!project) {
        toast.error("프로젝트를 찾지 못했습니다. 새로고침 후 다시 시도해 주세요.")
        return
      }
      setCampaignDetail(null)
      setProjectDetail(project)
    },
    [projects, toast],
  )

  const projectNameOf = useCallback(
    (projectId: string) => projects.find((p) => p.id === projectId)?.name ?? null,
    [projects],
  )

  // 프로젝트 상세의 "캠페인 탭에서 보기" — 그 프로젝트로 좁힌 캠페인 탭.
  const showProjectCampaigns = useCallback(
    (projectId: string) => {
      setProjectDetail(null)
      setProjectFilter(projectId)
      selectView("campaigns")
    },
    [selectView],
  )

  // Meta 동기화 — 미링크 Meta 캠페인을 미러로 가져오고, 미러의 이름·상태·기간을 Meta 에 맞춘다.
  // 서버가 플랜·적용을 모두 담당하므로 여기서는 1콜 + 결과 배너 + 목록 리로드만 한다.
  const handleMetaSync = useCallback(async () => {
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    try {
      const result = await adminFetchJson<MetaSyncResult>("/api/admin/marketing-campaigns/meta-sync", {
        method: "POST",
      })
      setSyncResult(result)
      const changedCount = result.created.length + result.updated.length
      if (result.failed.length > 0) {
        toast.error(`Meta 동기화 부분 실패 — 성공 ${changedCount}건 · 실패 ${result.failed.length}건`)
      } else if (changedCount > 0) {
        toast.success(`Meta 동기화 완료 — 가져옴 ${result.created.length} · 갱신 ${result.updated.length}`)
      } else {
        toast.success("Meta 동기화 완료 — 변경 사항 없음")
      }
      await loadCampaigns({ force: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Meta 동기화에 실패했습니다.")
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }, [loadCampaigns, toast])

  // Google·네이버 링크 — 스냅샷에 잡힌 광고 캠페인을 **이름이 같은 우산에 붙이기만** 한다.
  // 우산을 만들지 않으므로 되돌릴 일이 적다(붙은 링크는 상세 패널에서 해제 가능).
  const handleAdSync = useCallback(async () => {
    if (adSyncingRef.current) return
    adSyncingRef.current = true
    setAdSyncing(true)
    try {
      const result = await adminFetchJson<AdSyncResult>("/api/admin/marketing-campaigns/ad-sync", {
        method: "POST",
      })
      setAdSyncResult(result)
      const unreadable = result.sources.filter((source) => !source.ok)
      if (result.failed.length > 0) {
        toast.error(`광고 링크 부분 실패 — 연결 ${result.linked.length}건 · 실패 ${result.failed.length}건`)
      } else if (unreadable.length > 0) {
        // 못 읽은 채널이 있으면 "변경 없음"이 참이 아니다 — 성공 토스트로 덮지 않는다.
        toast.error(
          `${unreadable.map((s2) => AD_SYNC_CHANNEL_LABEL[s2.channel] ?? s2.channel).join("·")} 스냅샷을 읽지 못했습니다`,
        )
      } else if (result.linked.length > 0) {
        toast.success(`광고 링크 완료 — 연결 ${result.linked.length}건`)
      } else {
        toast.success("광고 링크 완료 — 새로 연결할 캠페인이 없음")
      }
      await loadCampaigns({ force: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "광고 캠페인 링크에 실패했습니다.")
    } finally {
      adSyncingRef.current = false
      setAdSyncing(false)
    }
  }, [loadCampaigns, toast])

  // 탭 머리의 건수 — 첫 로딩 중이거나 못 읽었으면 숫자를 지어내지 않는다(빈칸).
  const tabCount: Record<ManageView, number | null> = {
    campaigns: campaignsError || (campaignsLoading && campaigns.length === 0) ? null : campaigns.length,
    projects: projectsError || (projectsLoading && projects.length === 0) ? null : projects.length,
  }
  const anyLoading = campaignsLoading || projectsLoading

  return (
    <div className="pb-24">
      {/* 헤더 — 캠페인 허브와 동일한 TopBar 패턴 + 아래 가장자리에 붙은 탭(캠페인 · 프로젝트) */}
      <header className="border-b border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 pt-6 sm:px-6 lg:px-9 lg:pt-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#615D59]">
              <span>ADMIN</span>
              <span className="opacity-50">›</span>
              <span>그로스</span>
              <span className="opacity-50">›</span>
              <span>캠페인</span>
              <span className="opacity-50">›</span>
              <span className="text-[#111110]">관리</span>
            </div>
            <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-[-0.02em] text-[#111110] sm:text-[30px]">
              캠페인 관리
            </h1>
            <p className="mt-1.5 text-[13px] text-[#615D59]">
              캠페인으로 이메일·문자·행사·광고 실행을 묶고, 프로젝트로 캠페인을 묶어 예산 소진까지 한 화면에서 봅니다.
            </p>
          </div>

          {/* 동작은 지금 탭의 것만 — 동기화는 캠페인을 다루고, "새 …"는 탭의 대상을 만든다. */}
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
            {view === "campaigns" && (
              <>
                <button
                  type="button"
                  onClick={() => void handleMetaSync()}
                  disabled={syncing || campaignsLoading}
                  title="미링크 Meta 캠페인을 가져오고, Meta와 1:1로 연결된 캠페인의 이름·상태·기간을 Meta 기준으로 맞춥니다."
                  className={SECONDARY_BUTTON}
                >
                  <Activity className={`h-3.5 w-3.5 ${syncing ? "animate-pulse" : ""}`} />
                  {syncing ? "동기화 중…" : "Meta 동기화"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleAdSync()}
                  disabled={adSyncing || campaignsLoading}
                  title="최근 90일 집행이 잡힌 Google·네이버 캠페인을 이름이 같은 캠페인에 연결합니다. 캠페인을 새로 만들지는 않습니다."
                  className={SECONDARY_BUTTON}
                >
                  <Link2 className={`h-3.5 w-3.5 ${adSyncing ? "animate-pulse" : ""}`} />
                  {adSyncing ? "연결 중…" : "Google·네이버 링크"}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => void reloadAll()}
              disabled={anyLoading}
              className={SECONDARY_BUTTON}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${anyLoading ? "animate-spin" : ""}`} />
              새로고침
            </button>
            <button
              type="button"
              onClick={() => setCreating(view)}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#084734] px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#065c41]"
            >
              <Plus className="h-3.5 w-3.5" />
              {view === "campaigns" ? "새 캠페인" : "새 프로젝트"}
            </button>
          </div>
        </div>

        <div className="mt-4">
          <Link
            href="/admin/campaigns"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#615D59] transition-colors hover:text-[#111110]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            캠페인 허브로
          </Link>
        </div>

        {/* 관리 대상 탭 — 헤더 아래 가장자리에 붙는다(-mb-px 로 헤더 보더 위에 밑줄을 겹친다).
            본문의 상태 탭(작은 글씨·검정 밑줄)과 위계를 나누려 큰 글씨·그린 밑줄을 쓴다. */}
        <div role="tablist" aria-label="관리 대상" className="mt-3 flex gap-1 overflow-x-auto">
          {VIEW_TABS.map(({ id, label, Icon }) => {
            const active = view === id
            const count = tabCount[id]
            return (
              <button
                key={id}
                id={`campaign-manage-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`campaign-manage-panel-${id}`}
                onClick={() => selectView(id)}
                className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-[14px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734] ${
                  active
                    ? "border-[#084734] text-[#111110]"
                    : "border-transparent text-[#615D59] hover:text-[#111110]"
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? "text-[#084734]" : "text-[#A39E98]"}`} aria-hidden />
                {label}
                {count != null && (
                  <span className="text-[12px] font-medium tabular-nums text-[#A39E98]">{count}</span>
                )}
              </button>
            )
          })}
        </div>
      </header>

      {/* 본문 — 두 탭을 모두 마운트해 두고 hidden 으로 가린다: 탭을 오가도 필터·검색·더보기가 유지된다. */}
      <div className="px-4 pt-5 sm:px-6 lg:px-9">
        <div
          role="tabpanel"
          id="campaign-manage-panel-campaigns"
          aria-labelledby="campaign-manage-tab-campaigns"
          hidden={view !== "campaigns"}
        >
          {syncResult && <MetaSyncBanner result={syncResult} onClose={() => setSyncResult(null)} />}
          {adSyncResult && <AdSyncBanner result={adSyncResult} onClose={() => setAdSyncResult(null)} />}
          <CampaignsPane
            campaigns={campaigns}
            projects={projectsError ? [] : projects}
            loading={campaignsLoading}
            error={campaignsError}
            today={today}
            projectFilter={projectFilter}
            onProjectFilterChange={setProjectFilter}
            onRetry={() => void loadCampaigns()}
            onCreate={() => setCreating("campaigns")}
            onOpen={setCampaignDetail}
          />
        </div>
        <div
          role="tabpanel"
          id="campaign-manage-panel-projects"
          aria-labelledby="campaign-manage-tab-projects"
          hidden={view !== "projects"}
        >
          <ProjectsPane
            projects={projects}
            loading={projectsLoading}
            error={projectsError}
            today={today}
            onRetry={() => void loadProjects()}
            onCreate={() => setCreating("projects")}
            onOpen={setProjectDetail}
          />
        </div>
      </div>

      {/* 생성 드로어 — 탭의 "새 …" 전용(편집은 각 상세 패널이 담당). */}
      {creating === "campaigns" && (
        <CampaignFormDrawer
          initial={null}
          onClose={() => setCreating(null)}
          onSuccess={handleCampaignCreated}
        />
      )}
      {creating === "projects" && (
        <ProjectFormDrawer
          initial={null}
          onClose={() => setCreating(null)}
          onSuccess={handleProjectCreated}
        />
      )}

      {/* 캠페인 상세 — 롤업 + 연결된 실행 + 링크 피커 + 편집 + 소속 프로젝트로 가는 길. */}
      {campaignDetail && (
        <CampaignDetailPanel
          campaign={campaignDetail}
          onClose={closeCampaignDetail}
          onListChanged={reloadAll}
          projectNameOf={projectNameOf}
          onOpenProject={openProjectFromCampaign}
        />
      )}

      {/* 프로젝트 상세 — 페이싱 + 롤업 + 멤버 캠페인(이름 → 캠페인 상세) + 배정 피커 + 편집. */}
      {projectDetail && (
        <ProjectDetailPanel
          project={projectDetail}
          today={today}
          onClose={closeProjectDetail}
          onListChanged={reloadAll}
          onOpenCampaign={openCampaignFromProject}
          onShowCampaigns={() => showProjectCampaigns(projectDetail.id)}
        />
      )}
    </div>
  )
}
