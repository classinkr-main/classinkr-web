"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardList,
  ExternalLink,
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
  PartnerContact,
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

type PartnerDocumentDelivery = PartnerDocument["deliveries"][number]

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
  onCreateContact?: () => void
  onEditContact?: (contact: PartnerContact) => void
  onCreateDeal: (context?: PartnerActionContext) => void
  onEditDeal: (deal: PartnerDeal) => void
  onCreateSchedule: (context?: PartnerActionContext) => void
  onEditSchedule: (item: PartnerScheduleItem) => void
  onCreateChecklist: (context?: PartnerActionContext) => void
  onEditChecklist: (item: PartnerOpsChecklistItem) => void
  onCreateDocument: (context?: PartnerActionContext) => void
  onEditDocument: (document: PartnerDocument) => void
  onCreateSales: (context?: PartnerActionContext) => void
  onEditSales: (sale: PartnerSalesRecord) => void
  onCreateIssue: (context?: PartnerActionContext) => void
  onEditIssue: (issue: PartnerOpsIssue) => void
  onCreateActivityLog: (context?: PartnerActionContext) => void
  onEditActivityLog: (log: PartnerActivityLog) => void
}

interface PartnerActionContext {
  deal?: PartnerDeal
  dealId?: string
  tab?: PartnerWorkspaceTab
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

const DOCUMENT_DELIVERY_CHANNEL_LABEL = {
  pdf: "PDF",
  kakao: "카카오",
  link: "링크",
} as const

const DOCUMENT_DELIVERY_STATUS_LABEL = {
  draft: "초안",
  ready: "준비 완료",
  sent: "전달됨",
  opened: "열람됨",
  expired: "만료",
  revoked: "회수됨",
  failed: "실패",
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

const TODO_STATUS_LABEL = {
  open: "대기",
  waiting_partner: "파트너 대기",
  waiting_internal: "내부 대기",
  blocked: "차단",
  done: "완료",
  canceled: "취소",
} as const

const INSTALL_STATUS_LABEL = {
  planned: "계획",
  ordered: "발주",
  delivered: "입고",
  installed: "설치",
  verified: "검수",
  issue: "이슈",
} as const

const ISSUE_SEVERITY_WEIGHT = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
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

function formatDateDisplay(value?: string) {
  if (!value) return "미정"
  return value.trim().slice(0, 10)
}

function getToneClass(tone: "neutral" | "blue" | "emerald" | "amber" | "rose" | "slate") {
  switch (tone) {
    case "blue":
      return "border-[#D1FAE5] bg-[#ECFDF5] text-[#084734]"
    case "emerald":
      return "border-emerald-200 bg-emerald-50 text-emerald-700"
    case "amber":
      return "border-amber-200 bg-amber-50 text-amber-700"
    case "rose":
      return "border-[#F6D5C5] bg-[#FEF3EE] text-[#B85C33]"
    case "slate":
      return "border-slate-200 bg-slate-50 text-slate-700"
    default:
      return "border-[#e8e8e4] bg-white text-[#1a1a1a]/60"
  }
}

function getDocumentStatusTone(status: PartnerDocument["status"]) {
  switch (status) {
    case "draft":
      return "amber"
    case "sent":
      return "blue"
    case "signed":
    case "paid":
      return "emerald"
    case "overdue":
      return "rose"
    case "archived":
      return "slate"
    default:
      return "neutral"
  }
}

function getDeliveryStatusTone(status: PartnerDocumentDelivery["status"]) {
  switch (status) {
    case "draft":
    case "ready":
      return "amber"
    case "sent":
      return "blue"
    case "opened":
      return "emerald"
    case "expired":
    case "revoked":
    case "failed":
      return "rose"
    default:
      return "neutral"
  }
}

function getChecklistTodoTone(status?: string) {
  switch (status) {
    case "done":
      return "emerald"
    case "blocked":
      return "rose"
    case "waiting_partner":
    case "waiting_internal":
      return "amber"
    case "canceled":
      return "slate"
    default:
      return "blue"
  }
}

function getChecklistTodoLabel(status?: string) {
  return status ? TODO_STATUS_LABEL[status as keyof typeof TODO_STATUS_LABEL] ?? status : "미정"
}

function getChecklistInstallTone(status?: string) {
  switch (status) {
    case "installed":
    case "verified":
      return "emerald"
    case "issue":
      return "rose"
    case "ordered":
    case "delivered":
      return "blue"
    case "planned":
      return "amber"
    default:
      return "neutral"
  }
}

function getChecklistInstallLabel(status?: string) {
  return status ? INSTALL_STATUS_LABEL[status as keyof typeof INSTALL_STATUS_LABEL] ?? status : "미정"
}

function getDocumentLatestDelivery(document: PartnerDocument) {
  return document.deliveries[0]
}

function getDocumentRecipientLabel(document: PartnerDocument, latestDelivery?: PartnerDocumentDelivery) {
  return (
    latestDelivery?.recipientName ||
    latestDelivery?.recipientEmail ||
    document.quoteDetails?.recipientContactName ||
    document.quoteDetails?.recipientCompanyName ||
    document.fileLabel
  )
}

function getDocumentExternalHref(document: PartnerDocument) {
  const url = document.externalUrl?.trim()
  if (!url) return null

  if (/^(https?:|mailto:|tel:)/i.test(url) || url.startsWith("/")) {
    return url
  }

  return `https://${url}`
}

function getDocumentPolicyFlags(delivery?: PartnerDocumentDelivery) {
  if (!delivery) return ["전달 이력 없음"]
  const flags: string[] = []

  if (delivery.expiresAt) {
    flags.push(`만료 ${formatDateDisplay(delivery.expiresAt)}`)
  }
  if (delivery.passwordEnabled) {
    flags.push("비밀번호")
  }
  if (delivery.allowDownload) {
    flags.push("다운로드 허용")
  } else {
    flags.push("다운로드 제한")
  }
  if (delivery.allowPrint) {
    flags.push("인쇄 허용")
  } else {
    flags.push("인쇄 제한")
  }

  return flags
}

function formatDocumentDeliverySummary(document: PartnerDocument, delivery?: PartnerDocumentDelivery) {
  if (!delivery) {
    return "전달 이력이 아직 없습니다."
  }

  const parts = [
    `${DOCUMENT_DELIVERY_CHANNEL_LABEL[delivery.deliveryChannel]} 전달`,
    DOCUMENT_DELIVERY_STATUS_LABEL[delivery.status],
    `수신자 ${getDocumentRecipientLabel(document, delivery)}`,
  ]

  if (delivery.sentAt) {
    parts.push(`발송 ${formatDateDisplay(delivery.sentAt)}`)
  }

  if (delivery.expiresAt) {
    parts.push(`만료 ${formatDateDisplay(delivery.expiresAt)}`)
  }

  if (delivery.lastViewedAt) {
    parts.push(`최근 열람 ${formatDateTimeDisplay(delivery.lastViewedAt)}`)
  }

  if (delivery.viewCount > 0) {
    parts.push(`열람 ${delivery.viewCount}회`)
  }

  return parts.join(" · ")
}

function getDocumentNextAction(document: PartnerDocument, delivery?: PartnerDocumentDelivery) {
  if (document.status === "overdue") {
    return "즉시 회수/재발송 확인"
  }

  if (document.status === "draft") {
    return "초안 정리 후 전달 준비"
  }

  if (!delivery) {
    return "전달본 생성"
  }

  if (delivery.status === "expired" || delivery.status === "revoked" || delivery.status === "failed") {
    return "재전달 또는 접근 정책 점검"
  }

  if (delivery.status === "opened") {
    return "열람 후 회신/서명 추적"
  }

  if (document.status === "signed" || document.status === "paid") {
    return "정산/보관 상태 확인"
  }

  return "전달 상태 점검"
}

function getChecklistNextAction(item: PartnerChecklistLike) {
  if (item.todoStatus === "blocked") return "차단 원인 해소"
  if (item.todoStatus === "waiting_partner") return "파트너 회신 대기"
  if (item.todoStatus === "waiting_internal") return "내부 담당 배정"
  if (item.todoStatus === "done" || item.todoStatus === "canceled") return "완료 내역 점검"
  if (item.installStatus === "issue") return "설치 이슈 확인"
  if (item.installStatus === "planned") return "일정 확정"
  if (item.installStatus === "ordered") return "입고 여부 확인"
  if (item.installStatus === "delivered") return "설치 진행"
  if (item.installStatus === "verified") return "검수 마감"
  return "다음 작업 정리"
}

function getChecklistQuantityText(item: PartnerChecklistLike) {
  const hasPlanned = item.plannedQuantity != null
  const hasConfirmed = item.confirmedQuantity != null

  if (!hasPlanned && !hasConfirmed) {
    return "수량 정보 없음"
  }

  if (hasPlanned && hasConfirmed) {
    const delta = item.confirmedQuantity! - item.plannedQuantity!
    const deltaLabel = delta === 0 ? "일치" : delta > 0 ? `+${delta}` : `${delta}`
    return `계획 ${item.plannedQuantity} · 확정 ${item.confirmedQuantity} · 차이 ${deltaLabel}`
  }

  return hasPlanned ? `계획 ${item.plannedQuantity}` : `확정 ${item.confirmedQuantity}`
}

function getIssueWeight(severity?: string) {
  if (!severity) return ISSUE_SEVERITY_WEIGHT.medium
  return ISSUE_SEVERITY_WEIGHT[severity as keyof typeof ISSUE_SEVERITY_WEIGHT] ?? ISSUE_SEVERITY_WEIGHT.medium
}

function createActionContext(deal: PartnerDeal | undefined, tab: PartnerWorkspaceTab): PartnerActionContext {
  return {
    deal,
    dealId: deal?.id,
    tab,
  }
}

function getDealNextActionKeys(stage: PartnerDeal["stage"]) {
  switch (stage) {
    case "discovery":
      return ["edit", "document", "schedule"] as const
    case "quoted":
      return ["document", "checklist", "schedule"] as const
    case "contract_sent":
      return ["document", "checklist", "issue"] as const
    case "active":
      return ["checklist", "sales", "issue"] as const
    case "closed_won":
      return ["sales", "document", "log"] as const
    case "closed_lost":
      return ["issue", "log", "edit"] as const
    default:
      return ["edit", "document"] as const
  }
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
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#d9d9d3] bg-white px-6 py-12 text-center">
      <p className="text-[14px] font-semibold text-[#111110]">{title}</p>
      <p className="mt-2 text-[12px] leading-5 text-[#1a1a1a]/45">{description}</p>
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
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
  onCreateContact,
  onEditContact,
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
  const dealTitleById = new Map(workspace.deals.map((deal) => [deal.id, deal.title]))
  const pendingDocuments = workspace.documents.filter((document) =>
    ["draft", "sent", "overdue"].includes(document.status)
  )
  const documentPriority = {
    overdue: 0,
    sent: 1,
    draft: 2,
    signed: 3,
    paid: 4,
    archived: 5,
  } as const
  const prioritizedDocuments = [...workspace.documents].sort((left, right) => {
    const priorityDelta = documentPriority[left.status] - documentPriority[right.status]
    if (priorityDelta !== 0) return priorityDelta
    return (left.dueAt ?? left.issuedAt ?? left.title).localeCompare(right.dueAt ?? right.issuedAt ?? right.title, "ko")
  })
  const primaryContact = workspace.contacts.find((contact) => contact.isPrimary) ?? workspace.contacts[0]
  const secondaryContacts = workspace.contacts.filter((contact) => contact.id !== primaryContact?.id)
  const overdueDocuments = workspace.documents.filter((document) => document.status === "overdue")
  const signedDocuments = workspace.documents.filter((document) => ["signed", "paid"].includes(document.status))
  const docsRequiringAttention = prioritizedDocuments.filter((document) => {
    const latestDelivery = getDocumentLatestDelivery(document)
    return (
      document.status === "draft" ||
      document.status === "overdue" ||
      !latestDelivery ||
      ["expired", "revoked", "failed"].includes(latestDelivery.status)
    )
  })
  const openIssues = issues.filter((issue) => issue.status !== "resolved")
  const judgmentNeededIssues = [...openIssues].sort((left, right) => {
    const weightDelta = getIssueWeight(left.severity) - getIssueWeight(right.severity)
    if (weightDelta !== 0) return weightDelta
    return (left.dueAt ?? left.title).localeCompare(right.dueAt ?? right.title, "ko")
  })
  const openChecklistItems = checklists.filter((item) => item.todoStatus !== "done" && item.todoStatus !== "canceled")
  const completedChecklistItems = checklists.filter((item) => item.todoStatus === "done" || item.todoStatus === "canceled")
  const quantityMismatchCount = checklists.filter(
    (item) =>
      item.plannedQuantity != null &&
      item.confirmedQuantity != null &&
      item.plannedQuantity !== item.confirmedQuantity
  ).length
  const fulfillmentPriorityItems = [...checklists]
    .filter((item) => item.todoStatus !== "done" && item.todoStatus !== "canceled")
    .sort((left, right) => {
      const leftWeight =
        (left.todoStatus === "blocked" ? 0 : 1) +
        (left.installStatus === "issue" ? 0 : 1) +
        (left.plannedQuantity != null && left.confirmedQuantity != null && left.plannedQuantity !== left.confirmedQuantity ? 0 : 1)
      const rightWeight =
        (right.todoStatus === "blocked" ? 0 : 1) +
        (right.installStatus === "issue" ? 0 : 1) +
        (right.plannedQuantity != null &&
        right.confirmedQuantity != null &&
        right.plannedQuantity !== right.confirmedQuantity
          ? 0
          : 1)
      if (leftWeight !== rightWeight) return leftWeight - rightWeight
      return (left.dueAt ?? left.title).localeCompare(right.dueAt ?? right.title, "ko")
    })
  const upcomingSchedule = workspace.schedule.filter((item) => item.status === "planned")
  const mainDeal =
    workspace.deals.find((deal) => ["active", "contract_sent", "quoted", "discovery"].includes(deal.stage)) ??
    workspace.deals[0]
  const todayActionCount = openChecklistItems.length + upcomingSchedule.length
  const handleCreateContact = onCreateContact ?? onEditPartner
  const handleEditContact = (contact: PartnerContact) => {
    if (onEditContact) {
      onEditContact(contact)
      return
    }

    onEditPartner()
  }

  return (
    <div className="px-4 pb-20 pt-8 sm:px-6 lg:px-8 lg:pt-10">
      <div className="mb-8">
        <Link
          href="/admin/crm/partners"
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

      <div className="sticky top-4 z-20 mb-6 rounded-2xl border border-[#e8e8e4] bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/30">빠른 액션</p>
            <p className="mt-1 text-[12px] leading-5 text-[#1a1a1a]/45">
              상세를 열지 않고도 바로 이어서 처리할 작업만 모았습니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-1.5" onClick={() => onCreateDeal(createActionContext(mainDeal, "deal-flow"))}>
              <Handshake className="h-3.5 w-3.5" />
              새 거래
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onCreateDocument(createActionContext(mainDeal, "documents"))}>
              <FileText className="h-3.5 w-3.5" />
              문서 추가
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onCreateChecklist(createActionContext(mainDeal, "fulfillment"))}>
              <ClipboardList className="h-3.5 w-3.5" />
              체크리스트
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onCreateActivityLog(createActionContext(mainDeal, "logs-issues"))}>
              <Zap className="h-3.5 w-3.5" />
              미팅 로그
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onCreateIssue(createActionContext(mainDeal, "logs-issues"))}>
              <AlertTriangle className="h-3.5 w-3.5" />
              이슈 등록
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
        <div className="mb-6 rounded-2xl border border-[#F6D5C5] bg-[#FEF3EE] px-5 py-4 text-[12px] leading-5 text-[#B85C33]">
          <strong className="mr-2">저장 오류:</strong>
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-6">
        {[
          {
            label: "메인 거래",
            value: mainDeal ? DEAL_STAGE_LABEL[mainDeal.stage] : "없음",
            sub: mainDeal?.title ?? "거래 없음",
            icon: <Handshake className="h-4 w-4 text-[#084734]" />,
            accent: "bg-[#ECFDF5]",
          },
          {
            label: "오늘 처리",
            value: todayActionCount,
            sub: "체크리스트/예정 일정",
            icon: <ClipboardList className="h-4 w-4 text-emerald-600" />,
            accent: "bg-emerald-50",
          },
          {
            label: "판단 필요",
            value: openIssues.length,
            sub: "오픈 이슈",
            icon: <AlertTriangle className="h-4 w-4 text-amber-600" />,
            accent: "bg-amber-50",
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
            icon: <FileText className="h-4 w-4 text-[#615D59]" />,
            accent: "bg-[#F6F5F4]",
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
            <div className="space-y-6">
              <SurfaceSection title="오늘의 실행 큐" description="가장 먼저 처리할 일정과 문서를 한 곳에 모아 둡니다.">
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
                {upcomingSchedule.length === 0 && pendingDocuments.length === 0 && (
                  <div className="rounded-2xl bg-[#fafaf8] px-4 py-6 text-center text-[12px] text-[#1a1a1a]/45 md:col-span-2">
                    아직 오늘 처리할 항목이 없습니다.
                  </div>
                )}
              </div>
              </SurfaceSection>

              <SurfaceSection
                title="연락처 관리"
                description="대표 연락처와 현장 담당자를 같은 화면에서 확인합니다."
                action={
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="gap-1.5" onClick={handleCreateContact}>
                      <Plus className="h-3.5 w-3.5" />
                      연락처 추가
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={onEditPartner}>
                      <Pencil className="h-3.5 w-3.5" />
                      기본 정보 수정
                    </Button>
                  </div>
                }
              >
                <div className="space-y-3">
                  {primaryContact ? (
                    <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className="text-[14px] text-[#111110]">{primaryContact.name}</strong>
                            <Badge variant="outline" className="border-[#e8e8e4] bg-white text-[#1a1a1a]/55">
                              대표
                            </Badge>
                          </div>
                          <p className="mt-1 text-[12px] leading-5 text-[#1a1a1a]/50">
                            {primaryContact.role ?? "직책 미정"} · {primaryContact.email ?? "이메일 미정"} · {primaryContact.phone ?? "연락처 미정"}
                          </p>
                        </div>
                        <Button variant="outline" size="sm" className="gap-1.5 self-start" onClick={() => handleEditContact(primaryContact)}>
                          <Pencil className="h-3.5 w-3.5" />
                          수정
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <EmptyPanel
                      title="연락처가 없습니다."
                      description="대표 연락처를 추가하면 파트너 카드와 문서 운영에서 바로 참조할 수 있습니다."
                    />
                  )}

                  {secondaryContacts.length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {secondaryContacts.map((contact) => (
                        <div key={contact.id} className="rounded-2xl bg-[#fafaf8] p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <strong className="block text-[13px] text-[#111110]">{contact.name}</strong>
                              <p className="mt-1 text-[12px] leading-5 text-[#1a1a1a]/50">
                                {contact.role ?? "직책 미정"} · {contact.email ?? "이메일 미정"}
                              </p>
                            </div>
                            <Button variant="outline" size="sm" className="gap-1.5 self-start" onClick={() => handleEditContact(contact)}>
                              <Pencil className="h-3.5 w-3.5" />
                              수정
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    primaryContact && (
                      <div className="rounded-2xl border border-dashed border-[#d9d9d3] bg-white px-5 py-6 text-center text-[12px] text-[#1a1a1a]/45">
                        추가 연락처가 없어서 대표 연락처만 보여줍니다.
                      </div>
                    )
                  )}
                </div>
              </SurfaceSection>
            </div>

            <SurfaceSection
              title="판단 필요"
              description="막힌 이슈와 추가 판단이 필요한 항목을 우선 확인합니다."
              action={
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onTabChange("logs-issues")}>
                  <AlertTriangle className="h-3.5 w-3.5" />
                  전체 이슈
                </Button>
              }
            >
              <div className="space-y-3">
                {judgmentNeededIssues.slice(0, 4).map((issue) => (
                  <div key={issue.id} className="rounded-2xl bg-[#FEF3EE] p-4">
                    <p className="text-[12px] font-medium text-[#111110]">{issue.title}</p>
                    <p className="mt-1 text-[12px] leading-5 text-[#7f1d1d]">
                      {issue.severity ?? "medium"} · {issue.status ?? "open"} · {issue.owner ?? "담당 미정"}
                      {issue.dueAt ? ` · 마감 ${formatDateTimeDisplay(issue.dueAt)}` : ""}
                    </p>
                  </div>
                ))}
                {judgmentNeededIssues.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[#d9d9d3] bg-white px-5 py-10 text-center text-[12px] text-[#1a1a1a]/45">
                    판단이 필요한 이슈는 아직 없습니다.
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
                <Button size="sm" className="gap-1.5" onClick={() => onCreateDeal(createActionContext(mainDeal, "deal-flow"))}>
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
                          <div className="mt-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1a1a1a]/30">다음 단계</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {getDealNextActionKeys(deal.stage).map((actionKey, index) => {
                                const primary = index === 0
                                const commonClassName = "gap-1.5"
                                switch (actionKey) {
                                  case "edit":
                                    return (
                                      <Button
                                        key={`${deal.id}-edit`}
                                        variant={primary ? "default" : "outline"}
                                        size="sm"
                                        className={commonClassName}
                                        onClick={() => onEditDeal(deal)}
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                        거래 수정
                                      </Button>
                                    )
                                  case "document":
                                    return (
                                      <Button
                                        key={`${deal.id}-document`}
                                        variant={primary ? "default" : "outline"}
                                        size="sm"
                                        className={commonClassName}
                                        onClick={() => onCreateDocument(createActionContext(deal, "documents"))}
                                      >
                                        <FileText className="h-3.5 w-3.5" />
                                        계약 문서 생성
                                      </Button>
                                    )
                                  case "checklist":
                                    return (
                                      <Button
                                        key={`${deal.id}-checklist`}
                                        variant={primary ? "default" : "outline"}
                                        size="sm"
                                        className={commonClassName}
                                        onClick={() => onCreateChecklist(createActionContext(deal, "fulfillment"))}
                                      >
                                        <ClipboardList className="h-3.5 w-3.5" />
                                        체크리스트 생성
                                      </Button>
                                    )
                                  case "sales":
                                    return (
                                      <Button
                                        key={`${deal.id}-sales`}
                                        variant={primary ? "default" : "outline"}
                                        size="sm"
                                        className={commonClassName}
                                        onClick={() => onCreateSales(createActionContext(deal, "deal-flow"))}
                                      >
                                        <TrendingUp className="h-3.5 w-3.5" />
                                        판매 기록 추가
                                      </Button>
                                    )
                                  case "schedule":
                                    return (
                                      <Button
                                        key={`${deal.id}-schedule`}
                                        variant={primary ? "default" : "outline"}
                                        size="sm"
                                        className={commonClassName}
                                        onClick={() => onCreateSchedule(createActionContext(deal, "fulfillment"))}
                                      >
                                        <Zap className="h-3.5 w-3.5" />
                                        미팅 일정 추가
                                      </Button>
                                    )
                                  case "issue":
                                    return (
                                      <Button
                                        key={`${deal.id}-issue`}
                                        variant={primary ? "default" : "outline"}
                                        size="sm"
                                        className={commonClassName}
                                        onClick={() => onCreateIssue(createActionContext(deal, "logs-issues"))}
                                      >
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                        이슈 등록
                                      </Button>
                                    )
                                  case "log":
                                    return (
                                      <Button
                                        key={`${deal.id}-log`}
                                        variant={primary ? "default" : "outline"}
                                        size="sm"
                                        className={commonClassName}
                                        onClick={() => onCreateActivityLog(createActionContext(deal, "logs-issues"))}
                                      >
                                        <Zap className="h-3.5 w-3.5" />
                                        미팅 로그 추가
                                      </Button>
                                    )
                                  default:
                                    return null
                                }
                              })}
                            </div>
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
                <Button size="sm" className="gap-1.5" onClick={() => onCreateSales(createActionContext(mainDeal, "deal-flow"))}>
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
          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-6">
              <SurfaceSection
                title="이행 체크"
                description="설치/후속/마감 흐름을 독립 탭으로 다룹니다. checklist 데이터가 연결되면 여기서 품목/수량 기반으로 확장됩니다."
                action={
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="gap-1.5" onClick={() => onCreateChecklist(createActionContext(mainDeal, "fulfillment"))}>
                      <Plus className="h-3.5 w-3.5" />
                      체크 추가
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onCreateSchedule(createActionContext(mainDeal, "fulfillment"))}>
                      <Plus className="h-3.5 w-3.5" />
                      일정 추가
                    </Button>
                  </div>
                }
              >
                <div className="mb-4 grid gap-3 md:grid-cols-4">
                  <div className="rounded-2xl bg-amber-50 p-4">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-amber-800/55">체크 대기</p>
                    <p className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-amber-900">{openChecklistItems.length}</p>
                  </div>
                  <div className="rounded-2xl bg-[#ECFDF5] p-4">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-[#084734]/55">예정 일정</p>
                    <p className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-[#084734]">{upcomingSchedule.length}</p>
                  </div>
                  <div className="rounded-2xl bg-[#FEF3EE] p-4">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-[#B85C33]/55">수량 불일치</p>
                    <p className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-[#B85C33]">{quantityMismatchCount}</p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 p-4">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-800/55">완료</p>
                    <p className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-emerald-900">{completedChecklistItems.length}</p>
                  </div>
                </div>

                {checklists.length > 0 ? (
                  <div className="space-y-3">
                    {checklists.map((item) => {
                      const hasQuantityMismatch =
                        item.plannedQuantity != null &&
                        item.confirmedQuantity != null &&
                        item.plannedQuantity !== item.confirmedQuantity

                      return (
                        <div key={item.id} className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-5">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 space-y-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <strong className="text-[13px] text-[#111110]">{item.title}</strong>
                                {item.checklistGroup && (
                                  <Badge variant="outline" className={`border ${getToneClass("neutral")}`}>
                                    {item.checklistGroup}
                                  </Badge>
                                )}
                                <Badge variant="outline" className={`border ${getToneClass(getChecklistTodoTone(item.todoStatus))}`}>
                                  {getChecklistTodoLabel(item.todoStatus)}
                                </Badge>
                                <Badge variant="outline" className={`border ${getToneClass(getChecklistInstallTone(item.installStatus))}`}>
                                  {getChecklistInstallLabel(item.installStatus)}
                                </Badge>
                                {hasQuantityMismatch && (
                                  <Badge variant="outline" className={`border ${getToneClass("rose")}`}>
                                    수량 차이
                                  </Badge>
                                )}
                              </div>
                              <p className="text-[12px] leading-5 text-[#1a1a1a]/50">
                                담당 {item.owner ?? "미정"} · 마감 {formatDateDisplay(item.dueAt)} · {getChecklistQuantityText(item)}
                              </p>
                              <div className="flex flex-wrap gap-2 text-[11px] text-[#1a1a1a]/55">
                                <span className="rounded-full bg-white px-2.5 py-1">다음 작업 {getChecklistNextAction(item)}</span>
                                <span className="rounded-full bg-white px-2.5 py-1">설치 상태 {getChecklistInstallLabel(item.installStatus)}</span>
                                {item.itemName && <span className="rounded-full bg-white px-2.5 py-1">품목 {item.itemName}</span>}
                              </div>
                              {item.notes && (
                                <p className="rounded-2xl bg-white px-3 py-2 text-[12px] leading-5 text-[#1a1a1a]/45">{item.notes}</p>
                              )}
                            </div>
                            <Button variant="outline" size="sm" className="gap-1.5 self-start" onClick={() => onEditChecklist(item as PartnerOpsChecklistItem)}>
                              <Pencil className="h-3.5 w-3.5" />
                              수정
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : workspace.schedule.length > 0 ? (
                  <div className="space-y-3">
                    {workspace.schedule.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className={`border ${getToneClass("neutral")}`}>
                                {SCHEDULE_KIND_LABEL[item.kind]}
                              </Badge>
                              <Badge variant="outline" className={`border ${getToneClass(item.status === "completed" ? "emerald" : item.status === "canceled" ? "slate" : "blue")}`}>
                                {SCHEDULE_STATUS_LABEL[item.status]}
                              </Badge>
                              <h3 className="text-[13px] font-semibold text-[#111110]">{item.title}</h3>
                            </div>
                            <p className="text-[12px] leading-5 text-[#1a1a1a]/50">
                              {formatDateTimeDisplay(item.startsAt)}
                              {item.endsAt ? ` - ${formatDateTimeDisplay(item.endsAt)}` : ""} · 담당 {item.owner || "미정"}
                            </p>
                            <div className="flex flex-wrap gap-2 text-[11px] text-[#1a1a1a]/55">
                              <span className="rounded-full bg-white px-2.5 py-1">다음 작업 {item.status === "planned" ? "일정 확정" : "완료 처리"}</span>
                            </div>
                          </div>
                          <Button variant="outline" size="sm" className="gap-1.5 self-start" onClick={() => onEditSchedule(item)}>
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
                    description="체크리스트와 일정을 먼저 연결하면 설치/후속/마감 흐름이 한눈에 보입니다."
                    action={
                      <>
                        <Button size="sm" className="gap-1.5" onClick={() => onCreateChecklist(createActionContext(mainDeal, "fulfillment"))}>
                          <Plus className="h-3.5 w-3.5" />
                          체크 추가
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onCreateSchedule(createActionContext(mainDeal, "fulfillment"))}>
                          <Plus className="h-3.5 w-3.5" />
                          일정 추가
                        </Button>
                      </>
                    }
                  />
                )}
              </SurfaceSection>
            </div>

            <div className="space-y-4">
              <SurfaceSection title="우선 처리" description="차단, 수량 차이, 마감 임박 항목부터 처리합니다.">
                <div className="space-y-3 text-[12px] leading-5 text-[#1a1a1a]/55">
                  {fulfillmentPriorityItems.slice(0, 4).map((item) => {
                    const hasQuantityMismatch =
                      item.plannedQuantity != null &&
                      item.confirmedQuantity != null &&
                      item.plannedQuantity !== item.confirmedQuantity

                    return (
                      <div key={`priority-${item.id}`} className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <strong className="block text-[#111110]">{item.title}</strong>
                            <span className="mt-1 block">
                              담당 {item.owner ?? "미정"} · 마감 {formatDateDisplay(item.dueAt)} · {getChecklistQuantityText(item)}
                            </span>
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2">
                            <Badge variant="outline" className={`border ${getToneClass(getChecklistTodoTone(item.todoStatus))}`}>
                              {getChecklistTodoLabel(item.todoStatus)}
                            </Badge>
                            <Badge variant="outline" className={`border ${getToneClass(getChecklistInstallTone(item.installStatus))}`}>
                              {getChecklistInstallLabel(item.installStatus)}
                            </Badge>
                            {hasQuantityMismatch && (
                              <Badge variant="outline" className={`border ${getToneClass("rose")}`}>
                                차이
                              </Badge>
                            )}
                          </div>
                        </div>
                        <span className="mt-2 block text-[11px] text-[#1a1a1a]/45">다음 작업 {getChecklistNextAction(item)}</span>
                      </div>
                    )
                  })}
                  {fulfillmentPriorityItems.length === 0 && (
                    <div className="rounded-2xl bg-[#fafaf8] px-4 py-6 text-center text-[#1a1a1a]/45">
                      바로 처리할 이행 항목이 없습니다.
                    </div>
                  )}
                </div>
              </SurfaceSection>

              <SurfaceSection title="실행 가이드" description="MVP 기준으로 먼저 만들어둘 작업 경로입니다.">
                <div className="space-y-2">
                  <Button size="sm" className="w-full justify-start gap-1.5" onClick={() => onCreateChecklist(createActionContext(mainDeal, "fulfillment"))}>
                    <Plus className="h-3.5 w-3.5" />
                    체크리스트 추가
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start gap-1.5" onClick={() => onCreateSchedule(createActionContext(mainDeal, "fulfillment"))}>
                    <Plus className="h-3.5 w-3.5" />
                    일정 추가
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start gap-1.5" onClick={() => onTabChange("documents")}>
                    <FileText className="h-3.5 w-3.5" />
                    문서 확인
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start gap-1.5" onClick={() => onTabChange("deal-flow")}>
                    <Handshake className="h-3.5 w-3.5" />
                    거래 흐름 보기
                  </Button>
                </div>
              </SurfaceSection>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="documents">
          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-6">
              <SurfaceSection
                title="문서 운영"
                description="문서 원본, 만료 상태, 전달 이력을 한 문맥에서 빠르게 훑습니다."
                action={
                  <Button size="sm" className="gap-1.5" onClick={() => onCreateDocument(createActionContext(mainDeal, "documents"))}>
                    <Plus className="h-3.5 w-3.5" />
                    문서 추가
                  </Button>
                }
              >
                <div className="mb-4 grid gap-3 md:grid-cols-4">
                  <div className="rounded-2xl bg-[#fafaf8] p-4">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-[#1a1a1a]/35">전체 문서</p>
                    <p className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-[#111110]">{workspace.documents.length}</p>
                  </div>
                  <div className="rounded-2xl bg-amber-50 p-4">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-amber-800/55">전달 대기</p>
                    <p className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-amber-900">{pendingDocuments.length}</p>
                  </div>
                  <div className="rounded-2xl bg-[#FEF3EE] p-4">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-[#B85C33]/55">연체/만료</p>
                    <p className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-[#9A4A27]">
                      {overdueDocuments.length + docsRequiringAttention.filter((document) => {
                        const latestDelivery = getDocumentLatestDelivery(document)
                        return latestDelivery?.status === "expired"
                      }).length}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 p-4">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-800/55">정상 완료</p>
                    <p className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-emerald-900">{signedDocuments.length}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {workspace.documents.length === 0 ? (
                    <EmptyPanel
                      title="등록된 문서가 없습니다."
                      description="견적서, 계약서, 영수증을 거래와 연결해두면 정산 누락을 줄일 수 있습니다."
                      action={
                        <>
                          <Button size="sm" className="gap-1.5" onClick={() => onCreateDocument(createActionContext(mainDeal, "documents"))}>
                            <Plus className="h-3.5 w-3.5" />
                            문서 추가
                          </Button>
                          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onTabChange("deal-flow")}>
                            <Handshake className="h-3.5 w-3.5" />
                            거래 확인
                          </Button>
                        </>
                      }
                    />
                  ) : (
                    prioritizedDocuments.map((document) => {
                      const linkedDeal = document.dealId ? dealTitleById.get(document.dealId) : undefined
                      const latestDelivery = getDocumentLatestDelivery(document)
                      const externalHref = getDocumentExternalHref(document)
                      return (
                        <div key={document.id} className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-5">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 space-y-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-[14px] font-semibold text-[#111110]">{document.title}</h3>
                                <Badge variant="outline" className={`border ${getToneClass("neutral")}`}>
                                  {DOCUMENT_KIND_LABEL[document.kind]}
                                </Badge>
                                <Badge variant="outline" className={`border ${getToneClass(getDocumentStatusTone(document.status))}`}>
                                  {DOCUMENT_STATUS_LABEL[document.status]}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className={`border ${getToneClass(latestDelivery ? getDeliveryStatusTone(latestDelivery.status) : "amber")}`}
                                >
                                  {latestDelivery ? DOCUMENT_DELIVERY_STATUS_LABEL[latestDelivery.status] : "전달 이력 없음"}
                                </Badge>
                              </div>
                              <p className="text-[12px] leading-5 text-[#1a1a1a]/50">
                                발행 {formatDateDisplay(document.issuedAt)} · 마감 {formatDateDisplay(document.dueAt)} ·{" "}
                                {externalHref ? "외부 링크 연결" : `파일 ${document.fileLabel}`}
                              </p>
                              <p className="text-[12px] leading-5 text-[#1a1a1a]/45">
                                {formatDocumentDeliverySummary(document, latestDelivery)}
                              </p>
                              <div className="flex flex-wrap gap-2 text-[11px] text-[#1a1a1a]/55">
                                <span className="rounded-full bg-white px-2.5 py-1">거래 {linkedDeal ?? "미연결"}</span>
                                <span className="rounded-full bg-white px-2.5 py-1">수신자 {getDocumentRecipientLabel(document, latestDelivery)}</span>
                                <span className="rounded-full bg-white px-2.5 py-1">다음 작업 {getDocumentNextAction(document, latestDelivery)}</span>
                                {externalHref && <span className="rounded-full bg-white px-2.5 py-1">공유 링크 보관됨</span>}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {getDocumentPolicyFlags(latestDelivery).map((flag) => (
                                  <span key={`${document.id}-${flag}`} className="rounded-full border border-[#e8e8e4] bg-white px-2.5 py-1 text-[11px] text-[#1a1a1a]/55">
                                    {flag}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 self-start">
                              {document.amount != null && (
                                <div className="rounded-2xl bg-white px-4 py-3 text-right text-[12px]">
                                  <span className="block text-[#1a1a1a]/35">금액</span>
                                  <strong className="text-[15px] text-[#111110]">{formatCurrency(document.amount)}</strong>
                                </div>
                              )}
                              {externalHref && (
                                <Button asChild variant="outline" size="sm" className="gap-1.5">
                                  <a href={externalHref} target="_blank" rel="noreferrer">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    열기
                                  </a>
                                </Button>
                              )}
                              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onEditDocument(document)}>
                                <Pencil className="h-3.5 w-3.5" />
                                수정
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </SurfaceSection>
            </div>

            <div className="space-y-4">
              <SurfaceSection title="문서 우선순위" description="연체, 만료, 전달 이력 없음 문서를 먼저 처리합니다.">
                <div className="space-y-3 text-[12px] leading-5 text-[#1a1a1a]/55">
                  {docsRequiringAttention.slice(0, 4).map((document) => {
                    const latestDelivery = getDocumentLatestDelivery(document)
                    const externalHref = getDocumentExternalHref(document)
                    return (
                      <div key={document.id} className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <strong className="block text-[#111110]">{document.title}</strong>
                            <span className="mt-1 block">{formatDocumentDeliverySummary(document, latestDelivery)}</span>
                          </div>
                          <Badge
                            variant="outline"
                            className={`shrink-0 border ${getToneClass(latestDelivery ? getDeliveryStatusTone(latestDelivery.status) : getDocumentStatusTone(document.status))}`}
                          >
                            {latestDelivery ? DOCUMENT_DELIVERY_STATUS_LABEL[latestDelivery.status] : DOCUMENT_STATUS_LABEL[document.status]}
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {getDocumentPolicyFlags(latestDelivery).slice(0, 3).map((flag) => (
                            <span key={`${document.id}-${flag}`} className="rounded-full bg-white px-2.5 py-1 text-[11px] text-[#1a1a1a]/55">
                              {flag}
                            </span>
                          ))}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onEditDocument(document)}>
                            <Pencil className="h-3.5 w-3.5" />
                            수정
                          </Button>
                          {externalHref && (
                            <Button asChild variant="outline" size="sm" className="gap-1.5">
                              <a href={externalHref} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-3.5 w-3.5" />
                                열기
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {docsRequiringAttention.length === 0 && (
                    <div className="rounded-2xl bg-[#fafaf8] px-4 py-6 text-center text-[#1a1a1a]/45">
                      바로 처리할 문서는 없습니다.
                    </div>
                  )}
                </div>
              </SurfaceSection>

              <SurfaceSection title="접근 정책" description="비밀번호, 다운로드, 인쇄 허용 여부를 빠르게 점검합니다.">
                <div className="space-y-3 text-[12px] leading-5 text-[#1a1a1a]/55">
                  {(prioritizedDocuments.filter((document) => getDocumentLatestDelivery(document)).slice(0, 3)).map((document) => {
                    const latestDelivery = getDocumentLatestDelivery(document)
                    if (!latestDelivery) return null
                    return (
                      <div key={`policy-${document.id}`} className="rounded-2xl bg-[#fafaf8] px-4 py-3">
                        <strong className="block text-[#111110]">{document.title}</strong>
                        <span className="mt-1 block">{getDocumentRecipientLabel(document, latestDelivery)} · {formatDateDisplay(latestDelivery.expiresAt)} 만료</span>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {getDocumentPolicyFlags(latestDelivery).map((flag) => (
                            <span key={`${document.id}-${flag}`} className="rounded-full border border-[#e8e8e4] bg-white px-2.5 py-1 text-[11px] text-[#1a1a1a]/55">
                              {flag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                  {prioritizedDocuments.filter((document) => getDocumentLatestDelivery(document)).length === 0 && (
                    <div className="rounded-2xl border border-dashed border-[#d9d9d3] bg-white px-5 py-10 text-center text-[#1a1a1a]/45">
                      접근 정책이 연결된 문서가 아직 없습니다.
                    </div>
                  )}
                </div>
              </SurfaceSection>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="logs-issues">
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <SurfaceSection
            title="운영 로그"
            description="미팅, 계약, 후속, 내부 메모 흐름을 여기에 모읍니다."
            action={
                <Button size="sm" className="gap-1.5" onClick={() => onCreateActivityLog(createActionContext(mainDeal, "logs-issues"))}>
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
                <Button size="sm" className="gap-1.5" onClick={() => onCreateIssue(createActionContext(mainDeal, "logs-issues"))}>
                  <Plus className="h-3.5 w-3.5" />
                  이슈 추가
                </Button>
              }
            >
              <div className="space-y-3">
                {issues.length > 0 ? (
                  issues.map((issue) => (
                    <div key={issue.id} className="rounded-2xl bg-[#FEF3EE] px-4 py-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <strong className="block text-[13px] text-[#111110]">{issue.title}</strong>
                          <p className="mt-1 text-[12px] leading-5 text-[#9A4A27]">
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
