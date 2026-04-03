"use client"

import Link from "next/link"
import { useState } from "react"
import type { FormEvent, ReactNode } from "react"
import {
  ArrowLeft,
  CalendarDays,
  FileText,
  Handshake,
  Pencil,
  Plus,
  Receipt,
  TrendingUp,
  Zap,
} from "lucide-react"

import PartnerFormDialog from "@/components/admin/partners/PartnerFormDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type {
  PartnerDataSource,
  PartnerDeal,
  PartnerDealInput,
  PartnerDocument,
  PartnerDocumentInput,
  PartnerSalesInput,
  PartnerSalesRecord,
  PartnerScheduleInput,
  PartnerScheduleItem,
  PartnerSummaryInput,
  PartnerWorkspace,
} from "@/lib/partners-types"

interface PartnerWorkspaceDetailClientProps {
  initialWorkspace: PartnerWorkspace
  initialSource: PartnerDataSource
  initialWarning?: string
}

const SELECT_CLASSNAME =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

const DEAL_STAGE_LABEL = {
  discovery: "발굴",
  quoted: "견적 발송 전",
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

function toDateTimeInputValue(value?: string) {
  if (!value) return ""
  const normalized = value.trim().replace(" ", "T")
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
  if (match) return `${match[1]}T${match[2]}`

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return normalized

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function formatDateTimeDisplay(value?: string) {
  if (!value) return "미정"

  const normalized = value.trim().replace("T", " ")
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/)
  if (match) return `${match[1]} ${match[2]}`

  return normalized
}

function toSalesMonthInputValue(value?: string) {
  if (!value) return ""
  return value.slice(0, 7)
}

function toSalesMonthStorageValue(value: string) {
  if (!value) return value
  return value.length === 7 ? `${value}-01` : value
}

function createDealFormState(initialDeal?: PartnerDeal | null): PartnerDealInput {
  if (!initialDeal) {
    return {
      title: "",
      stage: "discovery",
      quoteAmount: 0,
      expectedCloseAt: "",
      contractStartAt: "",
      contractEndAt: "",
      salesUnits: 0,
      manager: "",
    }
  }

  return {
    id: initialDeal.id,
    title: initialDeal.title,
    stage: initialDeal.stage,
    quoteAmount: initialDeal.quoteAmount,
    expectedCloseAt: initialDeal.expectedCloseAt ?? "",
    contractStartAt: initialDeal.contractStartAt ?? "",
    contractEndAt: initialDeal.contractEndAt ?? "",
    salesUnits: initialDeal.salesUnits,
    manager: initialDeal.manager,
  }
}

function createDocumentFormState(initialDocument: PartnerDocument | null | undefined, deals: PartnerDeal[]): PartnerDocumentInput {
  if (!initialDocument) {
    return {
      kind: "quote",
      status: "draft",
      title: "",
      dealId: deals[0]?.id ?? "",
      amount: 0,
      issuedAt: "",
      dueAt: "",
      fileLabel: "",
    }
  }

  return {
    id: initialDocument.id,
    dealId: initialDocument.dealId ?? "",
    kind: initialDocument.kind,
    status: initialDocument.status,
    title: initialDocument.title,
    amount: initialDocument.amount ?? 0,
    issuedAt: initialDocument.issuedAt ?? "",
    dueAt: initialDocument.dueAt ?? "",
    fileLabel: initialDocument.fileLabel,
  }
}

function createScheduleFormState(initialSchedule: PartnerScheduleItem | null | undefined, deals: PartnerDeal[]): PartnerScheduleInput {
  if (!initialSchedule) {
    return {
      kind: "meeting",
      status: "planned",
      title: "",
      dealId: deals[0]?.id ?? "",
      startsAt: "",
      endsAt: "",
      owner: "",
    }
  }

  return {
    id: initialSchedule.id,
    kind: initialSchedule.kind,
    status: initialSchedule.status,
    title: initialSchedule.title,
    dealId: initialSchedule.dealId ?? "",
    startsAt: toDateTimeInputValue(initialSchedule.startsAt),
    endsAt: toDateTimeInputValue(initialSchedule.endsAt),
    owner: initialSchedule.owner,
  }
}

function createSalesFormState(initialSales: PartnerSalesRecord | null | undefined, deals: PartnerDeal[]): PartnerSalesInput {
  if (!initialSales) {
    return {
      salesMonth: "",
      dealId: deals[0]?.id ?? "",
      unitsSold: 0,
      grossAmount: 0,
      netAmount: 0,
    }
  }

  return {
    id: initialSales.id,
    dealId: initialSales.dealId ?? "",
    salesMonth: toSalesMonthInputValue(initialSales.salesMonth),
    unitsSold: initialSales.unitsSold,
    grossAmount: initialSales.grossAmount,
    netAmount: initialSales.netAmount,
  }
}

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-[14px] font-semibold text-[#111110]">{title}</h2>
        {description && <p className="mt-1 text-[12px] text-[#1a1a1a]/45">{description}</p>}
      </div>
      {action}
    </div>
  )
}

