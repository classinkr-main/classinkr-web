"use client"

// components/admin/campaigns/projects/ProjectDetailPanel.tsx
// 마케팅 프로젝트 상세(D3-3) — 우측 슬라이드오버. 예산 페이싱 카드(기간 경과 vs 소진 + 오늘 눈금 +
// 소진·배정·잔여) + 롤업 요약 + 멤버 캠페인(상태별 묶음, 각 "제외") + "캠페인 추가" 피커.
// GET /[id] 로 프로젝트 + 롤업 + 멤버 캠페인을 조회한다.
// 마이그 미적용이면 API 가 500/404 → 크래시 없이 에러 카드/자동 닫힘으로 강등(그레이스풀).
// "편집"은 ProjectFormDrawer 를 재사용한다(리빌드 금지).
// 정직 규칙: 예산 소진은 행사 KRW 광고비만(Meta USD·이메일·문자 제외) — 페이싱 카드가 ProjectBudgetCaveat 로 1회 명시.
// DESIGN.md 팔레트만 사용.

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertCircle,
  Loader2,
  Megaphone,
  Pencil,
  Plus,
  RefreshCw,
  User,
  X,
} from "lucide-react"

import { adminFetch, adminFetchJson } from "@/lib/admin-client"
import { useToast } from "@/components/ui/toast"
import { useDialogFocus } from "@/components/admin/use-dialog-focus"
import { computeProjectPacing, type ProjectPacing } from "@/lib/marketing/project-pacing"
import type {
  CampaignWithLinks,
  MarketingProject,
  ProjectRollup,
  ProjectWithRollup,
} from "@/lib/types/marketing-campaign"

import {
  CAMPAIGN_STATUS_RAIL,
  channelLabel,
  formatBudget,
  formatCampaignPeriod,
  formatDotDate,
} from "../manage/CampaignRow"
import { ProjectFormDrawer } from "./ProjectFormDrawer"
import {
  DDAY_TONE_TEXT,
  PACE_TONE_TEXT,
  PROJECT_STATUS_ORDER,
  PacingBar,
  ProjectBudgetCaveat,
  ProjectRollupStats,
  ProjectStatusChip,
  ProjectStatusGroupHeading,
  budgetSpendView,
  formatWon,
} from "./ProjectCard"

type DetailResponse = {
  project: MarketingProject
  rollup: ProjectRollup
  campaigns: CampaignWithLinks[]
}

interface ProjectDetailPanelProps {
  project: ProjectWithRollup // 리스트 요약 — 즉시 헤더 + 롤업 폴백. 상세는 GET /[id] 로 새로 조회.
  today: string // 페이싱 기준일(KST YYYY-MM-DD) — 리스트와 같은 날로 판정한다.
  onClose: () => void // 부모에서 memoized(안정) — load 의 deps 로 안전하게 쓰인다.
  onListChanged: () => void | Promise<void> // 부모 리스트 리페치(멤버 수·롤업·필드 변경 반영).
  // 캠페인 관리 통합 화면(2026-10)에서만 넘어온다 — 멤버 캠페인 이름 → 캠페인 상세로 바로 넘어가기.
  onOpenCampaign?: (campaign: CampaignWithLinks) => void
  // 이 프로젝트로 좁힌 캠페인 탭으로 넘어가기(통합 화면의 프로젝트 필터).
  onShowCampaigns?: () => void
}

/* ── 예산 페이싱 카드(순수·프레젠테이션) ──────────────────────── */

