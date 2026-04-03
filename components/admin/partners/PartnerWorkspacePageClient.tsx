"use client"

import Link from "next/link"
import { useState } from "react"
import {
  ArrowRight,
  BellRing,
  CalendarDays,
  Handshake,
  Pencil,
  Plus,
  Receipt,
  TrendingUp,
  Users,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import PartnerFormDialog from "@/components/admin/partners/PartnerFormDialog"
import type { PartnerDataSource, PartnerSummaryInput, PartnerWorkspace } from "@/lib/partners-types"

interface PartnerWorkspacePageClientProps {
  initialWorkspaces: PartnerWorkspace[]
  initialSource: PartnerDataSource
  initialWarning?: string
}

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

const STATUS_STYLE = {
  lead: "bg-blue-50 text-blue-700",
  active: "bg-emerald-50 text-emerald-700",
  paused: "bg-slate-100 text-slate-600",
  churn_risk: "bg-amber-50 text-amber-700",
} as const

const STATUS_LABEL = {
  lead: "신규",
  active: "활성",
  paused: "보류",
  churn_risk: "리스크",
} as const

const SELECT_CLASSNAME =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

const MODULES = [
  {
    title: "거래",
    description: "견적, 계약, 판매 댓수를 하나의 거래 흐름으로 묶습니다.",
    icon: Handshake,
  },
  {
    title: "일정",
    description: "후속 연락, 미팅, 마감 일정을 파트너/거래 문맥으로 관리합니다.",
    icon: CalendarDays,
  },
  {
    title: "정산/문서",
    description: "영수증과 첨부 문서를 정산 상태와 함께 추적합니다.",
    icon: Receipt,
  },
] as const

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
  const [statusFilter, setStatusFilter] = useState<"all" | PartnerWorkspace["partner"]["status"]>("all")
  const [managerFilter, setManagerFilter] = useState("all")

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const managerOptions = Array.from(new Set(workspaces.map((workspace) => workspace.partner.accountManager).filter(Boolean))).sort(
    (left, right) => left.localeCompare(right, "ko")
  )
  const filteredWorkspaces = workspaces.filter((workspace) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      [
        workspace.partner.name,
        workspace.partner.region,
        workspace.partner.accountManager,
        workspace.partner.ownerName,
        workspace.partner.ownerEmail,
        workspace.partner.notes ?? "",
        workspace.partner.tags.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)

    const matchesStatus = statusFilter === "all" || workspace.partner.status === statusFilter
    const matchesManager = managerFilter === "all" || workspace.partner.accountManager === managerFilter
    return matchesQuery && matchesStatus && matchesManager
  })
  const hasActiveFilters = normalizedQuery.length > 0 || statusFilter !== "all" || managerFilter !== "all"

  const activePartners = filteredWorkspaces.filter((workspace) => workspace.partner.status === "active").length
  const openDeals = filteredWorkspaces.flatMap((workspace) => workspace.deals).filter((deal) =>
    ["discovery", "quoted", "contract_sent", "active"].includes(deal.stage)
  ).length
  const overdueReceipts = filteredWorkspaces.flatMap((workspace) => workspace.documents).filter((document) =>
    document.kind === "receipt" && document.status === "overdue"
  ).length
  const latestSalesMonth = filteredWorkspaces
    .flatMap((workspace) => workspace.sales)
    .map((sale) => sale.salesMonth.slice(0, 7))
    .sort()
    .at(-1)
  const latestSalesUnits = filteredWorkspaces
    .flatMap((workspace) => workspace.sales)
    .filter((sale) => latestSalesMonth && sale.salesMonth.startsWith(latestSalesMonth))
    .reduce((sum, sale) => sum + sale.unitsSold, 0)
  const latestSalesLabel = latestSalesMonth
    ? `${latestSalesMonth.slice(0, 4)}년 ${latestSalesMonth.slice(5, 7)}월 기준`
    : "집계 없음"

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
    <div className="px-8 pt-10 pb-20">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-1">Admin</p>
          <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">파트너 운영</h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[#1a1a1a]/55">
            현재는 내부 운영팀이 사용하는 백오피스 기준으로 <code className="rounded bg-white px-1.5 py-0.5 text-[12px]">/admin/partners</code>에
            두는 편이 가장 자연스럽습니다. <code className="rounded bg-white px-1.5 py-0.5 text-[12px]">/partners</code>는 나중에
            외부 파트너 포털이 필요해질 때 분리하는 용도로 남겨두는 편이 안전합니다.
          </p>
        </div>
        <Button
          onClick={openCreateDialog}
          className="gap-1.5"
          disabled={saving}
        >
          <Plus className="h-4 w-4" />
          파트너 추가
        </Button>
      </div>

      <div className="mb-6 rounded-2xl border border-[#dce8ff] bg-[#f7faff] px-5 py-4">
        <div className="flex items-start gap-3">
          <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-[#2f6fed]" />
          <div>
            <p className="text-[13px] font-semibold text-[#173b8f]">라우트 결정</p>
            <p className="mt-1 text-[12px] leading-5 text-[#3052a0]">
              내부 운영 흐름, 관리자 인증, 사이드바 IA를 그대로 활용하려면 우선 <code>/admin/partners</code>로 시작하는 게 맞습니다.
              외부 파트너가 직접 로그인해서 계약과 정산을 조회하는 순간이 오면 그때 <code>/partners</code>를 별도 포털로 분리하면 됩니다.
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

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          {
            label: hasActiveFilters ? "표시 파트너" : "전체 파트너",
            value: filteredWorkspaces.length,
            sub: hasActiveFilters ? `전체 ${workspaces.length}개 중` : `활성 ${activePartners}`,
            icon: <Users className="h-4 w-4 text-[#111110]" />,
            accent: "bg-[#f0f0ec]",
          },
          {
            label: "진행 거래",
            value: openDeals,
            sub: "견적/계약 진행중",
            icon: <Handshake className="h-4 w-4 text-blue-600" />,
            accent: "bg-blue-50",
          },
          {
            label: "연체 영수증",
            value: overdueReceipts,
            sub: "정산 우선 확인",
            icon: <Receipt className="h-4 w-4 text-amber-600" />,
            accent: "bg-amber-50",
          },
          {
            label: "최신 판매 댓수",
            value: latestSalesUnits,
            sub: latestSalesLabel,
            icon: <TrendingUp className="h-4 w-4 text-emerald-600" />,
            accent: "bg-emerald-50",
          },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-[#e8e8e4] bg-white p-5">
            <div className={`mb-3 inline-flex rounded-xl p-2 ${item.accent}`}>{item.icon}</div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#1a1a1a]/35">{item.label}</p>
            <p className="mt-1 text-[28px] font-bold leading-none tracking-[-0.03em] text-[#111110]">{item.value}</p>
            <p className="mt-1.5 text-[11px] text-[#1a1a1a]/35">{item.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.45fr_0.85fr]">
        <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
          <div className="flex items-center justify-between border-b border-[#e8e8e4] px-6 py-4">
            <div>
              <h2 className="text-[14px] font-semibold text-[#111110]">파트너 워크스페이스</h2>
              <p className="mt-1 text-[12px] text-[#1a1a1a]/40">리스트는 파트너 기준, 상세는 거래/문서/일정/실적 탭으로 구성합니다.</p>
            </div>
            <span className="rounded-full bg-[#f0f0ec] px-2.5 py-1 text-[11px] text-[#1a1a1a]/45">
              {source === "supabase" ? "LIVE" : "LOCAL"}
            </span>
          </div>

          <div className="grid gap-3 border-b border-[#e8e8e4] px-6 py-4 md:grid-cols-[1.4fr_0.8fr_0.8fr]">
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="파트너명, 지역, 담당자, 태그 검색"
            />
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

          <div className="divide-y divide-[#e8e8e4]">
            {filteredWorkspaces.length === 0 && (
              <div className="px-6 py-12 text-center">
                <p className="text-[14px] font-semibold text-[#111110]">
                  {workspaces.length === 0 ? "등록된 파트너가 없습니다." : "조건에 맞는 파트너가 없습니다."}
                </p>
                <p className="mt-2 text-[12px] leading-5 text-[#1a1a1a]/45">
                  {workspaces.length === 0
                    ? "첫 파트너를 등록하면 거래, 일정, 정산, 판매 기록을 한 워크스페이스에서 관리할 수 있습니다."
                    : "검색어와 필터를 조정하거나 새 파트너를 등록해보세요."}
                </p>
                {workspaces.length === 0 && (
                  <Button onClick={openCreateDialog} className="mt-5 gap-1.5" disabled={saving}>
                    <Plus className="h-4 w-4" />
                    첫 파트너 추가
                  </Button>
                )}
              </div>
            )}

            {filteredWorkspaces.map((workspace) => {
              const pendingDocs = workspace.documents.filter((document) =>
                ["draft", "sent", "overdue"].includes(document.status)
              ).length
              const nextDeal = workspace.deals.find((deal) =>
                ["quoted", "contract_sent", "active"].includes(deal.stage)
              )

              return (
                <div key={workspace.partner.id} className="px-6 py-5">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[15px] font-semibold text-[#111110]">{workspace.partner.name}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[workspace.partner.status]}`}>
                          {STATUS_LABEL[workspace.partner.status]}
                        </span>
                        <span className="rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[11px] text-[#1a1a1a]/45">
                          {workspace.partner.region || "지역 미정"}
                        </span>
                      </div>
                      <p className="mt-1 text-[12px] text-[#1a1a1a]/45">
                        담당 {workspace.partner.accountManager || "미정"} · 채널 {workspace.partner.channel} · 다음 액션 {workspace.partner.nextActionAt ?? "미정"}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
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
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-[#1a1a1a]/45 transition-colors hover:text-[#111110]"
                      >
                        상세 보기
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>

                  <div className="grid gap-2 text-[12px] text-[#1a1a1a]/60 md:grid-cols-3">
                    <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
                      <span className="block text-[11px] text-[#1a1a1a]/35">진행 거래</span>
                      <strong className="text-[#111110]">{workspace.deals.length}건</strong>
                      {nextDeal && <span className="ml-2 text-[#1a1a1a]/45">{nextDeal.title}</span>}
                    </div>
                    <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
                      <span className="block text-[11px] text-[#1a1a1a]/35">문서/정산</span>
                      <strong className="text-[#111110]">{pendingDocs}건 확인 필요</strong>
                    </div>
                    <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
                      <span className="block text-[11px] text-[#1a1a1a]/35">누적 실적</span>
                      <strong className="text-[#111110]">
                        {workspace.sales.reduce((sum, sale) => sum + sale.unitsSold, 0)}대 / {formatCurrency(
                          workspace.sales.reduce((sum, sale) => sum + sale.netAmount, 0)
                        )}
                      </strong>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-[#e8e8e4] bg-white p-6">
            <h2 className="text-[14px] font-semibold text-[#111110]">권장 모듈 구조</h2>
            <div className="mt-4 space-y-4">
              {MODULES.map((module) => {
                const Icon = module.icon
                return (
                  <div key={module.title} className="rounded-2xl border border-[#f0f0ec] bg-[#fafaf8] p-4">
                    <div className="mb-2 inline-flex rounded-xl bg-white p-2 shadow-sm">
                      <Icon className="h-4 w-4 text-[#111110]" />
                    </div>
                    <p className="text-[13px] font-semibold text-[#111110]">{module.title}</p>
                    <p className="mt-1 text-[12px] leading-5 text-[#1a1a1a]/50">{module.description}</p>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-[#e8e8e4] bg-white p-6">
            <h2 className="text-[14px] font-semibold text-[#111110]">자동화 MVP</h2>
            <ul className="mt-4 space-y-3 text-[12px] leading-5 text-[#1a1a1a]/55">
              <li className="rounded-xl bg-[#fafaf8] px-4 py-3">
                <strong className="block text-[#111110]">견적 만료 알림</strong>
                견적 만료 24시간 전 담당자 알림과 후속 일정 자동 생성
              </li>
              <li className="rounded-xl bg-[#fafaf8] px-4 py-3">
                <strong className="block text-[#111110]">영수증 연체 리마인드</strong>
                미지급/연체 영수증 발생 시 메일 또는 슬랙 재알림
              </li>
              <li className="rounded-xl bg-[#fafaf8] px-4 py-3">
                <strong className="block text-[#111110]">월간 판매 집계</strong>
                판매 댓수와 정산 금액을 월말에 요약해 공유
              </li>
            </ul>
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