function ResourceDialogShell({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-2xl bg-white">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

function DealFormDialog({
  open,
  loading,
  initialDeal,
  onClose,
  onSave,
}: {
  open: boolean
  loading?: boolean
  initialDeal?: PartnerDeal | null
  onClose: () => void
  onSave: (payload: PartnerDealInput) => Promise<void> | void
}) {
  const [form, setForm] = useState<PartnerDealInput>(() => createDealFormState(initialDeal))

  const set = <K extends keyof PartnerDealInput>(key: K, value: PartnerDealInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onSave({
      ...form,
      title: form.title.trim(),
      quoteAmount: Number(form.quoteAmount ?? 0),
      salesUnits: Number(form.salesUnits ?? 0),
      manager: form.manager.trim(),
      expectedCloseAt: form.expectedCloseAt || undefined,
      contractStartAt: form.contractStartAt || undefined,
      contractEndAt: form.contractEndAt || undefined,
    })
  }

  return (
    <ResourceDialogShell
      open={open}
      onClose={onClose}
      title={initialDeal ? "거래 수정" : "거래 추가"}
      description="견적, 계약, 판매 댓수 흐름의 기준이 되는 거래 정보를 입력합니다."
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="deal-title">거래명 *</Label>
          <Input id="deal-title" value={form.title} onChange={(event) => set("title", event.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="deal-stage">단계</Label>
            <select
              id="deal-stage"
              value={form.stage}
              onChange={(event) => set("stage", event.target.value as PartnerDealInput["stage"])}
              className={SELECT_CLASSNAME}
            >
              <option value="discovery">발굴</option>
              <option value="quoted">견적 준비</option>
              <option value="contract_sent">계약 발송</option>
              <option value="active">진행중</option>
              <option value="closed_won">성사</option>
              <option value="closed_lost">종료</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="deal-manager">담당자</Label>
            <Input id="deal-manager" value={form.manager} onChange={(event) => set("manager", event.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="deal-amount">견적 금액</Label>
            <Input id="deal-amount" type="number" value={form.quoteAmount} onChange={(event) => set("quoteAmount", Number(event.target.value || 0))} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="deal-sales-units">판매 댓수</Label>
            <Input id="deal-sales-units" type="number" value={form.salesUnits} onChange={(event) => set("salesUnits", Number(event.target.value || 0))} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="deal-expected-close">예상 마감</Label>
            <Input id="deal-expected-close" type="date" value={form.expectedCloseAt} onChange={(event) => set("expectedCloseAt", event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="deal-contract-start">계약 시작</Label>
            <Input id="deal-contract-start" type="date" value={form.contractStartAt} onChange={(event) => set("contractStartAt", event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="deal-contract-end">계약 종료</Label>
            <Input id="deal-contract-end" type="date" value={form.contractEndAt} onChange={(event) => set("contractEndAt", event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>취소</Button>
          <Button type="submit" disabled={loading}>{loading ? "저장 중..." : initialDeal ? "거래 수정" : "거래 추가"}</Button>
        </DialogFooter>
      </form>
    </ResourceDialogShell>
  )
}

function DocumentFormDialog({
  open,
  loading,
  deals,
  initialDocument,
  onClose,
  onSave,
}: {
  open: boolean
  loading?: boolean
  deals: PartnerDeal[]
  initialDocument?: PartnerDocument | null
  onClose: () => void
  onSave: (payload: PartnerDocumentInput) => Promise<void> | void
}) {
  const [form, setForm] = useState<PartnerDocumentInput>(() => createDocumentFormState(initialDocument, deals))

  const set = <K extends keyof PartnerDocumentInput>(key: K, value: PartnerDocumentInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onSave({
      ...form,
      title: form.title.trim(),
      fileLabel: form.fileLabel.trim() || "첨부 문서",
      dealId: form.dealId || undefined,
      amount: form.amount ? Number(form.amount) : undefined,
      issuedAt: form.issuedAt || undefined,
      dueAt: form.dueAt || undefined,
    })
  }

  return (
    <ResourceDialogShell
      open={open}
      onClose={onClose}
      title={initialDocument ? "문서 수정" : "문서 추가"}
      description="견적서, 계약서, 영수증을 거래 흐름과 연결해 관리합니다."
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="doc-title">문서 제목 *</Label>
          <Input id="doc-title" value={form.title} onChange={(event) => set("title", event.target.value)} required />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="doc-kind">문서 종류</Label>
            <select id="doc-kind" value={form.kind} onChange={(event) => set("kind", event.target.value as PartnerDocumentInput["kind"])} className={SELECT_CLASSNAME}>
              <option value="quote">견적서</option>
              <option value="contract">계약서</option>
              <option value="receipt">영수증</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="doc-status">상태</Label>
            <select id="doc-status" value={form.status} onChange={(event) => set("status", event.target.value as PartnerDocumentInput["status"])} className={SELECT_CLASSNAME}>
              <option value="draft">초안</option>
              <option value="sent">발송됨</option>
              <option value="signed">서명완료</option>
              <option value="paid">정산완료</option>
              <option value="overdue">연체</option>
              <option value="archived">보관</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="doc-deal">거래 연결</Label>
            <select id="doc-deal" value={form.dealId} onChange={(event) => set("dealId", event.target.value)} className={SELECT_CLASSNAME}>
              <option value="">미연결</option>
              {deals.map((deal) => (
                <option key={deal.id} value={deal.id}>{deal.title}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="doc-amount">금액</Label>
            <Input id="doc-amount" type="number" value={form.amount ?? 0} onChange={(event) => set("amount", Number(event.target.value || 0))} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="doc-issued-at">발행일</Label>
            <Input id="doc-issued-at" type="date" value={form.issuedAt ?? ""} onChange={(event) => set("issuedAt", event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="doc-due-at">마감일</Label>
            <Input id="doc-due-at" type="date" value={form.dueAt ?? ""} onChange={(event) => set("dueAt", event.target.value)} />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="doc-file-label">파일명 / 링크 라벨</Label>
          <Input id="doc-file-label" value={form.fileLabel} onChange={(event) => set("fileLabel", event.target.value)} placeholder="예: 계약서_v3.pdf" />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>취소</Button>
          <Button type="submit" disabled={loading}>{loading ? "저장 중..." : initialDocument ? "문서 수정" : "문서 추가"}</Button>
        </DialogFooter>
      </form>
    </ResourceDialogShell>
  )
}

function ScheduleFormDialog({
  open,
  loading,
  deals,
  initialSchedule,
  onClose,
  onSave,
}: {
  open: boolean
  loading?: boolean
  deals: PartnerDeal[]
  initialSchedule?: PartnerScheduleItem | null
  onClose: () => void
  onSave: (payload: PartnerScheduleInput) => Promise<void> | void
}) {
  const [form, setForm] = useState<PartnerScheduleInput>(() => createScheduleFormState(initialSchedule, deals))

  const set = <K extends keyof PartnerScheduleInput>(key: K, value: PartnerScheduleInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onSave({
      ...form,
      title: form.title.trim(),
      dealId: form.dealId || undefined,
      startsAt: form.startsAt,
      endsAt: form.endsAt || undefined,
      owner: form.owner.trim(),
    })
  }

  return (
    <ResourceDialogShell
      open={open}
      onClose={onClose}
      title={initialSchedule ? "일정 수정" : "일정 추가"}
      description="파트너 후속 연락, 미팅, 마감 일정을 등록합니다."
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="schedule-title">일정 제목 *</Label>
          <Input id="schedule-title" value={form.title} onChange={(event) => set("title", event.target.value)} required />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="schedule-kind">유형</Label>
            <select id="schedule-kind" value={form.kind} onChange={(event) => set("kind", event.target.value as PartnerScheduleInput["kind"])} className={SELECT_CLASSNAME}>
              <option value="meeting">미팅</option>
              <option value="follow_up">후속</option>
              <option value="deadline">마감</option>
              <option value="renewal">갱신</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="schedule-status">상태</Label>
            <select id="schedule-status" value={form.status} onChange={(event) => set("status", event.target.value as PartnerScheduleInput["status"])} className={SELECT_CLASSNAME}>
              <option value="planned">예정</option>
              <option value="completed">완료</option>
              <option value="canceled">취소</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="schedule-deal">거래 연결</Label>
            <select id="schedule-deal" value={form.dealId} onChange={(event) => set("dealId", event.target.value)} className={SELECT_CLASSNAME}>
              <option value="">미연결</option>
              {deals.map((deal) => (
                <option key={deal.id} value={deal.id}>{deal.title}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="schedule-starts-at">시작일시 *</Label>
            <Input id="schedule-starts-at" type="datetime-local" value={form.startsAt} onChange={(event) => set("startsAt", event.target.value)} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="schedule-ends-at">종료일시</Label>
            <Input id="schedule-ends-at" type="datetime-local" value={form.endsAt ?? ""} onChange={(event) => set("endsAt", event.target.value)} />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="schedule-owner">담당자</Label>
          <Input id="schedule-owner" value={form.owner} onChange={(event) => set("owner", event.target.value)} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>취소</Button>
          <Button type="submit" disabled={loading}>{loading ? "저장 중..." : initialSchedule ? "일정 수정" : "일정 추가"}</Button>
        </DialogFooter>
      </form>
    </ResourceDialogShell>
  )
}

function SalesFormDialog({
  open,
  loading,
  deals,
  initialSales,
  onClose,
  onSave,
}: {
  open: boolean
  loading?: boolean
  deals: PartnerDeal[]
  initialSales?: PartnerSalesRecord | null
  onClose: () => void
  onSave: (payload: PartnerSalesInput) => Promise<void> | void
}) {
  const [form, setForm] = useState<PartnerSalesInput>(() => createSalesFormState(initialSales, deals))

  const set = <K extends keyof PartnerSalesInput>(key: K, value: PartnerSalesInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onSave({
      ...form,
      salesMonth: toSalesMonthStorageValue(form.salesMonth),
      dealId: form.dealId || undefined,
      unitsSold: Number(form.unitsSold ?? 0),
      grossAmount: Number(form.grossAmount ?? 0),
      netAmount: Number(form.netAmount ?? 0),
    })
  }

  return (
    <ResourceDialogShell
      open={open}
      onClose={onClose}
      title={initialSales ? "판매 기록 수정" : "판매 기록 추가"}
      description="월별 판매 댓수와 금액을 집계해 실적 탭과 리포트의 기준값으로 사용합니다."
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="sales-month">집계 월 *</Label>
            <Input id="sales-month" type="month" value={form.salesMonth} onChange={(event) => set("salesMonth", event.target.value)} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sales-deal">거래 연결</Label>
            <select id="sales-deal" value={form.dealId} onChange={(event) => set("dealId", event.target.value)} className={SELECT_CLASSNAME}>
              <option value="">미연결</option>
              {deals.map((deal) => (
                <option key={deal.id} value={deal.id}>{deal.title}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="sales-units">판매 댓수</Label>
            <Input id="sales-units" type="number" value={form.unitsSold} onChange={(event) => set("unitsSold", Number(event.target.value || 0))} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sales-gross">총액</Label>
            <Input id="sales-gross" type="number" value={form.grossAmount} onChange={(event) => set("grossAmount", Number(event.target.value || 0))} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sales-net">순매출</Label>
            <Input id="sales-net" type="number" value={form.netAmount} onChange={(event) => set("netAmount", Number(event.target.value || 0))} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>취소</Button>
          <Button type="submit" disabled={loading}>{loading ? "저장 중..." : initialSales ? "판매 수정" : "판매 추가"}</Button>
        </DialogFooter>
      </form>
    </ResourceDialogShell>
  )
}

export default function PartnerWorkspaceDetailClient({
  initialWorkspace,
  initialSource,
  initialWarning,
}: PartnerWorkspaceDetailClientProps) {
  const [workspace, setWorkspace] = useState(initialWorkspace)
  const [source, setSource] = useState(initialSource)
  const [warning, setWarning] = useState(initialWarning)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [savingKind, setSavingKind] = useState<string | null>(null)

  const [partnerDialogOpen, setPartnerDialogOpen] = useState(false)
  const [dealDialogOpen, setDealDialogOpen] = useState(false)
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false)
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [salesDialogOpen, setSalesDialogOpen] = useState(false)

  const [editingDeal, setEditingDeal] = useState<PartnerDeal | null>(null)
  const [editingDocument, setEditingDocument] = useState<PartnerDocument | null>(null)
  const [editingSchedule, setEditingSchedule] = useState<PartnerScheduleItem | null>(null)
  const [editingSales, setEditingSales] = useState<PartnerSalesRecord | null>(null)

  const totalNetSales = workspace.sales.reduce((sum, sale) => sum + sale.netAmount, 0)
  const totalUnits = workspace.sales.reduce((sum, sale) => sum + sale.unitsSold, 0)
  const pendingDocuments = workspace.documents.filter((document) =>
    ["draft", "sent", "overdue"].includes(document.status)
  )

  const applyResult = (data: { workspace: PartnerWorkspace; source: PartnerDataSource; warning?: string }) => {
    setWorkspace(data.workspace)
    setSource(data.source)
    setWarning(data.warning)
    setErrorMessage(null)
  }

  const savePartner = async (payload: PartnerSummaryInput) => {
    setSavingKind("partner")
    setErrorMessage(null)
    try {
      const data = await adminFetch(`/api/admin/partners/${workspace.partner.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      })
      if (data?.workspace) applyResult(data)
      setPartnerDialogOpen(false)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "저장에 실패했습니다.")
    } finally {
      setSavingKind(null)
    }
  }

  const saveDeal = async (payload: PartnerDealInput) => {
    setSavingKind("deal")
    setErrorMessage(null)
    try {
      const data = await adminFetch(`/api/admin/partners/${workspace.partner.id}/deals`, {
        method: "POST",
        body: JSON.stringify(payload),
      })
      if (data?.workspace) applyResult(data)
      setDealDialogOpen(false)
      setEditingDeal(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "거래 저장에 실패했습니다.")
    } finally {
      setSavingKind(null)
    }
  }

  const saveDocument = async (payload: PartnerDocumentInput) => {
    setSavingKind("document")
    setErrorMessage(null)
    try {
      const data = await adminFetch(`/api/admin/partners/${workspace.partner.id}/documents`, {
        method: "POST",
        body: JSON.stringify(payload),
      })
      if (data?.workspace) applyResult(data)
      setDocumentDialogOpen(false)
      setEditingDocument(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "문서 저장에 실패했습니다.")
    } finally {
      setSavingKind(null)
    }
  }

  const saveSchedule = async (payload: PartnerScheduleInput) => {
    setSavingKind("schedule")
    setErrorMessage(null)
    try {
      const data = await adminFetch(`/api/admin/partners/${workspace.partner.id}/schedule`, {
        method: "POST",
        body: JSON.stringify(payload),
      })
      if (data?.workspace) applyResult(data)
      setScheduleDialogOpen(false)
      setEditingSchedule(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "일정 저장에 실패했습니다.")
    } finally {
      setSavingKind(null)
    }
  }

  const saveSales = async (payload: PartnerSalesInput) => {
    setSavingKind("sales")
    setErrorMessage(null)
    try {
      const data = await adminFetch(`/api/admin/partners/${workspace.partner.id}/sales`, {
        method: "POST",
        body: JSON.stringify(payload),
      })
      if (data?.workspace) applyResult(data)
      setSalesDialogOpen(false)
      setEditingSales(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "판매 기록 저장에 실패했습니다.")
    } finally {
      setSavingKind(null)
    }
  }

  return (
    <div className="px-8 pt-10 pb-20">
      <div className="mb-8">
        <Link
          href="/admin/partners"
          className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-[#1a1a1a]/45 transition-colors hover:text-[#111110]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          파트너 운영으로 돌아가기
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-1">Partner Workspace</p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">{workspace.partner.name}</h1>
              <Badge variant="outline" className="border-[#e8e8e4] bg-white text-[#1a1a1a]/60">
                {workspace.partner.region}
              </Badge>
              <Badge variant="outline" className="border-[#e8e8e4] bg-white text-[#1a1a1a]/60">
                {workspace.partner.channel}
              </Badge>
            </div>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[#1a1a1a]/55">
              담당 {workspace.partner.accountManager} · 대표 연락처 {workspace.partner.ownerName} ({workspace.partner.ownerEmail}) · 다음 액션{" "}
              {formatDateTimeDisplay(workspace.partner.nextActionAt)}
            </p>
          </div>

          <div className="flex flex-col items-end gap-3">
            <div className="rounded-2xl border border-[#e8e8e4] bg-white px-4 py-3 text-[12px] text-[#1a1a1a]/55">
              <strong className="block text-[#111110]">운영 메모</strong>
              <span className="mt-1 block">{workspace.partner.notes ?? "메모 없음"}</span>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPartnerDialogOpen(true)}>
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

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          {
            label: "진행 거래",
            value: workspace.deals.length,
            sub: workspace.deals[0]?.title ?? "거래 없음",
            icon: <Handshake className="h-4 w-4 text-blue-600" />,
            accent: "bg-blue-50",
          },
          {
            label: "확인 문서",
            value: pendingDocuments.length,
            sub: "견적/계약/영수증",
            icon: <Receipt className="h-4 w-4 text-amber-600" />,
            accent: "bg-amber-50",
          },
          {
            label: "누적 판매 댓수",
            value: totalUnits,
            sub: "집계 기준 판매 실적",
            icon: <TrendingUp className="h-4 w-4 text-emerald-600" />,
            accent: "bg-emerald-50",
          },
          {
            label: "누적 순매출",
            value: formatCurrency(totalNetSales),
            sub: "샘플 집계",
            icon: <FileText className="h-4 w-4 text-[#111110]" />,
            accent: "bg-[#f0f0ec]",
          },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-[#e8e8e4] bg-white p-5">
            <div className={`mb-3 inline-flex rounded-xl p-2 ${card.accent}`}>{card.icon}</div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#1a1a1a]/35">{card.label}</p>
            <p className="mt-1 text-[24px] font-bold leading-none tracking-[-0.03em] text-[#111110]">{card.value}</p>
            <p className="mt-1.5 text-[11px] text-[#1a1a1a]/35">{card.sub}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-6 h-auto w-full flex-wrap justify-start rounded-2xl border border-[#e8e8e4] bg-white p-1">
          <TabsTrigger value="overview" className="rounded-xl px-4 py-2 text-[13px]">개요</TabsTrigger>
          <TabsTrigger value="deals" className="rounded-xl px-4 py-2 text-[13px]">거래</TabsTrigger>
          <TabsTrigger value="schedule" className="rounded-xl px-4 py-2 text-[13px]">일정</TabsTrigger>
          <TabsTrigger value="documents" className="rounded-xl px-4 py-2 text-[13px]">정산/문서</TabsTrigger>
          <TabsTrigger value="sales" className="rounded-xl px-4 py-2 text-[13px]">실적</TabsTrigger>
          <TabsTrigger value="automations" className="rounded-xl px-4 py-2 text-[13px]">자동화</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-2xl border border-[#e8e8e4] bg-white p-6">
              <h2 className="text-[14px] font-semibold text-[#111110]">운영 상태 요약</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl bg-[#fafaf8] p-4">
                  <p className="text-[12px] font-medium text-[#111110]">거래 흐름</p>
                  <p className="mt-1 text-[12px] leading-5 text-[#1a1a1a]/50">
                    견적과 계약은 거래 단위로 묶고, 판매 댓수와 정산 문서를 각 거래에 연결합니다.
                  </p>
                </div>
                <div className="rounded-2xl bg-[#fafaf8] p-4">
                  <p className="text-[12px] font-medium text-[#111110]">일정 흐름</p>
                  <p className="mt-1 text-[12px] leading-5 text-[#1a1a1a]/50">
                    후속 연락과 마감은 파트너 상세에서 관리하고, 필요하면 전역 캘린더로 동기화합니다.
                  </p>
                </div>
                <div className="rounded-2xl bg-[#fafaf8] p-4">
                  <p className="text-[12px] font-medium text-[#111110]">정산 흐름</p>
                  <p className="mt-1 text-[12px] leading-5 text-[#1a1a1a]/50">
                    영수증은 계약과 분리된 정산 상태로 두어 연체와 누락을 별도로 추적합니다.
                  </p>
                </div>
                <div className="rounded-2xl bg-[#fafaf8] p-4">
                  <p className="text-[12px] font-medium text-[#111110]">자동화 흐름</p>
                  <p className="mt-1 text-[12px] leading-5 text-[#1a1a1a]/50">
                    견적 만료, 영수증 연체, 월말 판매 집계를 이벤트 기반으로 자동화합니다.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#e8e8e4] bg-white p-6">
              <h2 className="text-[14px] font-semibold text-[#111110]">즉시 확인할 항목</h2>
              <ul className="mt-4 space-y-3 text-[12px] leading-5 text-[#1a1a1a]/55">
                {workspace.schedule.slice(0, 3).map((item) => (
                  <li key={item.id} className="rounded-2xl bg-[#fafaf8] px-4 py-3">
                    <strong className="block text-[#111110]">{item.title}</strong>
                    <span>{formatDateTimeDisplay(item.startsAt)} · {item.owner}</span>
                  </li>
                ))}
                {pendingDocuments.slice(0, 2).map((document) => (
                  <li key={document.id} className="rounded-2xl bg-[#fafaf8] px-4 py-3">
                    <strong className="block text-[#111110]">{document.title}</strong>
                    <span>{DOCUMENT_KIND_LABEL[document.kind]} · {DOCUMENT_STATUS_LABEL[document.status]}</span>
                  </li>
                ))}
                {workspace.schedule.length === 0 && pendingDocuments.length === 0 && (
                  <li className="rounded-2xl bg-[#fafaf8] px-4 py-6 text-center text-[#1a1a1a]/45">
                    아직 바로 확인할 일정이나 문서 이슈가 없습니다.
                  </li>
                )}
              </ul>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="deals">
          <SectionHeader
            title="거래 관리"
            description="견적, 계약, 판매 댓수의 기준이 되는 거래를 등록하고 수정합니다."
            action={
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setEditingDeal(null)
                  setDealDialogOpen(true)
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                거래 추가
              </Button>
            }
          />
          <div className="space-y-4">
            {workspace.deals.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#d9d9d3] bg-white px-6 py-12 text-center">
                <p className="text-[14px] font-semibold text-[#111110]">등록된 거래가 없습니다.</p>
                <p className="mt-2 text-[12px] leading-5 text-[#1a1a1a]/45">
                  견적이나 계약이 시작되면 거래부터 만들어두는 편이 가장 관리하기 쉽습니다.
                </p>
              </div>
            ) : (
              workspace.deals.map((deal) => (
                <div key={deal.id} className="rounded-2xl border border-[#e8e8e4] bg-white p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-[15px] font-semibold text-[#111110]">{deal.title}</h2>
                        <Badge variant="outline" className="border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/55">
                          {DEAL_STAGE_LABEL[deal.stage]}
                        </Badge>
                      </div>
                      <p className="mt-2 text-[12px] text-[#1a1a1a]/50">
                        담당 {deal.manager} · 예상 마감 {deal.expectedCloseAt ?? "미정"} · 판매 댓수 {deal.salesUnits}대
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="rounded-2xl bg-[#fafaf8] px-4 py-3 text-right">
                        <span className="block text-[11px] text-[#1a1a1a]/35">거래 금액</span>
                        <strong className="text-[16px] text-[#111110]">{formatCurrency(deal.quoteAmount)}</strong>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => {
                          setEditingDeal(deal)
                          setDealDialogOpen(true)
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        수정
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="schedule">
          <SectionHeader
            title="일정 관리"
            description="후속 연락, 마감, 미팅을 파트너 문맥으로 등록합니다."
            action={
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setEditingSchedule(null)
                  setScheduleDialogOpen(true)
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                일정 추가
              </Button>
            }
          />
          <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
            <div className="flex items-center gap-2 border-b border-[#e8e8e4] px-6 py-4">
              <CalendarDays className="h-4 w-4 text-[#1a1a1a]/40" />
              <h2 className="text-[14px] font-semibold text-[#111110]">파트너 일정 타임라인</h2>
            </div>
            <div className="divide-y divide-[#e8e8e4]">
              {workspace.schedule.length === 0 ? (
                <div className="px-6 py-10 text-center text-[13px] text-[#1a1a1a]/35">
                  등록된 일정이 없습니다. 후속 연락이나 마감 일정을 먼저 넣어두면 운영 흐름이 훨씬 안정적입니다.
                </div>
              ) : (
                workspace.schedule.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-3 px-6 py-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/55">
                          {SCHEDULE_KIND_LABEL[item.kind]}
                        </Badge>
                        <h3 className="text-[13px] font-semibold text-[#111110]">{item.title}</h3>
                      </div>
                      <p className="mt-1 text-[12px] text-[#1a1a1a]/50">
                        {formatDateTimeDisplay(item.startsAt)}
                        {item.endsAt ? ` - ${formatDateTimeDisplay(item.endsAt)}` : ""} · 담당 {item.owner} · 상태 {SCHEDULE_STATUS_LABEL[item.status]}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => {
                        setEditingSchedule(item)
                        setScheduleDialogOpen(true)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      수정
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="documents">
          <SectionHeader
            title="정산/문서 관리"
            description="견적서, 계약서, 영수증을 거래와 연결해 관리합니다."
            action={
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setEditingDocument(null)
                  setDocumentDialogOpen(true)
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                문서 추가
              </Button>
            }
          />
          <div className="space-y-4">
            {workspace.documents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#d9d9d3] bg-white px-6 py-12 text-center">
                <p className="text-[14px] font-semibold text-[#111110]">등록된 문서가 없습니다.</p>
                <p className="mt-2 text-[12px] leading-5 text-[#1a1a1a]/45">
                  견적서, 계약서, 영수증을 거래와 연결해두면 정산 누락을 줄일 수 있습니다.
                </p>
              </div>
            ) : (
              workspace.documents.map((document) => (
                <div key={document.id} className="rounded-2xl border border-[#e8e8e4] bg-white p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-[14px] font-semibold text-[#111110]">{document.title}</h2>
                        <Badge variant="outline" className="border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/55">
                          {DOCUMENT_KIND_LABEL[document.kind]}
                        </Badge>
                        <Badge variant="outline" className="border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/55">
                          {DOCUMENT_STATUS_LABEL[document.status]}
                        </Badge>
                      </div>
                      <p className="mt-2 text-[12px] text-[#1a1a1a]/50">
                        발행 {document.issuedAt ?? "미정"} · 마감 {document.dueAt ?? "미정"} · 파일 {document.fileLabel}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {document.amount != null && (
                        <div className="rounded-2xl bg-[#fafaf8] px-4 py-3 text-right text-[12px]">
                          <span className="block text-[#1a1a1a]/35">금액</span>
                          <strong className="text-[15px] text-[#111110]">{formatCurrency(document.amount)}</strong>
                        </div>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => {
                          setEditingDocument(document)
                          setDocumentDialogOpen(true)
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        수정
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="sales">
          <SectionHeader
            title="판매 실적"
            description="월별 판매 댓수와 금액을 기록합니다."
            action={
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setEditingSales(null)
                  setSalesDialogOpen(true)
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                실적 추가
              </Button>
            }
          />
          <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
            <div className="flex items-center gap-2 border-b border-[#e8e8e4] px-6 py-4">
              <TrendingUp className="h-4 w-4 text-[#1a1a1a]/40" />
              <h2 className="text-[14px] font-semibold text-[#111110]">월별 판매 집계</h2>
            </div>
            <div className="divide-y divide-[#e8e8e4]">
              {workspace.sales.length === 0 ? (
                <div className="px-6 py-10 text-center text-[13px] text-[#1a1a1a]/35">
                  아직 누적된 판매 기록이 없습니다.
                </div>
              ) : (
                workspace.sales.map((sale) => (
                  <div key={sale.id} className="grid grid-cols-[1fr_auto] gap-4 px-6 py-4">
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
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 self-start"
                      onClick={() => {
                        setEditingSales(sale)
                        setSalesDialogOpen(true)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      수정
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="automations">
          <div className="space-y-4">
            {workspace.automations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#d9d9d3] bg-white px-6 py-12 text-center">
                <p className="text-[14px] font-semibold text-[#111110]">설정된 자동화가 없습니다.</p>
                <p className="mt-2 text-[12px] leading-5 text-[#1a1a1a]/45">
                  견적 만료, 연체 영수증, 월말 판매 집계부터 자동화하면 운영 부담을 크게 줄일 수 있습니다.
                </p>
              </div>
            ) : (
              workspace.automations.map((automation) => (
                <div key={automation.id} className="rounded-2xl border border-[#e8e8e4] bg-white p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-[#111110]/55" />
                        <h2 className="text-[14px] font-semibold text-[#111110]">{automation.name}</h2>
                      </div>
                      <p className="mt-2 text-[12px] text-[#1a1a1a]/50">
                        Trigger: {automation.trigger} · Action: {automation.action}
                      </p>
                      <p className="mt-1 text-[12px] text-[#1a1a1a]/50">
                        Destination: {automation.destination}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-[#fafaf8] px-4 py-3 text-[12px] text-[#1a1a1a]/55">
                      <strong className="block text-[#111110]">{AUTOMATION_STATUS_LABEL[automation.status]}</strong>
                      <span className="mt-1 block">최근 실행 {automation.lastRunAt ? formatDateTimeDisplay(automation.lastRunAt) : "없음"}</span>
                      <span className="block">다음 실행 {formatDateTimeDisplay(automation.nextRunAt)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      <PartnerFormDialog
        key={`${partnerDialogOpen ? "open" : "closed"}-${workspace.partner.id}`}
        open={partnerDialogOpen}
        initialPartner={workspace.partner}
        loading={savingKind === "partner"}
        onClose={() => !savingKind && setPartnerDialogOpen(false)}
        onSave={savePartner}
      />

      <DealFormDialog
        key={`${dealDialogOpen ? "open" : "closed"}-${editingDeal?.id ?? "new"}`}
        open={dealDialogOpen}
        initialDeal={editingDeal}
        loading={savingKind === "deal"}
        onClose={() => {
          if (!savingKind) {
            setDealDialogOpen(false)
            setEditingDeal(null)
          }
        }}
        onSave={saveDeal}
      />

      <DocumentFormDialog
        key={`${documentDialogOpen ? "open" : "closed"}-${editingDocument?.id ?? "new"}`}
        open={documentDialogOpen}
        deals={workspace.deals}
        initialDocument={editingDocument}
        loading={savingKind === "document"}
        onClose={() => {
          if (!savingKind) {
            setDocumentDialogOpen(false)
            setEditingDocument(null)
          }
        }}
        onSave={saveDocument}
      />

      <ScheduleFormDialog
        key={`${scheduleDialogOpen ? "open" : "closed"}-${editingSchedule?.id ?? "new"}`}
        open={scheduleDialogOpen}
        deals={workspace.deals}
        initialSchedule={editingSchedule}
        loading={savingKind === "schedule"}
        onClose={() => {
          if (!savingKind) {
            setScheduleDialogOpen(false)
            setEditingSchedule(null)
          }
        }}
        onSave={saveSchedule}
      />

      <SalesFormDialog
        key={`${salesDialogOpen ? "open" : "closed"}-${editingSales?.id ?? "new"}`}
        open={salesDialogOpen}
        deals={workspace.deals}
        initialSales={editingSales}
        loading={savingKind === "sales"}
        onClose={() => {
          if (!savingKind) {
            setSalesDialogOpen(false)
            setEditingSales(null)
          }
        }}
        onSave={saveSales}
      />
    </div>
  )
}