// 하단 3분할 수치 — 라벨은 조역, 금액이 주역.
function PacingFigure({
  label,
  value,
  valueClass,
  divide = false,
}: {
  label: string
  value: string
  valueClass: string
  divide?: boolean
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-1 ${
        divide ? "border-l border-[rgba(0,0,0,0.08)] pl-3.5" : ""
      }`}
    >
      <span className="text-[10.5px] text-[#A39E98]">{label}</span>
      <b className={`text-[14px] font-bold tabular-nums sm:text-[15px] ${valueClass}`}>{value}</b>
    </div>
  )
}

/**
 * 기간 경과와 예산 소진을 같은 폭 4px 미터 두 줄로 겹쳐 비교한다. 진행 기간 안이면 "오늘" 눈금이
 * 두 줄을 가로지른다 — 소진 막대 끝이 눈금보다 앞서면 빠름, 뒤면 느림. 눈금 길이(-34px)는
 * 미터 줄 높이(h-4)와 줄 간격(gap-3)에 맞춘 값이라 셋을 함께 바꾼다(위아래로 6px씩 삐져나온다).
 */
function ProjectPacingSection({
  project,
  rollup,
  pacing,
  today,
}: {
  project: MarketingProject
  rollup: ProjectRollup
  pacing: ProjectPacing
  today: string
}) {
  const spend = budgetSpendView(rollup)
  const remain = rollup.budgetAllocated == null ? null : rollup.budgetAllocated - rollup.budgetSpent

  return (
    <section className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-bold text-[#111110]">예산 페이싱</h3>
        <span className={`text-[11px] font-semibold ${PACE_TONE_TEXT[pacing.pace.tone]}`}>
          {pacing.pace.label}
        </span>
      </div>

      <div className="grid grid-cols-[60px_minmax(0,1fr)_48px] items-center gap-3">
        <span aria-hidden />
        <div className="flex justify-between gap-2 text-[10.5px] tabular-nums text-[#A39E98]">
          <span>{project.startsAt ? formatDotDate(project.startsAt) : "시작일 미정"}</span>
          <span>{project.endsAt ? formatDotDate(project.endsAt) : "종료일 미정"}</span>
        </div>
        <span aria-hidden />

        <span className="text-[11px] text-[#615D59]">기간 경과</span>
        <div className="flex h-4 items-center">
          <PacingBar
            pct={pacing.elapsedPct ?? 0}
            fillClass="bg-[#A39E98]"
            empty={pacing.elapsedPct == null}
            className="h-1 w-full"
          >
            {pacing.todayInRange && (
              <span
                className="absolute -bottom-[34px] -top-1.5 w-px bg-[#111110]/35"
                style={{ left: `${pacing.elapsedPct ?? 0}%` }}
              />
            )}
          </PacingBar>
        </div>
        <span className="text-right text-[13px] font-semibold tabular-nums text-[#615D59]">
          {pacing.elapsedPct == null ? "—" : `${pacing.elapsedPct}%`}
        </span>

        <span className="text-[11px] text-[#615D59]">예산 소진</span>
        <div className="flex h-4 items-center">
          <PacingBar
            pct={spend.barPct}
            fillClass={spend.fillClass}
            empty={!spend.hasBudget}
            className="h-1 w-full"
          />
        </div>
        <span className={`text-right text-[13px] font-bold tabular-nums ${spend.pctClass}`}>
          {spend.pctText}
        </span>
      </div>

      <div className="mt-[18px] grid grid-cols-3 border-t border-[rgba(0,0,0,0.08)] pt-3.5">
        <PacingFigure label="소진" value={formatWon(rollup.budgetSpent)} valueClass="text-[#111110]" />
        <PacingFigure
          label="배정"
          value={formatBudget(rollup.budgetAllocated)}
          valueClass="text-[#31302E]"
          divide
        />
        {/* 예산 미배정이면 잔여를 만들지 않는다(—). 음수는 "초과"로 이름을 바꿔 절댓값으로 말한다. */}
        <PacingFigure
          label={remain != null && remain < 0 ? "초과" : "잔여"}
          value={remain == null ? "—" : formatWon(Math.abs(remain))}
          valueClass={
            remain == null ? "text-[#A39E98]" : remain < 0 ? "text-[#A8741A]" : "text-[#111110]"
          }
          divide
        />
      </div>

      {/* 정직 캐비앗 — 이 패널은 프로젝트 1개짜리라 여기서 1회만 나온다. */}
      <ProjectBudgetCaveat today={today} className="mt-3" />
    </section>
  )
}

/* ── 멤버 캠페인 행(순수·프레젠테이션) ────────────────────────── */

function MemberCampaignRow({
  campaign,
  removing,
  onRemove,
  onOpen,
}: {
  campaign: CampaignWithLinks
  removing: boolean
  onRemove: () => void
  onOpen?: () => void
}) {
  const rail = CAMPAIGN_STATUS_RAIL[campaign.status]
  const nameClass = `truncate text-[12px] font-semibold ${
    campaign.status === "done" ? "text-[#615D59]" : "text-[#111110]"
  }`
  return (
    <div className="relative flex items-start justify-between gap-2 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#fafaf8] py-2 pl-3 pr-2.5">
      {/* 상태 레일 — 진행/일시중지만(캠페인 관리 행과 같은 위계). */}
      {rail && <span aria-hidden className={`absolute inset-y-2 left-0 w-[3px] rounded-r-full ${rail}`} />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* 이름이 곧 캠페인 상세로 가는 길(통합 화면) — 행 전체가 아니라 이름만 눌린다("제외"와 겹치지 않게). */}
          {onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              title="캠페인 상세 열기"
              className={`${nameClass} min-w-0 text-left underline-offset-2 hover:text-[#084734] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]`}
            >
              {campaign.name}
            </button>
          ) : (
            <span className={nameClass}>{campaign.name}</span>
          )}
          <ProjectStatusChip status={campaign.status} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {campaign.channels.map((channel) => (
            <span
              key={channel}
              className="inline-flex items-center rounded-full border border-[rgba(0,0,0,0.08)] bg-white px-1.5 py-0.5 text-[10px] font-medium text-[#615D59]"
            >
              {channelLabel(channel)}
            </span>
          ))}
          <span className="pl-1 text-[10.5px] tabular-nums text-[#A39E98]">
            {formatCampaignPeriod(campaign.startsAt, campaign.endsAt)}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* 예산 미정은 "값"이 아니라 부재 — 숫자와 같은 무게로 읽히지 않게 낮춘다. */}
        <span
          className={`text-[11.5px] font-semibold tabular-nums ${
            campaign.budget == null ? "text-[#A39E98]" : "text-[#31302E]"
          }`}
        >
          {formatBudget(campaign.budget)}
        </span>
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          className="rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 py-1 text-[11px] font-medium text-[#615D59] transition hover:border-[#F2B8B8] hover:bg-[#FCE9E9] hover:text-[#B43E3E] disabled:opacity-50"
        >
          {removing ? "제외 중..." : "제외"}
        </button>
      </div>
    </div>
  )
}

