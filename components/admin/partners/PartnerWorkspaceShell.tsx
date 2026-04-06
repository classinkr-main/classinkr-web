"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardList,
  FileText,
  Handshake,
  Pencil,
  Plus,
  Receipt,
  TrendingUp,
  Zap,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type {
  PartnerActivityLog,
  PartnerDataSource,
  PartnerDeal,
  PartnerDocument,
  PartnerOpsChecklistItem,
  PartnerOpsIssue,
  PartnerSalesRecord,
  PartnerScheduleItem,
  PartnerWorkspace,
} from "@/lib/partners-types"

export type PartnerWorkspaceTab =
  | "overview"
  | "deal-flow"
  | "fulfillment"
  | "documents"
  | "logs-issues"
  | "automations"

interface PartnerChecklistLike {
  id: string
  title: string
  checklistGroup?: string
  itemName?: string
  plannedQuantity?: number
  confirmedQuantity?: number
  installStatus?: string
  todoStatus?: string
  owner?: string
  dueAt?: string
  notes?: string
}

interface PartnerIssueLike {
  id: string
  title: string
  category?: string
  severity?: string
  status?: string
  owner?: string
  dueAt?: string
}

interface PartnerActivityLogLike {
  id: string
  action?: string
  summary: string
  actor?: string
  occurredAt?: string
  status?: string
}

type WorkspaceWithOps = PartnerWorkspace & {
  checklists?: PartnerChecklistLike[]
  issues?: PartnerIssueLike[]
  activityLogs?: PartnerActivityLogLike[]
}

interface PartnerWorkspaceShellProps {
  workspace: PartnerWorkspace
  source: PartnerDataSource
  warning?: string
  errorMessage?: string | null
  activeTab: PartnerWorkspaceTab
  onTabChange: (tab: PartnerWorkspaceTab) => void
  onEditPartner: () => void
  onCreateDeal: () => void
  onEditDeal: (deal: PartnerDeal) => void
  onCreateSchedule: () => void
  onEditSchedule: (item: PartnerScheduleItem) => void
  onCreateChecklist: () => void
  onEditChecklist: (item: PartnerOpsChecklistItem) => void
  onCreateDocument: () => void
  onEditDocument: (document: PartnerDocument) => void
  onCreateSales: () => void
  onEditSales: (sale: PartnerSalesRecord) => void
  onCreateIssue: () => void
  onEditIssue: (issue: PartnerOpsIssue) => void
  onCreateActivityLog: () => void
  onEditActivityLog: (log: PartnerActivityLog) => void
}

const DEAL_STAGE_LABEL = {
  discovery: "발굴",
  quoted: "견적 준비",
  contract_sent: "계약 발송",
  active: "진행중",
  closed_won: "성사",
  closed_lost: "종료",
} as const

const DOCUMENT_KIND_LABEL = {
  quote: "견적서",
  contract: "계약서",
  receipt: "영수증",
} as const

const DOCUMENT_STATUS_LABEL = {
  draft: "초안",
  sent: "발송됨",
  signed: "서명완료",
  paid: "정산완료",
  overdue: "연체",
  archived: "보관",
} as const

const SCHEDULE_KIND_LABEL = {
  meeting: "미팅",
  follow_up: "후속",
  deadline: "마감",
  renewal: "갱신",
} as const

const SCHEDULE_STATUS_LABEL = {
  planned: "예정",
  completed: "완료",
  canceled: "취소",
} as const

const AUTOMATION_STATUS_LABEL = {
  active: "Active",
  paused: "Paused",
} as const

function formatCurrency(value: number) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDateTimeDisplay(value?: string) {
  if (!value) return "미정"
  return value.trim().slice(0, 16).replace("T", " ")
}

