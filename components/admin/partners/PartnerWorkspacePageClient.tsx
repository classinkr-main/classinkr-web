"use client"

import Link from "next/link"
import { useDeferredValue, useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  ClipboardList,
  Handshake,
  Pencil,
  Plus,
  Receipt,
  Search,
  Users,
} from "lucide-react"

import PartnerFormDialog from "@/components/admin/partners/PartnerFormDialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { PartnerDataSource, PartnerSummaryInput, PartnerWorkspace } from "@/lib/partners-types"

interface PartnerWorkspacePageClientProps {
  initialWorkspaces: PartnerWorkspace[]
  initialSource: PartnerDataSource
  initialWarning?: string
}

type QueueView =
  | "all"
  | "contract_waiting"
  | "fulfillment_active"
  | "settlement_delayed"
  | "issue_needed"
  | "caution"

interface WorkspaceInsight {
  workspace: PartnerWorkspace
  openDeals: number
  pendingContracts: number
  activeFulfillmentItems: number
  overdueReceipts: number
  totalUnits: number
  totalNetAmount: number
  nextActionAt?: string
  riskLevel: "low" | "medium" | "high"
  queueLabels: string[]
  latestContext: string
}

const SELECT_CLASSNAME =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

const STATUS_LABEL = {
  lead: "신규",
  active: "활성",
  paused: "보류",
  churn_risk: "리스크",
} as const

const STATUS_STYLE = {
  lead: "bg-blue-50 text-blue-700",
  active: "bg-emerald-50 text-emerald-700",
  paused: "bg-slate-100 text-slate-700",
  churn_risk: "bg-amber-50 text-amber-700",
} as const

const QUEUE_LABEL = {
  all: "전체",
  contract_waiting: "계약 대기",
  fulfillment_active: "설치 진행",
  settlement_delayed: "정산 지연",
  issue_needed: "이슈 필요",
  caution: "주의/휴면",
} as const

const QUEUE_DESCRIPTION = {
  all: "전체 파트너 워크스페이스를 보되, 우선순위는 큐 배지로 빠르게 판단합니다.",
  contract_waiting: "견적 발송 또는 계약 검토가 필요한 파트너를 먼저 처리합니다.",
  fulfillment_active: "설치·후속 실행 흐름이 움직이는 파트너를 모아서 봅니다.",
  settlement_delayed: "연체 또는 미정산 가능성이 있는 문서를 우선 확인합니다.",
  issue_needed: "리스크가 높거나 메모/상태상 판단이 필요한 파트너를 묶어 봅니다.",
  caution: "리드 초기 상태이거나 휴면/리스크 상태의 파트너를 정리합니다.",
} as const

const QUEUE_OPTIONS: QueueView[] = [
  "all",
  "contract_waiting",
  "fulfillment_active",
  "settlement_delayed",
  "issue_needed",
  "caution",
]

function getToken() {
  return sessionStorage.getItem("admin_password") ?? ""
}

async function adminFetch(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...options?.headers,
    },
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error ?? "요청에 실패했습니다.")
  }

  return data
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDateLabel(value?: string) {
  if (!value) return "미정"
  return value.slice(0, 16).replace("T", " ")
}

function buildInsight(workspace: PartnerWorkspace): WorkspaceInsight {
  const openDeals = workspace.deals.filter((deal) =>
    ["discovery", "quoted", "contract_sent", "active"].includes(deal.stage)
  ).length
  const pendingContracts = workspace.deals.filter((deal) =>
    ["quoted", "contract_sent"].includes(deal.stage)
  ).length
  const activeFulfillmentItems = workspace.schedule.filter((item) => item.status === "planned").length
  const overdueReceipts = workspace.documents.filter((document) =>
    document.kind === "receipt" && document.status === "overdue"
  ).length
  const totalUnits = workspace.sales.reduce((sum, sale) => sum + sale.unitsSold, 0)
  const totalNetAmount = workspace.sales.reduce((sum, sale) => sum + sale.netAmount, 0)
  const nextActionAt = workspace.partner.nextActionAt

  const queueLabels: string[] = []
  if (pendingContracts > 0) queueLabels.push("계약 대기")
  if (activeFulfillmentItems > 0) queueLabels.push("실행 중")
  if (overdueReceipts > 0) queueLabels.push("정산 지연")
  if (workspace.partner.status === "churn_risk") queueLabels.push("리스크")
  if (workspace.partner.status === "paused") queueLabels.push("보류")
  if (workspace.partner.status === "lead") queueLabels.push("리드")

  const riskLevel =
    overdueReceipts > 0 || workspace.partner.status === "churn_risk"
      ? "high"
      : pendingContracts > 0 || workspace.partner.status === "paused"
        ? "medium"
        : "low"

  const latestScheduled = workspace.schedule.at(0)
  const latestDocument = workspace.documents.at(0)
  const latestSale = workspace.sales.at(0)
  const latestContext = latestScheduled
    ? `다음 실행 ${latestScheduled.title}`
    : latestDocument
      ? `문서 ${latestDocument.title}`
      : latestSale
        ? `실적 ${latestSale.salesMonth.slice(0, 7)}`
        : "최근 운영 기록 없음"

  return {
    workspace,
    openDeals,
    pendingContracts,
    activeFulfillmentItems,
    overdueReceipts,
    totalUnits,
    totalNetAmount,
    nextActionAt,
    riskLevel,
    queueLabels,
    latestContext,
  }
}