/* ── 캠페인 추가 피커(이 프로젝트에 없는 캠페인만) ────────────── */

function AssignCampaignPicker({
  projectId,
  onAssigned,
  onClose,
}: {
  projectId: string
  onAssigned: () => void | Promise<void> // 배정 성공 → 상세 리페치(+부모 리스트)
  onClose: () => void
}) {
  const toast = useToast()
  const [campaigns, setCampaigns] = useState<CampaignWithLinks[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // ?rollup=0 — 이 피커는 이름/소속(projectId)만 읽는다. 기본 응답의 크로스채널 롤업은
      // 라이브 Meta Graph 콜까지 유발하므로, 쓰지도 않을 지표 때문에 광고 API 를 때리지 않도록 옵트아웃.
      const data = await adminFetchJson<{ campaigns: CampaignWithLinks[] }>(
        "/api/admin/marketing-campaigns?rollup=0",
      )
      setCampaigns(data.campaigns ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "캠페인 목록을 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // 이 프로젝트에 이미 소속된 캠페인은 멤버 목록에 있으므로 후보에서 제외한다.
  const assignable = campaigns.filter((c) => c.projectId !== projectId)

  async function handleAssign(campaignId: string) {
    setPending(campaignId)
    try {
      await adminFetchJson(`/api/admin/marketing-projects/${projectId}/campaigns`, {
        method: "POST",
        body: JSON.stringify({ campaignId }),
      })
      toast.success("캠페인을 프로젝트에 배정했습니다.")
      await onAssigned() // 상세 리페치 → 멤버 목록/롤업 갱신
      await load() // 후보 리페치 → 방금 배정한 캠페인이 목록에서 빠진다
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "배정에 실패했습니다.")
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-[12px] font-bold text-[#111110]">캠페인 추가</p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 py-1 text-[11px] font-medium text-[#615D59] transition hover:bg-[#F6F5F4] disabled:opacity-60"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            새로고침
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-[#615D59] transition hover:text-[#111110]"
          >
            닫기
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-1.5" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-[#f0f0ec]" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-[#F2B8B8] bg-[#FCE9E9] px-3 py-2.5">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B43E3E]" />
            <div className="min-w-0">
              <p className="break-words text-[12px] text-[#B43E3E]">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-2 inline-flex items-center gap-1 rounded-md border border-[#F2B8B8] bg-white px-2 py-1 text-[11px] font-bold text-[#B43E3E] transition hover:bg-[#FCE9E9]"
              >
                <RefreshCw className="h-3 w-3" />
                다시 시도
              </button>
            </div>
          </div>
        </div>
      ) : assignable.length === 0 ? (
        <p className="text-[11px] text-[#A39E98]">배정할 수 있는 캠페인이 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {assignable.map((c) => {
            const inOtherProject = c.projectId != null && c.projectId !== projectId
            const isPending = pending === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => void handleAssign(c.id)}
                disabled={pending !== null}
                title={c.name}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white px-2.5 py-1.5 text-left text-[12px] text-[#111110] transition hover:border-[#BDEFD8] hover:bg-[#ECFDF5] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{c.name}</span>
                  {inOtherProject && (
                    <span className="shrink-0 rounded-full bg-[#FBF1E0] px-1.5 py-0.5 text-[10px] font-medium text-[#A8741A]">
                      다른 프로젝트
                    </span>
                  )}
                </span>
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#615D59]" />
                ) : (
                  <Plus className="h-3.5 w-3.5 shrink-0 text-[#084734]" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── 상세 패널 ────────────────────────────────────────────────── */

export default function ProjectDetailPanel({
  project,
  today,
  onClose,
  onListChanged,
  onOpenCampaign,
  onShowCampaigns,
}: ProjectDetailPanelProps) {
  const toast = useToast()
  const [data, setData] = useState<DetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  // adminFetchJson 대신 adminFetch 로 404 를 직접 구분한다(삭제됨 vs 전송 오류).
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminFetch(`/api/admin/marketing-projects/${project.id}`)
      if (res.status === 404) {
        // 다른 곳에서 삭제됨 → 깨진 상세 대신 패널을 닫는다.
        onClose()
        return
      }
      const json = (await res.json().catch(() => null)) as DetailResponse | { error?: string } | null
      if (!res.ok) {
        const msg =
          (json && "error" in json && json.error) || `${res.status} ${res.statusText}`.trim()
        throw new Error(msg || "프로젝트 상세를 불러오지 못했습니다.")
      }
      setData(json as DetailResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : "프로젝트 상세를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [project.id, onClose])

  useEffect(() => {
    void load()
  }, [load])

  // 포커스 트랩·복귀·Escape(2026-08-18 a11y) — role=dialog 선언만 있고 포커스가 배경에 남던
  // 문제를 공용 훅으로 마감한다. 자식 오버레이(폼 드로어·피커)가 열려 있는 동안은 훅을
  // 비활성화해 자식의 키 처리에 양보한다(폼 드로어는 자체 useDialogFocus 보유).
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  useDialogFocus(!editing && !pickerOpen, onClose, closeButtonRef)

  // Escape: 편집 중이면 폼 드로어가 우선(자체 훅으로 닫음) → 무시. 피커 열림 → 피커만 닫는다.
  // 기본 케이스(상세 닫기)는 위 useDialogFocus가 담당한다.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || !pickerOpen) return
      setPickerOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [pickerOpen])

  // 헤더·롤업은 fetch 전엔 리스트 요약으로 폴백해 빈 화면 깜빡임을 막는다.
  const head = data?.project ?? project
  const rollup = data?.rollup ?? project.rollup
  const campaigns = data?.campaigns ?? []
  const pacing = computeProjectPacing(
    { status: head.status, startsAt: head.startsAt, endsAt: head.endsAt, spentPct: rollup.spentPct },
    today,
  )

  async function handleEditSuccess(message: string) {
    setEditing(false)
    toast.success(message)
    await onListChanged()
    await load() // 삭제였다면 GET 404 → load 가 onClose 를 호출해 패널을 닫는다.
  }

  async function handleAssigned() {
    await load()
    await onListChanged()
  }

  async function handleRemove(campaignId: string) {
    setRemovingId(campaignId)
    try {
      await adminFetchJson(`/api/admin/marketing-projects/${project.id}/campaigns`, {
        method: "DELETE",
        body: JSON.stringify({ campaignId }),
      })
      toast.success("캠페인을 프로젝트에서 제외했습니다.")
      await load()
      await onListChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "제외에 실패했습니다.")
    } finally {
      setRemovingId(null)
    }
  }

  const memberCount = campaigns.length
  // 멤버 캠페인도 리스트와 같은 상태 순서로 묶는다 — 묶음 안은 API 순서(최근 생성순).
  const memberGroups = PROJECT_STATUS_ORDER.map((status) => ({
    status,
    items: campaigns.filter((c) => c.status === status),
  })).filter((group) => group.items.length > 0)

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex justify-end bg-black/40"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="flex h-full w-full max-w-xl flex-col bg-[#FAFAF8] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={`프로젝트 상세: ${head.name}`}
        >
          {/* 헤더(고정) */}
          <div className="shrink-0 border-b border-[rgba(0,0,0,0.08)] bg-white px-4 py-4 leading-tight sm:px-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#615D59]">
                  프로젝트 상세
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-[18px] font-bold text-[#111110]">{head.name}</h2>
                  <ProjectStatusChip status={head.status} />
                </div>
                {head.objective && <p className="mt-1 text-[12px] text-[#615D59]">{head.objective}</p>}
                {/* 기간 · 담당 · D-day */}
                <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] tabular-nums text-[#615D59]">
                  <span>{formatCampaignPeriod(head.startsAt, head.endsAt)}</span>
                  {head.owner && (
                    <>
                      <span className="text-[#A39E98]" aria-hidden>
                        ·
                      </span>
                      <span className="inline-flex items-center gap-0.5">
                        <User className="h-2.5 w-2.5 text-[#A39E98]" aria-hidden />
                        {head.owner}
                      </span>
                    </>
                  )}
                  <span className="text-[#A39E98]" aria-hidden>
                    ·
                  </span>
                  <span className={`font-semibold ${DDAY_TONE_TEXT[pacing.dday.tone]}`}>
                    {pacing.dday.label}
                  </span>
                </div>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label="닫기"
                className="shrink-0 text-[#615D59] transition-colors hover:text-[#111110]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4]"
              >
                <Pencil className="h-3.5 w-3.5" />
                편집
              </button>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                새로고침
              </button>
            </div>
          </div>

          {/* 본문(스크롤) */}
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 leading-tight sm:px-5">
            {loading && !data ? (
              <div className="space-y-3" aria-busy="true">
                <div className="h-[210px] animate-pulse rounded-2xl border border-[rgba(0,0,0,0.08)] bg-[#f0f0ec]" />
                <div className="h-[72px] animate-pulse rounded-2xl border border-[rgba(0,0,0,0.08)] bg-[#f0f0ec]" />
                <div className="h-[140px] animate-pulse rounded-2xl border border-[rgba(0,0,0,0.08)] bg-[#f0f0ec]" />
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-[#F2B8B8] bg-[#FCE9E9] px-4 py-5">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#B43E3E]" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[#8F2C2C]">상세를 불러오지 못했습니다</p>
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
            ) : (
              <>
                <ProjectPacingSection project={head} rollup={rollup} pacing={pacing} today={today} />

                {/* 롤업 요약 — 멤버 캠페인 수·채널·행사 */}
                <section className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-4 sm:p-5">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-[13px] font-bold text-[#111110]">프로젝트 요약</h3>
                    <span className="text-[11px] text-[#615D59]">읽기 시점 롤업</span>
                  </div>
                  <ProjectRollupStats rollup={rollup} />
                </section>

                {/* 멤버 캠페인 */}
                <section className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-4 sm:p-5">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#111110]">
                      <Megaphone className="h-3.5 w-3.5 text-[#615D59]" />
                      멤버 캠페인
                      <span className="tabular-nums text-[#615D59]">{memberCount}</span>
                    </h3>
                    <div className="flex items-center gap-2">
                      {onShowCampaigns && memberCount > 0 && (
                        <button
                          type="button"
                          onClick={onShowCampaigns}
                          className="text-[12px] font-medium text-[#615D59] underline-offset-2 transition-colors hover:text-[#084734] hover:underline"
                        >
                          캠페인 탭에서 보기 →
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setPickerOpen((v) => !v)}
                        aria-expanded={pickerOpen}
                        className="inline-flex items-center gap-1.5 rounded-md bg-[#084734] px-2.5 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#065c41]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        캠페인 추가
                      </button>
                    </div>
                  </div>

                  {pickerOpen && (
                    <div className="mb-3">
                      <AssignCampaignPicker
                        projectId={project.id}
                        onAssigned={handleAssigned}
                        onClose={() => setPickerOpen(false)}
                      />
                    </div>
                  )}

                  {memberCount === 0 ? (
                    <p className="rounded-xl border border-dashed border-[rgba(0,0,0,0.08)] bg-[#fafaf8] px-4 py-6 text-center text-[12px] text-[#615D59]">
                      아직 소속된 캠페인이 없습니다. “캠페인 추가”로 캠페인을 이 프로젝트에 묶어보세요.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3.5">
                      {memberGroups.map((group) => (
                        <div key={group.status}>
                          <ProjectStatusGroupHeading
                            status={group.status}
                            count={group.items.length}
                            size="sm"
                          />
                          <div className="flex flex-col gap-1.5">
                            {group.items.map((c) => (
                              <MemberCampaignRow
                                key={c.id}
                                campaign={c}
                                removing={removingId === c.id}
                                onRemove={() => void handleRemove(c.id)}
                                onOpen={onOpenCampaign ? () => onOpenCampaign(c) : undefined}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 편집 — ProjectFormDrawer 재사용(z-50, 상세 위에). 저장/삭제 성공 → handleEditSuccess. */}
      {editing && (
        <ProjectFormDrawer
          initial={data?.project ?? project}
          onClose={() => setEditing(false)}
          onSuccess={handleEditSuccess}
        />
      )}
    </>
  )
}