function SurfaceSection({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-[#e8e8e4] bg-white p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[14px] font-semibold text-[#111110]">{title}</h2>
          {description && <p className="mt-1 text-[12px] leading-5 text-[#1a1a1a]/45">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function EmptyPanel({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#d9d9d3] bg-white px-6 py-12 text-center">
      <p className="text-[14px] font-semibold text-[#111110]">{title}</p>
      <p className="mt-2 text-[12px] leading-5 text-[#1a1a1a]/45">{description}</p>
    </div>
  )
}

export default function PartnerWorkspaceShell({
  workspace: rawWorkspace,
  source,
  warning,
  errorMessage,
  activeTab,
  onTabChange,
  onEditPartner,
  onCreateDeal,
  onEditDeal,
  onCreateSchedule,
  onEditSchedule,
  onCreateChecklist,
  onEditChecklist,
  onCreateDocument,
  onEditDocument,
  onCreateSales,
  onEditSales,
  onCreateIssue,
  onEditIssue,
  onCreateActivityLog,
  onEditActivityLog,
}: PartnerWorkspaceShellProps) {
  const workspace = rawWorkspace as WorkspaceWithOps
  const checklists = workspace.checklists ?? []
  const issues = workspace.issues ?? []
  const activityLogs = workspace.activityLogs ?? []
  const totalNetSales = workspace.sales.reduce((sum, sale) => sum + sale.netAmount, 0)
  const totalUnits = workspace.sales.reduce((sum, sale) => sum + sale.unitsSold, 0)
  const pendingDocuments = workspace.documents.filter((document) =>
    ["draft", "sent", "overdue"].includes(document.status)
  )
  const openIssues = issues.filter((issue) => issue.status !== "resolved")
  const openChecklistItems = checklists.filter((item) => item.todoStatus !== "done" && item.todoStatus !== "canceled")
  const upcomingSchedule = workspace.schedule.filter((item) => item.status === "planned")

  return (
    <div className="px-4 pb-20 pt-8 sm:px-6 lg:px-8 lg:pt-10">
      <div className="mb-8">
        <Link
          href="/admin/partners"
          className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-[#1a1a1a]/45 transition-colors hover:text-[#111110]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          파트너 운영 큐로 돌아가기
        </Link>

        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-4xl">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">Partner Workspace</p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">{workspace.partner.name}</h1>
              <Badge variant="outline" className="border-[#e8e8e4] bg-white text-[#1a1a1a]/60">
                {workspace.partner.region}
              </Badge>
              <Badge variant="outline" className="border-[#e8e8e4] bg-white text-[#1a1a1a]/60">
                {workspace.partner.channel}
              </Badge>
            </div>
            <p className="mt-2 text-[13px] leading-6 text-[#1a1a1a]/55">
              담당 {workspace.partner.accountManager || "미정"} · 대표 연락처 {workspace.partner.ownerName} ({workspace.partner.ownerEmail}) ·
              다음 액션 {formatDateTimeDisplay(workspace.partner.nextActionAt)}
            </p>
          </div>

          <div className="w-full max-w-sm space-y-3 xl:w-auto">
            <div className="rounded-2xl border border-[#e8e8e4] bg-white px-4 py-3 text-[12px] text-[#1a1a1a]/55">
              <strong className="block text-[#111110]">운영 메모</strong>
              <span className="mt-1 block">{workspace.partner.notes ?? "메모 없음"}</span>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onEditPartner}>
              <Pencil className="h-3.5 w-3.5" />
              파트너 정보 수정
            </Button>
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

      {errorMessage && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-[12px] leading-5 text-red-700">
          <strong className="mr-2">저장 오류:</strong>
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-6">
        {[
          {
            label: "메인 거래",
            value: workspace.deals[0] ? DEAL_STAGE_LABEL[workspace.deals[0].stage] : "없음",
            sub: workspace.deals[0]?.title ?? "거래 없음",
            icon: <Handshake className="h-4 w-4 text-blue-600" />,
            accent: "bg-blue-50",
          },
          {
            label: "오늘 처리",
            value: openChecklistItems.length || upcomingSchedule.length,
            sub: "체크리스트/예정 일정",
            icon: <ClipboardList className="h-4 w-4 text-emerald-600" />,
            accent: "bg-emerald-50",
          },
          {
            label: "판단 필요",
            value: openIssues.length,
            sub: "오픈 이슈",
            icon: <AlertTriangle className="h-4 w-4 text-rose-600" />,
            accent: "bg-rose-50",
          },
          {
            label: "확인 문서",
            value: pendingDocuments.length,
            sub: "견적/계약/영수증",
            icon: <Receipt className="h-4 w-4 text-amber-600" />,
            accent: "bg-amber-50",
          },
          {
            label: "누적 판매",
            value: totalUnits,
            sub: "집계 기준",
            icon: <TrendingUp className="h-4 w-4 text-[#111110]" />,
            accent: "bg-[#f0f0ec]",
          },
          {
            label: "누적 순매출",
            value: formatCurrency(totalNetSales),
            sub: "실적 합계",
            icon: <FileText className="h-4 w-4 text-violet-600" />,
            accent: "bg-violet-50",
          },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-[#e8e8e4] bg-white p-5">
            <div className={`mb-3 inline-flex rounded-xl p-2 ${card.accent}`}>{card.icon}</div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#1a1a1a]/35">{card.label}</p>
            <p className="mt-1 text-[20px] font-bold leading-none tracking-[-0.03em] text-[#111110]">{card.value}</p>
            <p className="mt-1.5 text-[11px] text-[#1a1a1a]/35">{card.sub}</p>
          </div>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as PartnerWorkspaceTab)}>
        <TabsList className="mb-6 h-auto w-full flex-wrap justify-start rounded-2xl border border-[#e8e8e4] bg-white p-1">
          <TabsTrigger value="overview" className="rounded-xl px-4 py-2 text-[13px]">Workspace</TabsTrigger>
          <TabsTrigger value="deal-flow" className="rounded-xl px-4 py-2 text-[13px]">Deal Flow</TabsTrigger>
          <TabsTrigger value="fulfillment" className="rounded-xl px-4 py-2 text-[13px]">Fulfillment</TabsTrigger>
          <TabsTrigger value="documents" className="rounded-xl px-4 py-2 text-[13px]">Documents</TabsTrigger>
          <TabsTrigger value="logs-issues" className="rounded-xl px-4 py-2 text-[13px]">Logs &amp; Issues</TabsTrigger>
          <TabsTrigger value="automations" className="rounded-xl px-4 py-2 text-[13px]">Automations</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <SurfaceSection title="오늘의 실행 큐" description="가장 먼저 처리할 일정, 문서, 이슈를 한 곳에 모아 둡니다.">
              <div className="grid gap-3 md:grid-cols-2">
                {upcomingSchedule.slice(0, 2).map((item) => (
                  <div key={item.id} className="rounded-2xl bg-[#fafaf8] p-4">
                    <p className="text-[12px] font-medium text-[#111110]">{item.title}</p>
                    <p className="mt-1 text-[12px] leading-5 text-[#1a1a1a]/50">
                      {formatDateTimeDisplay(item.startsAt)} · {item.owner || "담당 미정"}
                    </p>
                  </div>
                ))}
                {pendingDocuments.slice(0, 2).map((document) => (
                  <div key={document.id} className="rounded-2xl bg-[#fafaf8] p-4">
                    <p className="text-[12px] font-medium text-[#111110]">{document.title}</p>
                    <p className="mt-1 text-[12px] leading-5 text-[#1a1a1a]/50">
                      {DOCUMENT_KIND_LABEL[document.kind]} · {DOCUMENT_STATUS_LABEL[document.status]}
                    </p>
                  </div>
                ))}
                {openIssues.slice(0, 1).map((issue) => (
                  <div key={issue.id} className="rounded-2xl bg-rose-50 p-4">
                    <p className="text-[12px] font-medium text-[#111110]">{issue.title}</p>
                    <p className="mt-1 text-[12px] leading-5 text-[#7f1d1d]">
                      {issue.status ?? "open"} · {issue.owner ?? "담당 미정"}
                    </p>
                  </div>
                ))}
                {upcomingSchedule.length === 0 && pendingDocuments.length === 0 && openIssues.length === 0 && (
                  <div className="rounded-2xl bg-[#fafaf8] px-4 py-6 text-center text-[12px] text-[#1a1a1a]/45 md:col-span-2">
                    아직 오늘 처리할 항목이 없습니다.
                  </div>
                )}
              </div>
            </SurfaceSection>

            <SurfaceSection title="최근 맥락" description="왜 지금 이 상태인지 설명해주는 최근 이벤트를 빠르게 봅니다.">
              <ul className="space-y-3 text-[12px] leading-5 text-[#1a1a1a]/55">
                {activityLogs.slice(0, 4).map((log) => (
                  <li key={log.id} className="rounded-2xl bg-[#fafaf8] px-4 py-3">
                    <strong className="block text-[#111110]">{log.summary}</strong>
                    <span>{log.actor ?? "기록자 미정"} · {formatDateTimeDisplay(log.occurredAt)}</span>
                  </li>
                ))}
                {activityLogs.length === 0 && (
                  <li className="rounded-2xl bg-[#fafaf8] px-4 py-6 text-center text-[#1a1a1a]/45">
                    활동 로그가 연결되면 이 영역에 미팅/계약/정산 맥락이 모입니다.
                  </li>
                )}
              </ul>
            </SurfaceSection>
          </div>
        </TabsContent>

        <TabsContent value="deal-flow">
          <div className="space-y-6">
            <SurfaceSection
              title="거래 흐름"
              description="견적, 계약, 판매 흐름을 하나의 파이프라인으로 관리합니다."
              action={
                <Button size="sm" className="gap-1.5" onClick={onCreateDeal}>
                  <Plus className="h-3.5 w-3.5" />
                  거래 추가
                </Button>
              }
            >
              <div className="space-y-4">
                {workspace.deals.length === 0 ? (
                  <EmptyPanel title="등록된 거래가 없습니다." description="첫 거래를 만들고 이후 단계 CTA를 이어붙이는 흐름으로 관리합니다." />
                ) : (
                  workspace.deals.map((deal) => (
                    <div key={deal.id} className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-[15px] font-semibold text-[#111110]">{deal.title}</h3>
                            <Badge variant="outline" className="border-[#e8e8e4] bg-white text-[#1a1a1a]/55">
                              {DEAL_STAGE_LABEL[deal.stage]}
                            </Badge>
                          </div>
                          <p className="mt-2 text-[12px] leading-5 text-[#1a1a1a]/50">
                            담당 {deal.manager || "미정"} · 예상 마감 {deal.expectedCloseAt ?? "미정"} · 판매 댓수 {deal.salesUnits}대
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                            <span className="rounded-full bg-white px-2.5 py-1 text-[#1a1a1a]/55">다음 단계: 계약 문서 생성</span>
                            <span className="rounded-full bg-white px-2.5 py-1 text-[#1a1a1a]/55">다음 단계: 이행 체크 생성</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="rounded-2xl bg-white px-4 py-3 text-right">
                            <span className="block text-[11px] text-[#1a1a1a]/35">거래 금액</span>
                            <strong className="text-[16px] text-[#111110]">{formatCurrency(deal.quoteAmount)}</strong>
                          </div>
                          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onEditDeal(deal)}>
                            <Pencil className="h-3.5 w-3.5" />
                            수정
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </SurfaceSection>

            <SurfaceSection
              title="판매 실적"
              description="거래 흐름과 이어지는 월별 판매 실적을 같은 문맥에서 관리합니다."
              action={
                <Button size="sm" className="gap-1.5" onClick={onCreateSales}>
                  <Plus className="h-3.5 w-3.5" />
                  실적 추가
                </Button>
              }
            >
              <div className="space-y-3">
                {workspace.sales.length === 0 ? (
                  <EmptyPanel title="아직 누적된 판매 기록이 없습니다." description="설치 완료 후 실적과 정산 흐름을 이어서 기록합니다." />
                ) : (
                  workspace.sales.map((sale) => (
                    <div key={sale.id} className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-5 py-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="grid grid-cols-2 gap-3 text-[12px] md:grid-cols-4">
                          <div>
                            <span className="block text-[#1a1a1a]/35">월</span>
                            <strong className="text-[#111110]">{sale.salesMonth.slice(0, 7)}</strong>
                          </div>
                          <div>
                            <span className="block text-[#1a1a1a]/35">판매 댓수</span>
                            <strong className="text-[#111110]">{sale.unitsSold}대</strong>
                          </div>
                          <div>
                            <span className="block text-[#1a1a1a]/35">총액</span>
                            <strong className="text-[#111110]">{formatCurrency(sale.grossAmount)}</strong>
                          </div>
                          <div>
                            <span className="block text-[#1a1a1a]/35">순매출</span>
                            <strong className="text-[#111110]">{formatCurrency(sale.netAmount)}</strong>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="gap-1.5 self-start" onClick={() => onEditSales(sale)}>
                          <Pencil className="h-3.5 w-3.5" />
                          수정
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </SurfaceSection>
          </div>
        </TabsContent>

        <TabsContent value="fulfillment">
          <div className="space-y-6">
            <SurfaceSection
              title="이행 체크"
              description="설치/후속/마감 흐름을 독립 탭으로 다룹니다. checklist 데이터가 연결되면 여기서 품목/수량 기반으로 확장됩니다."
              action={
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" className="gap-1.5" onClick={onCreateChecklist}>
                    <Plus className="h-3.5 w-3.5" />
                    체크 추가
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={onCreateSchedule}>
                    <Plus className="h-3.5 w-3.5" />
                    일정 추가
                  </Button>
                </div>
              }
            >
              {checklists.length > 0 ? (
                <div className="space-y-3">
                  {checklists.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-5 py-4 text-[12px]">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className="text-[13px] text-[#111110]">{item.title}</strong>
                            {item.checklistGroup && (
                              <span className="rounded-full bg-white px-2 py-0.5 text-[#1a1a1a]/55">{item.checklistGroup}</span>
                            )}
                          </div>
                          <p className="mt-2 text-[#1a1a1a]/50">
                            상태 {item.installStatus ?? "planned"} · TODO {item.todoStatus ?? "open"} · 담당 {item.owner ?? "미정"}
                          </p>
                          {(item.itemName || item.plannedQuantity != null || item.confirmedQuantity != null) && (
                            <p className="mt-1 text-[#1a1a1a]/40">
                              {item.itemName ? `품목 ${item.itemName}` : "품목 미지정"}
                              {item.plannedQuantity != null ? ` · 계획 ${item.plannedQuantity}` : ""}
                              {item.confirmedQuantity != null ? ` · 확정 ${item.confirmedQuantity}` : ""}
                            </p>
                          )}
                        </div>
                        <Button variant="outline" size="sm" className="gap-1.5 self-start" onClick={() => onEditChecklist(item as PartnerOpsChecklistItem)}>
                          <Pencil className="h-3.5 w-3.5" />
                          수정
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : workspace.schedule.length > 0 ? (
                <div className="space-y-3">
                  {workspace.schedule.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-5 py-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="border-[#e8e8e4] bg-white text-[#1a1a1a]/55">
                              {SCHEDULE_KIND_LABEL[item.kind]}
                            </Badge>
                            <h3 className="text-[13px] font-semibold text-[#111110]">{item.title}</h3>
                          </div>
                          <p className="mt-1 text-[12px] leading-5 text-[#1a1a1a]/50">
                            {formatDateTimeDisplay(item.startsAt)}
                            {item.endsAt ? ` - ${formatDateTimeDisplay(item.endsAt)}` : ""} · 담당 {item.owner || "미정"} · 상태 {SCHEDULE_STATUS_LABEL[item.status]}
                          </p>
                        </div>
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onEditSchedule(item)}>
                          <Pencil className="h-3.5 w-3.5" />
                          수정
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyPanel
                  title="아직 이행 체크 데이터가 없습니다."
                  description="지금은 일정 기반 실행 항목을 먼저 보여주고, checklist 데이터가 연결되면 품목/수량 중심 UI로 확장합니다."
                />
              )}
            </SurfaceSection>
          </div>
        </TabsContent>

        <TabsContent value="documents">
          <SurfaceSection
            title="문서 운영"
            description="문서 원본과 전달 상태를 한 문맥에서 보도록 구조를 준비합니다."
            action={
              <Button size="sm" className="gap-1.5" onClick={onCreateDocument}>
                <Plus className="h-3.5 w-3.5" />
                문서 추가
              </Button>
            }
          >
            <div className="space-y-4">
              {workspace.documents.length === 0 ? (
                <EmptyPanel title="등록된 문서가 없습니다." description="견적서, 계약서, 영수증을 거래와 연결해두면 정산 누락을 줄일 수 있습니다." />
              ) : (
                workspace.documents.map((document) => (
                  <div key={document.id} className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[14px] font-semibold text-[#111110]">{document.title}</h3>
                          <Badge variant="outline" className="border-[#e8e8e4] bg-white text-[#1a1a1a]/55">
                            {DOCUMENT_KIND_LABEL[document.kind]}
                          </Badge>
                          <Badge variant="outline" className="border-[#e8e8e4] bg-white text-[#1a1a1a]/55">
                            {DOCUMENT_STATUS_LABEL[document.status]}
                          </Badge>
                        </div>
                        <p className="mt-2 text-[12px] leading-5 text-[#1a1a1a]/50">
                          발행 {document.issuedAt ?? "미정"} · 마감 {document.dueAt ?? "미정"} · 파일 {document.fileLabel}
                        </p>
                        <p className="mt-1 text-[11px] text-[#1a1a1a]/40">
                          Phase 1에서는 전달 상태 요약과 만료/열람 정보가 데이터 연결 시 이곳에 함께 표시됩니다.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {document.amount != null && (
                          <div className="rounded-2xl bg-white px-4 py-3 text-right text-[12px]">
                            <span className="block text-[#1a1a1a]/35">금액</span>
                            <strong className="text-[15px] text-[#111110]">{formatCurrency(document.amount)}</strong>
                          </div>
                        )}
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onEditDocument(document)}>
                          <Pencil className="h-3.5 w-3.5" />
                          수정
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </SurfaceSection>
        </TabsContent>

        <TabsContent value="logs-issues">
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <SurfaceSection
              title="운영 로그"
              description="미팅, 계약, 후속, 내부 메모 흐름을 여기에 모읍니다."
              action={
                <Button size="sm" className="gap-1.5" onClick={onCreateActivityLog}>
                  <Plus className="h-3.5 w-3.5" />
                  로그 추가
                </Button>
              }
            >
              <div className="space-y-3">
                {activityLogs.length > 0 ? (
                  activityLogs.map((log) => (
                    <div key={log.id} className="rounded-2xl bg-[#fafaf8] px-4 py-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <strong className="block text-[13px] text-[#111110]">{log.summary}</strong>
                          <p className="mt-1 text-[12px] leading-5 text-[#1a1a1a]/50">
                            {log.action ?? "activity"} · {log.actor ?? "작성자 미정"} · {formatDateTimeDisplay(log.occurredAt)}
                          </p>
                          {log.nextAction && <p className="mt-1 text-[12px] text-[#1a1a1a]/40">다음 액션 {log.nextAction}</p>}
                        </div>
                        <Button variant="outline" size="sm" className="gap-1.5 self-start" onClick={() => onEditActivityLog(log as PartnerActivityLog)}>
                          <Pencil className="h-3.5 w-3.5" />
                          수정
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <>
                    {workspace.schedule.slice(0, 2).map((item) => (
                      <div key={item.id} className="rounded-2xl bg-[#fafaf8] px-4 py-3">
                        <strong className="block text-[13px] text-[#111110]">{item.title}</strong>
                        <p className="mt-1 text-[12px] leading-5 text-[#1a1a1a]/50">
                          일정 · {formatDateTimeDisplay(item.startsAt)} · {item.owner || "담당 미정"}
                        </p>
                      </div>
                    ))}
                    {workspace.partner.notes && (
                      <div className="rounded-2xl bg-[#fafaf8] px-4 py-3">
                        <strong className="block text-[13px] text-[#111110]">운영 메모</strong>
                        <p className="mt-1 text-[12px] leading-5 text-[#1a1a1a]/50">{workspace.partner.notes}</p>
                      </div>
                    )}
                    {workspace.schedule.length === 0 && !workspace.partner.notes && (
                      <div className="rounded-2xl bg-[#fafaf8] px-4 py-6 text-center text-[12px] text-[#1a1a1a]/45">
                        활동 로그 데이터가 연결되면 이 영역에서 타임라인을 관리합니다.
                      </div>
                    )}
                  </>
                )}
              </div>
            </SurfaceSection>

            <SurfaceSection
              title="판단 필요 이슈"
              description="notes에 묻히지 않는 독립 이슈 모듈의 자리를 먼저 확보합니다."
              action={
                <Button size="sm" className="gap-1.5" onClick={onCreateIssue}>
                  <Plus className="h-3.5 w-3.5" />
                  이슈 추가
                </Button>
              }
            >
              <div className="space-y-3">
                {issues.length > 0 ? (
                  issues.map((issue) => (
                    <div key={issue.id} className="rounded-2xl bg-rose-50 px-4 py-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <strong className="block text-[13px] text-[#111110]">{issue.title}</strong>
                          <p className="mt-1 text-[12px] leading-5 text-[#7f1d1d]">
                            {issue.category ?? "issue"} · {issue.severity ?? "medium"} · {issue.status ?? "open"}
                          </p>
                          {(issue.owner || issue.dueAt) && (
                            <p className="mt-1 text-[12px] text-[#7f1d1d]/80">
                              담당 {issue.owner ?? "미정"}{issue.dueAt ? ` · 마감 ${formatDateTimeDisplay(issue.dueAt)}` : ""}
                            </p>
                          )}
                        </div>
                        <Button variant="outline" size="sm" className="gap-1.5 self-start border-rose-200 bg-white" onClick={() => onEditIssue(issue as PartnerOpsIssue)}>
                          <Pencil className="h-3.5 w-3.5" />
                          수정
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-[#d9d9d3] bg-white px-5 py-10 text-center">
                    <p className="text-[14px] font-semibold text-[#111110]">아직 등록된 이슈가 없습니다.</p>
                    <p className="mt-2 text-[12px] leading-5 text-[#1a1a1a]/45">
                      계약/설치/정산/내부 판단 이슈가 연결되면 이 영역에서 상태와 담당자를 관리합니다.
                    </p>
                  </div>
                )}
              </div>
            </SurfaceSection>
          </div>
        </TabsContent>

        <TabsContent value="automations">
          <div className="space-y-4">
            {workspace.automations.length === 0 ? (
              <EmptyPanel title="설정된 자동화가 없습니다." description="견적 만료, 연체 영수증, 월말 판매 집계부터 자동화하면 운영 부담을 크게 줄일 수 있습니다." />
            ) : (
              workspace.automations.map((automation) => (
                <div key={automation.id} className="rounded-2xl border border-[#e8e8e4] bg-white p-6">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-[#111110]/55" />
                        <h2 className="text-[14px] font-semibold text-[#111110]">{automation.name}</h2>
                      </div>
                      <p className="mt-2 text-[12px] text-[#1a1a1a]/50">
                        Trigger: {automation.trigger} · Action: {automation.action}
                      </p>
                      <p className="mt-1 text-[12px] text-[#1a1a1a]/50">Destination: {automation.destination}</p>
                    </div>
                    <div className="rounded-2xl bg-[#fafaf8] px-4 py-3 text-[12px] text-[#1a1a1a]/55">
                      <strong className="block text-[#111110]">{AUTOMATION_STATUS_LABEL[automation.status]}</strong>
                      <span className="mt-1 block">
                        최근 실행 {automation.lastRunAt ? formatDateTimeDisplay(automation.lastRunAt) : "없음"}
                      </span>
                      <span className="block">다음 실행 {formatDateTimeDisplay(automation.nextRunAt)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