function matchesQueue(insight: WorkspaceInsight, queueView: QueueView) {
  switch (queueView) {
    case "contract_waiting":
      return insight.pendingContracts > 0
    case "fulfillment_active":
      return insight.activeFulfillmentItems > 0
    case "settlement_delayed":
      return insight.overdueReceipts > 0
    case "issue_needed":
      return insight.riskLevel === "high" || insight.workspace.partner.notes?.trim()
    case "caution":
      return ["lead", "paused", "churn_risk"].includes(insight.workspace.partner.status)
    case "all":
    default:
      return true
  }
}

export default function PartnerWorkspacePageClient({
  initialWorkspaces,
  initialSource,
  initialWarning,
}: PartnerWorkspacePageClientProps) {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces)
  const [source, setSource] = useState(initialSource)
  const [warning, setWarning] = useState(initialWarning)
  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [editingWorkspace, setEditingWorkspace] = useState<PartnerWorkspace | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [queueView, setQueueView] = useState<QueueView>("all")
  const [statusFilter, setStatusFilter] = useState<"all" | PartnerWorkspace["partner"]["status"]>("all")
  const [managerFilter, setManagerFilter] = useState("all")

  const deferredSearch = useDeferredValue(searchQuery)
  const normalizedQuery = deferredSearch.trim().toLowerCase()
  const managerOptions = Array.from(
    new Set(workspaces.map((workspace) => workspace.partner.accountManager).filter(Boolean))
  ).sort((left, right) => left.localeCompare(right, "ko"))

  const insights = workspaces.map(buildInsight)
  const filteredInsights = insights.filter((insight) => {
    const workspace = insight.workspace
    const matchesSearch =
      normalizedQuery.length === 0 ||
      [
        workspace.partner.name,
        workspace.partner.region,
        workspace.partner.accountManager,
        workspace.partner.ownerName,
        workspace.partner.ownerEmail,
        workspace.partner.notes ?? "",
        workspace.partner.tags.join(" "),
        insight.queueLabels.join(" "),
        insight.latestContext,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)

    const matchesQueueView = matchesQueue(insight, queueView)
    const matchesStatus = statusFilter === "all" || workspace.partner.status === statusFilter
    const matchesManager = managerFilter === "all" || workspace.partner.accountManager === managerFilter
    return matchesSearch && matchesQueueView && matchesStatus && matchesManager
  })

  const hasActiveFilters =
    normalizedQuery.length > 0 || queueView !== "all" || statusFilter !== "all" || managerFilter !== "all"

  const totalContractWaiting = insights.filter((insight) => insight.pendingContracts > 0).length
  const totalFulfillmentActive = insights.filter((insight) => insight.activeFulfillmentItems > 0).length
  const totalSettlementDelayed = insights.filter((insight) => insight.overdueReceipts > 0).length
  const totalIssueNeeded = insights.filter((insight) => insight.riskLevel === "high").length

  const applyResult = (payload: { workspace: PartnerWorkspace; source: PartnerDataSource; warning?: string }) => {
    setWorkspaces((prev) => {
      const existingIndex = prev.findIndex((item) => item.partner.id === payload.workspace.partner.id)
      if (existingIndex < 0) return [payload.workspace, ...prev]
      const next = [...prev]
      next[existingIndex] = payload.workspace
      return next
    })
    setSource(payload.source)
    setWarning(payload.warning)
  }

  const handleSavePartner = async (payload: PartnerSummaryInput) => {
    setSaving(true)
    setFormError(undefined)
    try {
      const data = editingWorkspace
        ? await adminFetch(`/api/admin/partners/${editingWorkspace.partner.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await adminFetch("/api/admin/partners", {
            method: "POST",
            body: JSON.stringify(payload),
          })

      if (data?.workspace) {
        applyResult(data as { workspace: PartnerWorkspace; source: PartnerDataSource; warning?: string })
      }

      setFormOpen(false)
      setEditingWorkspace(null)
      setFormError(undefined)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "저장에 실패했습니다.")
    } finally {
      setSaving(false)
    }
  }

  const openCreateDialog = () => {
    setEditingWorkspace(null)
    setFormError(undefined)
    setFormOpen(true)
  }

  const openEditDialog = (workspace: PartnerWorkspace) => {
    setEditingWorkspace(workspace)
    setFormError(undefined)
    setFormOpen(true)
  }

  const closeFormDialog = () => {
    if (saving) return
    setFormOpen(false)
    setEditingWorkspace(null)
    setFormError(undefined)
  }

  return (
    <div className="px-4 pb-20 pt-8 sm:px-6 lg:px-8 lg:pt-10">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-4xl">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">Admin</p>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">파트너 운영 큐</h1>
          <p className="mt-2 text-[13px] leading-6 text-[#1a1a1a]/55">
            등록된 파트너 목록보다 <strong className="text-[#111110]">지금 손이 가야 하는 파트너</strong>가 먼저 보이도록 큐 중심으로 재정렬합니다.
            운영자는 이 화면에서 계약 대기, 실행 중, 정산 지연, 리스크 상태를 빠르게 훑고 바로 상세로 들어갑니다.
          </p>
        </div>
        <Button onClick={openCreateDialog} className="gap-1.5 self-start" disabled={saving}>
          <Plus className="h-4 w-4" />
          파트너 추가
        </Button>
      </div>

      <div className="mb-6 rounded-2xl border border-[#dce8ff] bg-[#f7faff] px-5 py-4">
        <div className="flex items-start gap-3">
          <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-[#2f6fed]" />
          <div>
            <p className="text-[13px] font-semibold text-[#173b8f]">운영 큐 기준</p>
            <p className="mt-1 text-[12px] leading-5 text-[#3052a0]">
              `계약 대기`, `설치 진행`, `정산 지연`, `이슈 필요`를 우선 큐로 두고, 검색과 상태 필터는 보조 수단으로 사용합니다.
            </p>
          </div>
        </div>
      </div>

      {warning && (
        <div className="mb-6 rounded-2xl border border-[#f1dfb1] bg-[#fff9eb] px-5 py-4 text-[12px] leading-5 text-[#7b5b14]">
          <strong className="mr-2">데이터 소스:</strong>
          {source === "supabase" ? "Supabase" : "Local"}
          <span className="ml-2">{warning}</span>
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-5">
        {[
          {
            label: "활성 파트너",
            value: insights.filter((insight) => insight.workspace.partner.status === "active").length,
            sub: `${insights.length}개 전체`,
            icon: <Users className="h-4 w-4 text-[#111110]" />,
            accent: "bg-[#f0f0ec]",
          },
          {
            label: "계약 대기",
            value: totalContractWaiting,
            sub: "견적/계약 검토 필요",
            icon: <Handshake className="h-4 w-4 text-blue-600" />,
            accent: "bg-blue-50",
          },
          {
            label: "실행 중",
            value: totalFulfillmentActive,
            sub: "후속/설치 일정 진행",
            icon: <ClipboardList className="h-4 w-4 text-emerald-600" />,
            accent: "bg-emerald-50",
          },
          {
            label: "정산 지연",
            value: totalSettlementDelayed,
            sub: "영수증/정산 우선 확인",
            icon: <Receipt className="h-4 w-4 text-amber-600" />,
            accent: "bg-amber-50",
          },
          {
            label: "이슈 필요",
            value: totalIssueNeeded,
            sub: "리스크/메모 기반 판단 필요",
            icon: <AlertTriangle className="h-4 w-4 text-rose-600" />,
            accent: "bg-rose-50",
          },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-[#e8e8e4] bg-white p-5">
            <div className={`mb-3 inline-flex rounded-xl p-2 ${item.accent}`}>{item.icon}</div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#1a1a1a]/35">{item.label}</p>
            <p className="mt-1 text-[26px] font-bold leading-none tracking-[-0.03em] text-[#111110]">{item.value}</p>
            <p className="mt-1.5 text-[11px] text-[#1a1a1a]/35">{item.sub}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {QUEUE_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setQueueView(option)}
            className={`rounded-full px-3 py-2 text-[12px] font-medium transition-colors ${
              queueView === option
                ? "bg-[#111110] text-white"
                : "bg-white text-[#1a1a1a]/55 ring-1 ring-[#e8e8e4] hover:text-[#111110]"
            }`}
          >
            {QUEUE_LABEL[option]}
          </button>
        ))}
      </div>

      <div className="mb-8 rounded-2xl border border-[#e8e8e4] bg-white p-5">
        <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-[#111110]">{QUEUE_LABEL[queueView]}</h2>
            <p className="mt-1 text-[12px] leading-5 text-[#1a1a1a]/45">{QUEUE_DESCRIPTION[queueView]}</p>
          </div>
          <p className="text-[12px] text-[#1a1a1a]/40">
            {hasActiveFilters ? `필터 적용 결과 ${filteredInsights.length}개` : `전체 ${filteredInsights.length}개`}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-[1.5fr_0.8fr_0.8fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1a1a1a]/30" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="파트너명, 지역, 담당자, 태그, 운영 문맥 검색"
              className="pl-9"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "all" | PartnerWorkspace["partner"]["status"])}
            className={SELECT_CLASSNAME}
          >
            <option value="all">모든 상태</option>
            <option value="lead">{STATUS_LABEL.lead}</option>
            <option value="active">{STATUS_LABEL.active}</option>
            <option value="paused">{STATUS_LABEL.paused}</option>
            <option value="churn_risk">{STATUS_LABEL.churn_risk}</option>
          </select>
          <select
            value={managerFilter}
            onChange={(event) => setManagerFilter(event.target.value)}
            className={SELECT_CLASSNAME}
          >
            <option value="all">모든 담당자</option>
            {managerOptions.map((manager) => (
              <option key={manager} value={manager}>
                {manager}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.75fr)]">
        <div className="space-y-4">
          {filteredInsights.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[#d9d9d3] bg-white px-6 py-12 text-center">
              <p className="text-[14px] font-semibold text-[#111110]">
                {workspaces.length === 0 ? "등록된 파트너가 없습니다." : "조건에 맞는 파트너가 없습니다."}
              </p>
              <p className="mt-2 text-[12px] leading-5 text-[#1a1a1a]/45">
                {workspaces.length === 0
                  ? "첫 파트너를 등록하면 계약, 실행, 정산 흐름을 같은 운영 큐에서 추적할 수 있습니다."
                  : "큐 필터나 검색어를 조정해 보거나 새 파트너를 추가해보세요."}
              </p>
              <Button onClick={openCreateDialog} className="mt-5 gap-1.5" disabled={saving}>
                <Plus className="h-4 w-4" />
                첫 파트너 추가
              </Button>
            </div>
          )}

          {filteredInsights.map((insight) => {
            const { workspace } = insight
            return (
              <div key={workspace.partner.id} className="rounded-2xl border border-[#e8e8e4] bg-white p-5">
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[16px] font-semibold text-[#111110]">{workspace.partner.name}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[workspace.partner.status]}`}>
                        {STATUS_LABEL[workspace.partner.status]}
                      </span>
                      <span className="rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[11px] text-[#1a1a1a]/45">
                        {workspace.partner.channel}
                      </span>
                      <span className="rounded-full bg-[#fafaf8] px-2 py-0.5 text-[11px] text-[#1a1a1a]/45">
                        {workspace.partner.region || "지역 미정"}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[12px] text-[#1a1a1a]/45">
                      담당 {workspace.partner.accountManager || "미정"} · 대표 {workspace.partner.ownerName} ({workspace.partner.ownerEmail})
                    </p>
                    <p className="mt-1 text-[12px] text-[#1a1a1a]/45">
                      다음 액션 {formatDateLabel(insight.nextActionAt)} · {insight.latestContext}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => openEditDialog(workspace)}
                      disabled={saving}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      수정
                    </Button>
                    <Link
                      href={`/admin/partners/${workspace.partner.id}`}
                      className="inline-flex items-center gap-1 rounded-full bg-[#111110] px-3 py-2 text-[12px] font-medium text-white transition-colors hover:bg-[#111110]/90"
                    >
                      워크스페이스 열기
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>

                <div className="mb-4 flex flex-wrap gap-2">
                  {insight.queueLabels.length > 0 ? (
                    insight.queueLabels.map((label) => (
                      <span
                        key={label}
                        className="rounded-full border border-[#e8e8e4] bg-[#fafaf8] px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/60"
                      >
                        {label}
                      </span>
                    ))
                  ) : (
                    <span className="rounded-full border border-[#e8e8e4] bg-[#fafaf8] px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/60">
                      안정 운영
                    </span>
                  )}
                  {workspace.partner.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-2xl bg-[#fafaf8] px-4 py-3">
                    <span className="block text-[11px] text-[#1a1a1a]/35">계약/거래</span>
                    <strong className="text-[14px] text-[#111110]">{insight.openDeals}건 진행중</strong>
                  </div>
                  <div className="rounded-2xl bg-[#fafaf8] px-4 py-3">
                    <span className="block text-[11px] text-[#1a1a1a]/35">실행 항목</span>
                    <strong className="text-[14px] text-[#111110]">{insight.activeFulfillmentItems}건 예정</strong>
                  </div>
                  <div className="rounded-2xl bg-[#fafaf8] px-4 py-3">
                    <span className="block text-[11px] text-[#1a1a1a]/35">정산 리스크</span>
                    <strong className="text-[14px] text-[#111110]">{insight.overdueReceipts}건 지연</strong>
                  </div>
                  <div className="rounded-2xl bg-[#fafaf8] px-4 py-3">
                    <span className="block text-[11px] text-[#1a1a1a]/35">누적 실적</span>
                    <strong className="text-[14px] text-[#111110]">
                      {insight.totalUnits}대 / {formatCurrency(insight.totalNetAmount)}
                    </strong>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-[#e8e8e4] bg-white p-6">
            <h2 className="text-[14px] font-semibold text-[#111110]">큐 해석 가이드</h2>
            <ul className="mt-4 space-y-3 text-[12px] leading-5 text-[#1a1a1a]/55">
              <li className="rounded-xl bg-[#fafaf8] px-4 py-3">
                <strong className="block text-[#111110]">계약 대기</strong>
                견적 발송 또는 계약 검토가 남아 있는 거래가 있는 파트너
              </li>
              <li className="rounded-xl bg-[#fafaf8] px-4 py-3">
                <strong className="block text-[#111110]">설치 진행</strong>
                예정된 후속/설치 일정이 남아 있어 실행 추적이 필요한 파트너
              </li>
              <li className="rounded-xl bg-[#fafaf8] px-4 py-3">
                <strong className="block text-[#111110]">정산 지연</strong>
                연체 영수증이 있어 우선 확인이 필요한 파트너
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-[#e8e8e4] bg-white p-6">
            <h2 className="text-[14px] font-semibold text-[#111110]">빠른 액션</h2>
            <div className="mt-4 space-y-3 text-[12px] leading-5 text-[#1a1a1a]/55">
              <div className="rounded-xl bg-[#fafaf8] px-4 py-3">
                <strong className="block text-[#111110]">새 파트너 등록</strong>
                리드 또는 신규 협력사를 즉시 큐에 올립니다.
              </div>
              <div className="rounded-xl bg-[#fafaf8] px-4 py-3">
                <strong className="block text-[#111110]">거래 시작</strong>
                상세 워크스페이스에서 견적/계약 흐름을 바로 시작합니다.
              </div>
              <div className="rounded-xl bg-[#fafaf8] px-4 py-3">
                <strong className="block text-[#111110]">실행 항목 정리</strong>
                상세의 Fulfillment 탭에서 후속/설치 흐름을 관리합니다.
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#e8e8e4] bg-white p-6">
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <h2 className="text-[14px] font-semibold text-[#111110]">운영 메모</h2>
            </div>
            <p className="text-[12px] leading-5 text-[#1a1a1a]/50">
              리스트에서는 큐 우선순위만 보고, 상세에서는 `Workspace / Deal Flow / Fulfillment / Documents / Logs & Issues`
              순으로 맥락과 다음 액션을 이어보는 흐름을 기본으로 삼습니다.
            </p>
          </div>
        </div>
      </div>

      <PartnerFormDialog
        key={`${formOpen ? "open" : "closed"}-${editingWorkspace?.partner.id ?? "new"}`}
        open={formOpen}
        initialPartner={editingWorkspace?.partner}
        error={formError}
        loading={saving}
        onClose={closeFormDialog}
        onSave={handleSavePartner}
      />
    </div>
  )
}
