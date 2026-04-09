"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import type { FormEvent, ReactNode } from "react"

import PartnerFormDialog from "@/components/admin/partners/PartnerFormDialog"
import PartnerWorkspaceShell, { type PartnerWorkspaceTab } from "@/components/admin/partners/PartnerWorkspaceShell"
import StandardQuoteTemplateEditor from "@/components/admin/partners/StandardQuoteTemplateEditor"
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
import {
  buildStandardQuoteDetails,
  buildStandardQuoteFileLabel,
  buildStandardQuoteTitle,
} from "@/lib/standard-quote-template"
import type {
  PartnerActivityLog,
  PartnerActivityLogInput,
  PartnerContact,
  PartnerContactInput,
  PartnerDataSource,
  PartnerDeal,
  PartnerDealInput,
  PartnerChecklistInput,
  PartnerDocument,
  PartnerDocumentInput,
  PartnerIssueInput,
  PartnerOpsChecklistItem,
  PartnerOpsIssue,
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

interface PartnerActionContext {
  deal?: PartnerDeal
  dealId?: string
  tab?: PartnerWorkspaceTab
}

const SELECT_CLASSNAME =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
const TEXTAREA_CLASSNAME =
  "flex min-h-[112px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

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

function toSalesMonthInputValue(value?: string) {
  if (!value) return ""
  return value.slice(0, 7)
}

function toSalesMonthStorageValue(value: string) {
  if (!value) return value
  return value.slice(0, 7)
}

function getTodayDateValue() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function getDefaultDealId(deals: PartnerDeal[]) {
  return (
    deals.find((deal) => ["active", "contract_sent", "quoted", "discovery"].includes(deal.stage))?.id ??
    deals[0]?.id ??
    ""
  )
}

const WORKSPACE_TABS: readonly PartnerWorkspaceTab[] = [
  "overview",
  "deal-flow",
  "fulfillment",
  "documents",
  "logs-issues",
  "automations",
]

function isWorkspaceTab(value: string | null): value is PartnerWorkspaceTab {
  return Boolean(value && WORKSPACE_TABS.includes(value as PartnerWorkspaceTab))
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

function createDocumentFormState(
  initialDocument: PartnerDocument | null | undefined,
  deals: PartnerDeal[],
  defaultDealId?: string
): PartnerDocumentInput {
  if (!initialDocument) {
    const issuedAt = getTodayDateValue()
    return {
      kind: "quote",
      status: "draft",
      title: "",
      dealId: defaultDealId || getDefaultDealId(deals),
      amount: 0,
      issuedAt,
      dueAt: "",
      fileLabel: "",
      quoteDetails: buildStandardQuoteDetails({ issuedAt }),
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
    quoteDetails: initialDocument.quoteDetails
      ? buildStandardQuoteDetails({
          ...initialDocument.quoteDetails,
          issuedAt: initialDocument.quoteDetails.issuedAt ?? initialDocument.issuedAt ?? "",
          validUntil: initialDocument.quoteDetails.validUntil ?? initialDocument.dueAt ?? "",
        })
      : undefined,
  }
}

function createScheduleFormState(
  initialSchedule: PartnerScheduleItem | null | undefined,
  deals: PartnerDeal[],
  defaultDealId?: string
): PartnerScheduleInput {
  if (!initialSchedule) {
    return {
      kind: "meeting",
      status: "planned",
      title: "",
      dealId: defaultDealId || getDefaultDealId(deals),
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

function createSalesFormState(
  initialSales: PartnerSalesRecord | null | undefined,
  deals: PartnerDeal[],
  defaultDealId?: string
): PartnerSalesInput {
  if (!initialSales) {
    return {
      salesMonth: "",
      dealId: defaultDealId || getDefaultDealId(deals),
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

function createContactFormState(
  initialContact: PartnerContact | null | undefined,
  partner: PartnerWorkspace["partner"]
): PartnerContactInput {
  if (!initialContact) {
    return {
      name: partner.ownerName,
      role: partner.accountManager || "",
      email: partner.ownerEmail,
      phone: "",
      isPrimary: true,
    }
  }

  return {
    id: initialContact.id,
    name: initialContact.name,
    role: initialContact.role ?? "",
    email: initialContact.email ?? "",
    phone: initialContact.phone ?? "",
    isPrimary: initialContact.isPrimary,
  }
}

function createChecklistFormState(
  initialChecklist: PartnerOpsChecklistItem | null | undefined,
  deals: PartnerDeal[],
  defaultDealId?: string
): PartnerChecklistInput {
  if (!initialChecklist) {
    return {
      checklistGroup: "fulfillment",
      title: "",
      dealId: defaultDealId || getDefaultDealId(deals),
      itemCategory: "",
      itemCode: "",
      itemName: "",
      plannedQuantity: 0,
      confirmedQuantity: 0,
      todoStatus: "open",
      installStatus: "planned",
      owner: "",
      dueAt: "",
      completedAt: "",
      notes: "",
    }
  }

  return {
    id: initialChecklist.id,
    dealId: initialChecklist.dealId ?? "",
    parentItemId: initialChecklist.parentItemId,
    checklistGroup: initialChecklist.checklistGroup,
    title: initialChecklist.title,
    itemCategory: initialChecklist.itemCategory ?? "",
    itemCode: initialChecklist.itemCode ?? "",
    itemName: initialChecklist.itemName ?? "",
    plannedQuantity: initialChecklist.plannedQuantity ?? 0,
    confirmedQuantity: initialChecklist.confirmedQuantity ?? 0,
    todoStatus: initialChecklist.todoStatus,
    installStatus: initialChecklist.installStatus,
    owner: initialChecklist.owner ?? "",
    dueAt: toDateTimeInputValue(initialChecklist.dueAt),
    completedAt: toDateTimeInputValue(initialChecklist.completedAt),
    notes: initialChecklist.notes ?? "",
  }
}

function createIssueFormState(
  initialIssue: PartnerOpsIssue | null | undefined,
  deals: PartnerDeal[],
  defaultDealId?: string
): PartnerIssueInput {
  if (!initialIssue) {
    return {
      title: "",
      category: "운영",
      dealId: defaultDealId || getDefaultDealId(deals),
      severity: "medium",
      status: "open",
      owner: "",
      verifyWith: "",
      nextCheckAt: "",
      dueAt: "",
      resolvedAt: "",
      relatedDocumentId: "",
      relatedChecklistItemId: "",
      facts: "",
      unresolvedPoints: "",
      currentAssumption: "",
      resolutionSummary: "",
    }
  }

  return {
    id: initialIssue.id,
    dealId: initialIssue.dealId ?? "",
    relatedDocumentId: initialIssue.relatedDocumentId ?? "",
    relatedChecklistItemId: initialIssue.relatedChecklistItemId ?? "",
    title: initialIssue.title,
    category: initialIssue.category,
    severity: initialIssue.severity,
    status: initialIssue.status,
    facts: initialIssue.facts ?? "",
    unresolvedPoints: initialIssue.unresolvedPoints ?? "",
    currentAssumption: initialIssue.currentAssumption ?? "",
    verifyWith: initialIssue.verifyWith ?? "",
    owner: initialIssue.owner ?? "",
    nextCheckAt: toDateTimeInputValue(initialIssue.nextCheckAt),
    dueAt: toDateTimeInputValue(initialIssue.dueAt),
    resolvedAt: toDateTimeInputValue(initialIssue.resolvedAt),
    resolutionSummary: initialIssue.resolutionSummary ?? "",
  }
}

function createActivityLogFormState(
  initialLog: PartnerActivityLog | null | undefined,
  deals: PartnerDeal[],
  defaultDealId?: string
): PartnerActivityLogInput {
  if (!initialLog) {
    return {
      summary: "",
      action: "",
      logCategory: "general",
      dealId: defaultDealId || getDefaultDealId(deals),
      status: "recorded",
      actor: "",
      documentId: "",
      scheduleItemId: "",
      checklistItemId: "",
      issueId: "",
      subjectType: "partner",
      subjectId: "",
      nextAction: "",
      details: "",
      dueAt: "",
      occurredAt: "",
    }
  }

  return {
    id: initialLog.id,
    dealId: initialLog.dealId ?? "",
    documentId: initialLog.documentId ?? "",
    scheduleItemId: initialLog.scheduleItemId ?? "",
    checklistItemId: initialLog.checklistItemId ?? "",
    issueId: initialLog.issueId ?? "",
    subjectType: initialLog.subjectType,
    subjectId: initialLog.subjectId ?? "",
    logCategory: initialLog.logCategory,
    status: initialLog.status,
    actor: initialLog.actor ?? "",
    action: initialLog.action,
    summary: initialLog.summary,
    details: initialLog.details ?? "",
    nextAction: initialLog.nextAction ?? "",
    dueAt: toDateTimeInputValue(initialLog.dueAt),
    occurredAt: toDateTimeInputValue(initialLog.occurredAt),
  }
}

function ResourceDialogShell({
  open,
  onClose,
  title,
  description,
  contentClassName,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  description: string
  contentClassName?: string
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className={`bg-white ${contentClassName ?? "sm:max-w-2xl"}`}>
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
        <div className="grid gap-4 md:grid-cols-2">
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
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="deal-amount">견적 금액</Label>
            <Input id="deal-amount" type="number" value={form.quoteAmount} onChange={(event) => set("quoteAmount", Number(event.target.value || 0))} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="deal-sales-units">판매 댓수</Label>
            <Input id="deal-sales-units" type="number" value={form.salesUnits} onChange={(event) => set("salesUnits", Number(event.target.value || 0))} />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
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
  defaultDealId,
  onClose,
  onSave,
}: {
  open: boolean
  loading?: boolean
  deals: PartnerDeal[]
  initialDocument?: PartnerDocument | null
  defaultDealId?: string
  onClose: () => void
  onSave: (payload: PartnerDocumentInput) => Promise<void> | void
}) {
  const [form, setForm] = useState<PartnerDocumentInput>(() =>
    createDocumentFormState(initialDocument, deals, defaultDealId)
  )

  const set = <K extends keyof PartnerDocumentInput>(key: K, value: PartnerDocumentInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (form.kind === "quote") {
      const quoteDetails = buildStandardQuoteDetails({
        ...form.quoteDetails,
        issuedAt: form.issuedAt || form.quoteDetails?.issuedAt,
        validUntil: form.dueAt || form.quoteDetails?.validUntil,
      })

      await onSave({
        ...form,
        title: buildStandardQuoteTitle(quoteDetails),
        fileLabel: buildStandardQuoteFileLabel(quoteDetails),
        dealId: form.dealId || undefined,
        amount: quoteDetails.grandTotalAmount ?? undefined,
        issuedAt: quoteDetails.issuedAt || undefined,
        dueAt: quoteDetails.validUntil || undefined,
        quoteDetails,
      })
      return
    }

    await onSave({
      ...form,
      title: form.title.trim(),
      fileLabel: form.fileLabel.trim() || "첨부 문서",
      dealId: form.dealId || undefined,
      amount: form.amount ? Number(form.amount) : undefined,
      issuedAt: form.issuedAt || undefined,
      dueAt: form.dueAt || undefined,
      quoteDetails: undefined,
    })
  }

  return (
    <ResourceDialogShell
      open={open}
      onClose={onClose}
      title={initialDocument ? "문서 수정" : "문서 추가"}
      description="견적서, 계약서, 영수증을 거래 흐름과 연결해 관리합니다."
      contentClassName={form.kind === "quote" ? "sm:max-w-[1180px]" : "sm:max-w-2xl"}
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="doc-kind">문서 종류</Label>
            <select
              id="doc-kind"
              value={form.kind}
              onChange={(event) => {
                const nextKind = event.target.value as PartnerDocumentInput["kind"]
                setForm((prev) => ({
                  ...prev,
                  kind: nextKind,
                  quoteDetails:
                    nextKind === "quote"
                      ? buildStandardQuoteDetails({
                          ...prev.quoteDetails,
                          issuedAt: prev.issuedAt || prev.quoteDetails?.issuedAt || getTodayDateValue(),
                          validUntil: prev.dueAt || prev.quoteDetails?.validUntil,
                        })
                      : prev.quoteDetails,
                }))
              }}
              className={SELECT_CLASSNAME}
            >
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
        {form.kind === "quote" ? (
          <StandardQuoteTemplateEditor
            value={form.quoteDetails}
            issuedAt={form.issuedAt ?? ""}
            validUntil={form.dueAt ?? ""}
            onIssuedAtChange={(value) => set("issuedAt", value)}
            onValidUntilChange={(value) => set("dueAt", value)}
            onChange={(quoteDetails) => set("quoteDetails", quoteDetails)}
          />
        ) : (
          <>
            <div className="grid gap-2">
              <Label htmlFor="doc-title">문서 제목 *</Label>
              <Input id="doc-title" value={form.title} onChange={(event) => set("title", event.target.value)} required />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
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
          </>
        )}
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
  defaultDealId,
  onClose,
  onSave,
}: {
  open: boolean
  loading?: boolean
  deals: PartnerDeal[]
  initialSchedule?: PartnerScheduleItem | null
  defaultDealId?: string
  onClose: () => void
  onSave: (payload: PartnerScheduleInput) => Promise<void> | void
}) {
  const [form, setForm] = useState<PartnerScheduleInput>(() =>
    createScheduleFormState(initialSchedule, deals, defaultDealId)
  )

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
        <div className="grid gap-4 md:grid-cols-3">
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
        <div className="grid gap-4 md:grid-cols-2">
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
  defaultDealId,
  onClose,
  onSave,
}: {
  open: boolean
  loading?: boolean
  deals: PartnerDeal[]
  initialSales?: PartnerSalesRecord | null
  defaultDealId?: string
  onClose: () => void
  onSave: (payload: PartnerSalesInput) => Promise<void> | void
}) {
  const [form, setForm] = useState<PartnerSalesInput>(() =>
    createSalesFormState(initialSales, deals, defaultDealId)
  )

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
        <div className="grid gap-4 md:grid-cols-2">
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
        <div className="grid gap-4 md:grid-cols-3">
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

function ChecklistFormDialog({
  open,
  loading,
  deals,
  initialChecklist,
  defaultDealId,
  onClose,
  onSave,
}: {
  open: boolean
  loading?: boolean
  deals: PartnerDeal[]
  initialChecklist?: PartnerOpsChecklistItem | null
  defaultDealId?: string
  onClose: () => void
  onSave: (payload: PartnerChecklistInput) => Promise<void> | void
}) {
  const [form, setForm] = useState<PartnerChecklistInput>(() =>
    createChecklistFormState(initialChecklist, deals, defaultDealId)
  )

  const set = <K extends keyof PartnerChecklistInput>(key: K, value: PartnerChecklistInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onSave({
      ...form,
      title: form.title.trim(),
      checklistGroup: form.checklistGroup.trim(),
      dealId: form.dealId || undefined,
      itemCategory: form.itemCategory?.trim() || undefined,
      itemCode: form.itemCode?.trim() || undefined,
      itemName: form.itemName?.trim() || undefined,
      plannedQuantity: form.plannedQuantity == null ? undefined : Number(form.plannedQuantity),
      confirmedQuantity: form.confirmedQuantity == null ? undefined : Number(form.confirmedQuantity),
      owner: form.owner?.trim() || undefined,
      dueAt: form.dueAt || undefined,
      completedAt: form.completedAt || undefined,
      notes: form.notes?.trim() || undefined,
    })
  }

  return (
    <ResourceDialogShell
      open={open}
      onClose={onClose}
      title={initialChecklist ? "이행 체크 수정" : "이행 체크 추가"}
      description="설치 준비, 수량 확인, 후속 작업을 체크리스트로 쪼개서 관리합니다."
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="checklist-title">체크 제목 *</Label>
          <Input id="checklist-title" value={form.title} onChange={(event) => set("title", event.target.value)} required />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="checklist-group">그룹 *</Label>
            <Input id="checklist-group" value={form.checklistGroup} onChange={(event) => set("checklistGroup", event.target.value)} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="checklist-deal">거래 연결</Label>
            <select id="checklist-deal" value={form.dealId} onChange={(event) => set("dealId", event.target.value)} className={SELECT_CLASSNAME}>
              <option value="">미연결</option>
              {deals.map((deal) => (
                <option key={deal.id} value={deal.id}>{deal.title}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="checklist-item-category">품목 분류</Label>
            <Input id="checklist-item-category" value={form.itemCategory ?? ""} onChange={(event) => set("itemCategory", event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="checklist-item-code">품목 코드</Label>
            <Input id="checklist-item-code" value={form.itemCode ?? ""} onChange={(event) => set("itemCode", event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="checklist-item-name">품목명</Label>
            <Input id="checklist-item-name" value={form.itemName ?? ""} onChange={(event) => set("itemName", event.target.value)} />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="checklist-planned-quantity">계획 수량</Label>
            <Input id="checklist-planned-quantity" type="number" min="0" value={form.plannedQuantity ?? 0} onChange={(event) => set("plannedQuantity", Number(event.target.value || 0))} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="checklist-confirmed-quantity">확정 수량</Label>
            <Input id="checklist-confirmed-quantity" type="number" min="0" value={form.confirmedQuantity ?? 0} onChange={(event) => set("confirmedQuantity", Number(event.target.value || 0))} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="checklist-owner">담당자</Label>
            <Input id="checklist-owner" value={form.owner ?? ""} onChange={(event) => set("owner", event.target.value)} />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="checklist-todo-status">TODO 상태</Label>
            <select id="checklist-todo-status" value={form.todoStatus} onChange={(event) => set("todoStatus", event.target.value as PartnerChecklistInput["todoStatus"])} className={SELECT_CLASSNAME}>
              <option value="open">Open</option>
              <option value="waiting_partner">Waiting partner</option>
              <option value="waiting_internal">Waiting internal</option>
              <option value="blocked">Blocked</option>
              <option value="done">Done</option>
              <option value="canceled">Canceled</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="checklist-install-status">이행 상태</Label>
            <select id="checklist-install-status" value={form.installStatus} onChange={(event) => set("installStatus", event.target.value as PartnerChecklistInput["installStatus"])} className={SELECT_CLASSNAME}>
              <option value="planned">Planned</option>
              <option value="ordered">Ordered</option>
              <option value="delivered">Delivered</option>
              <option value="installed">Installed</option>
              <option value="verified">Verified</option>
              <option value="issue">Issue</option>
            </select>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="checklist-due-at">마감 일시</Label>
            <Input id="checklist-due-at" type="datetime-local" value={form.dueAt ?? ""} onChange={(event) => set("dueAt", event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="checklist-completed-at">완료 일시</Label>
            <Input id="checklist-completed-at" type="datetime-local" value={form.completedAt ?? ""} onChange={(event) => set("completedAt", event.target.value)} />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="checklist-notes">메모</Label>
          <textarea id="checklist-notes" className={TEXTAREA_CLASSNAME} value={form.notes ?? ""} onChange={(event) => set("notes", event.target.value)} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>취소</Button>
          <Button type="submit" disabled={loading}>{loading ? "저장 중..." : initialChecklist ? "체크 수정" : "체크 추가"}</Button>
        </DialogFooter>
      </form>
    </ResourceDialogShell>
  )
}

function IssueFormDialog({
  open,
  loading,
  deals,
  documents,
  checklists,
  initialIssue,
  defaultDealId,
  onClose,
  onSave,
}: {
  open: boolean
  loading?: boolean
  deals: PartnerDeal[]
  documents: PartnerDocument[]
  checklists: PartnerOpsChecklistItem[]
  initialIssue?: PartnerOpsIssue | null
  defaultDealId?: string
  onClose: () => void
  onSave: (payload: PartnerIssueInput) => Promise<void> | void
}) {
  const [form, setForm] = useState<PartnerIssueInput>(() =>
    createIssueFormState(initialIssue, deals, defaultDealId)
  )

  const set = <K extends keyof PartnerIssueInput>(key: K, value: PartnerIssueInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onSave({
      ...form,
      title: form.title.trim(),
      category: form.category.trim(),
      dealId: form.dealId || undefined,
      relatedDocumentId: form.relatedDocumentId || undefined,
      relatedChecklistItemId: form.relatedChecklistItemId || undefined,
      facts: form.facts?.trim() || undefined,
      unresolvedPoints: form.unresolvedPoints?.trim() || undefined,
      currentAssumption: form.currentAssumption?.trim() || undefined,
      verifyWith: form.verifyWith?.trim() || undefined,
      owner: form.owner?.trim() || undefined,
      nextCheckAt: form.nextCheckAt || undefined,
      dueAt: form.dueAt || undefined,
      resolvedAt: form.resolvedAt || undefined,
      resolutionSummary: form.resolutionSummary?.trim() || undefined,
    })
  }

  return (
    <ResourceDialogShell
      open={open}
      onClose={onClose}
      title={initialIssue ? "이슈 수정" : "이슈 추가"}
      description="계약, 설치, 정산 과정에서 판단이 필요한 이슈를 notes 밖으로 분리해 관리합니다."
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="issue-title">이슈 제목 *</Label>
          <Input id="issue-title" value={form.title} onChange={(event) => set("title", event.target.value)} required />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="issue-category">분류 *</Label>
            <Input id="issue-category" value={form.category} onChange={(event) => set("category", event.target.value)} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="issue-deal">거래 연결</Label>
            <select id="issue-deal" value={form.dealId} onChange={(event) => set("dealId", event.target.value)} className={SELECT_CLASSNAME}>
              <option value="">미연결</option>
              {deals.map((deal) => (
                <option key={deal.id} value={deal.id}>{deal.title}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="issue-severity">심각도</Label>
            <select id="issue-severity" value={form.severity} onChange={(event) => set("severity", event.target.value as PartnerIssueInput["severity"])} className={SELECT_CLASSNAME}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="issue-status">상태</Label>
            <select id="issue-status" value={form.status} onChange={(event) => set("status", event.target.value as PartnerIssueInput["status"])} className={SELECT_CLASSNAME}>
              <option value="open">Open</option>
              <option value="waiting">Waiting</option>
              <option value="blocked">Blocked</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="issue-owner">담당자</Label>
            <Input id="issue-owner" value={form.owner ?? ""} onChange={(event) => set("owner", event.target.value)} />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="issue-document">연결 문서</Label>
            <select id="issue-document" value={form.relatedDocumentId ?? ""} onChange={(event) => set("relatedDocumentId", event.target.value)} className={SELECT_CLASSNAME}>
              <option value="">미연결</option>
              {documents.map((document) => (
                <option key={document.id} value={document.id}>{document.title}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="issue-checklist">연결 체크</Label>
            <select id="issue-checklist" value={form.relatedChecklistItemId ?? ""} onChange={(event) => set("relatedChecklistItemId", event.target.value)} className={SELECT_CLASSNAME}>
              <option value="">미연결</option>
              {checklists.map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="issue-verify-with">확인 대상</Label>
            <Input id="issue-verify-with" value={form.verifyWith ?? ""} onChange={(event) => set("verifyWith", event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="issue-next-check-at">다음 확인 일시</Label>
            <Input id="issue-next-check-at" type="datetime-local" value={form.nextCheckAt ?? ""} onChange={(event) => set("nextCheckAt", event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="issue-due-at">마감 일시</Label>
            <Input id="issue-due-at" type="datetime-local" value={form.dueAt ?? ""} onChange={(event) => set("dueAt", event.target.value)} />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="issue-facts">사실 관계</Label>
            <textarea id="issue-facts" className={TEXTAREA_CLASSNAME} value={form.facts ?? ""} onChange={(event) => set("facts", event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="issue-unresolved">미해결 포인트</Label>
            <textarea id="issue-unresolved" className={TEXTAREA_CLASSNAME} value={form.unresolvedPoints ?? ""} onChange={(event) => set("unresolvedPoints", event.target.value)} />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="issue-assumption">현재 가정</Label>
            <textarea id="issue-assumption" className={TEXTAREA_CLASSNAME} value={form.currentAssumption ?? ""} onChange={(event) => set("currentAssumption", event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="issue-resolution-summary">해결 요약</Label>
            <textarea id="issue-resolution-summary" className={TEXTAREA_CLASSNAME} value={form.resolutionSummary ?? ""} onChange={(event) => set("resolutionSummary", event.target.value)} />
          </div>
        </div>
        <div className="grid gap-2 md:max-w-sm">
          <Label htmlFor="issue-resolved-at">해결 일시</Label>
          <Input id="issue-resolved-at" type="datetime-local" value={form.resolvedAt ?? ""} onChange={(event) => set("resolvedAt", event.target.value)} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>취소</Button>
          <Button type="submit" disabled={loading}>{loading ? "저장 중..." : initialIssue ? "이슈 수정" : "이슈 추가"}</Button>
        </DialogFooter>
      </form>
    </ResourceDialogShell>
  )
}

function ActivityLogFormDialog({
  open,
  loading,
  deals,
  documents,
  schedule,
  checklists,
  issues,
  initialLog,
  defaultDealId,
  onClose,
  onSave,
}: {
  open: boolean
  loading?: boolean
  deals: PartnerDeal[]
  documents: PartnerDocument[]
  schedule: PartnerScheduleItem[]
  checklists: PartnerOpsChecklistItem[]
  issues: PartnerOpsIssue[]
  initialLog?: PartnerActivityLog | null
  defaultDealId?: string
  onClose: () => void
  onSave: (payload: PartnerActivityLogInput) => Promise<void> | void
}) {
  const [form, setForm] = useState<PartnerActivityLogInput>(() =>
    createActivityLogFormState(initialLog, deals, defaultDealId)
  )

  const set = <K extends keyof PartnerActivityLogInput>(key: K, value: PartnerActivityLogInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onSave({
      ...form,
      summary: form.summary.trim(),
      action: form.action.trim(),
      logCategory: form.logCategory.trim(),
      dealId: form.dealId || undefined,
      documentId: form.documentId || undefined,
      scheduleItemId: form.scheduleItemId || undefined,
      checklistItemId: form.checklistItemId || undefined,
      issueId: form.issueId || undefined,
      subjectType: form.subjectType?.trim() || "partner",
      subjectId: form.subjectId?.trim() || undefined,
      actor: form.actor?.trim() || undefined,
      details: form.details?.trim() || undefined,
      nextAction: form.nextAction?.trim() || undefined,
      dueAt: form.dueAt || undefined,
      occurredAt: form.occurredAt,
    })
  }

  return (
    <ResourceDialogShell
      open={open}
      onClose={onClose}
      title={initialLog ? "운영 로그 수정" : "운영 로그 추가"}
      description="미팅, 후속, 내부 액션을 타임라인으로 남기고 다음 액션까지 이어 붙입니다."
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="log-summary">요약 *</Label>
          <Input id="log-summary" value={form.summary} onChange={(event) => set("summary", event.target.value)} required />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="log-action">액션 *</Label>
            <Input id="log-action" value={form.action} onChange={(event) => set("action", event.target.value)} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="log-category">로그 분류 *</Label>
            <Input id="log-category" value={form.logCategory} onChange={(event) => set("logCategory", event.target.value)} required />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="log-deal">거래 연결</Label>
            <select id="log-deal" value={form.dealId ?? ""} onChange={(event) => set("dealId", event.target.value)} className={SELECT_CLASSNAME}>
              <option value="">미연결</option>
              {deals.map((deal) => (
                <option key={deal.id} value={deal.id}>{deal.title}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="log-status">상태</Label>
            <select id="log-status" value={form.status} onChange={(event) => set("status", event.target.value as PartnerActivityLogInput["status"])} className={SELECT_CLASSNAME}>
              <option value="recorded">Recorded</option>
              <option value="follow_up_needed">Follow up needed</option>
              <option value="waiting_partner">Waiting partner</option>
              <option value="waiting_internal">Waiting internal</option>
              <option value="blocked">Blocked</option>
              <option value="resolved">Resolved</option>
              <option value="canceled">Canceled</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="log-actor">작성자</Label>
            <Input id="log-actor" value={form.actor ?? ""} onChange={(event) => set("actor", event.target.value)} />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="log-occurred-at">발생 일시 *</Label>
            <Input id="log-occurred-at" type="datetime-local" value={form.occurredAt} onChange={(event) => set("occurredAt", event.target.value)} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="log-due-at">마감 일시</Label>
            <Input id="log-due-at" type="datetime-local" value={form.dueAt ?? ""} onChange={(event) => set("dueAt", event.target.value)} />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="log-document">연결 문서</Label>
            <select id="log-document" value={form.documentId ?? ""} onChange={(event) => set("documentId", event.target.value)} className={SELECT_CLASSNAME}>
              <option value="">미연결</option>
              {documents.map((document) => (
                <option key={document.id} value={document.id}>{document.title}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="log-schedule">연결 일정</Label>
            <select id="log-schedule" value={form.scheduleItemId ?? ""} onChange={(event) => set("scheduleItemId", event.target.value)} className={SELECT_CLASSNAME}>
              <option value="">미연결</option>
              {schedule.map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="log-checklist">연결 체크</Label>
            <select id="log-checklist" value={form.checklistItemId ?? ""} onChange={(event) => set("checklistItemId", event.target.value)} className={SELECT_CLASSNAME}>
              <option value="">미연결</option>
              {checklists.map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="log-issue">연결 이슈</Label>
            <select id="log-issue" value={form.issueId ?? ""} onChange={(event) => set("issueId", event.target.value)} className={SELECT_CLASSNAME}>
              <option value="">미연결</option>
              {issues.map((issue) => (
                <option key={issue.id} value={issue.id}>{issue.title}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="log-next-action">다음 액션</Label>
          <Input id="log-next-action" value={form.nextAction ?? ""} onChange={(event) => set("nextAction", event.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="log-details">상세 메모</Label>
          <textarea id="log-details" className={TEXTAREA_CLASSNAME} value={form.details ?? ""} onChange={(event) => set("details", event.target.value)} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>취소</Button>
          <Button type="submit" disabled={loading}>{loading ? "저장 중..." : initialLog ? "로그 수정" : "로그 추가"}</Button>
        </DialogFooter>
      </form>
    </ResourceDialogShell>
  )
}

function ContactFormDialog({
  open,
  loading,
  initialContact,
  partner,
  onClose,
  onSave,
}: {
  open: boolean
  loading?: boolean
  initialContact?: PartnerContact | null
  partner: PartnerWorkspace["partner"]
  onClose: () => void
  onSave: (payload: PartnerContactInput) => Promise<void> | void
}) {
  const [form, setForm] = useState<PartnerContactInput>(() => createContactFormState(initialContact, partner))

  const set = <K extends keyof PartnerContactInput>(key: K, value: PartnerContactInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onSave({
      ...form,
      name: form.name.trim(),
      role: form.role?.trim() || undefined,
      email: form.email?.trim() || undefined,
      phone: form.phone?.trim() || undefined,
    })
  }

  return (
    <ResourceDialogShell
      open={open}
      onClose={onClose}
      title={initialContact ? "연락처 수정" : "연락처 추가"}
      description="대표 연락처와 실무 연락처를 같은 워크스페이스 안에서 관리합니다."
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="contact-name">이름 *</Label>
          <Input id="contact-name" value={form.name} onChange={(event) => set("name", event.target.value)} required />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="contact-role">직책/역할</Label>
            <Input id="contact-role" value={form.role ?? ""} onChange={(event) => set("role", event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="contact-phone">전화번호</Label>
            <Input id="contact-phone" value={form.phone ?? ""} onChange={(event) => set("phone", event.target.value)} />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="contact-email">이메일</Label>
          <Input id="contact-email" type="email" value={form.email ?? ""} onChange={(event) => set("email", event.target.value)} />
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-3 text-[13px] text-[#1a1a1a]/70">
          <input
            id="contact-primary"
            type="checkbox"
            checked={form.isPrimary ?? true}
            onChange={(event) => set("isPrimary", event.target.checked)}
            className="h-4 w-4 rounded border border-input"
          />
          <Label htmlFor="contact-primary" className="cursor-pointer text-[13px] font-medium">
            대표 연락처로 사용
          </Label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>취소</Button>
          <Button type="submit" disabled={loading}>{loading ? "저장 중..." : initialContact ? "연락처 수정" : "연락처 추가"}</Button>
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
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [workspace, setWorkspace] = useState(initialWorkspace)
  const [source, setSource] = useState(initialSource)
  const [warning, setWarning] = useState(initialWarning)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [savingKind, setSavingKind] = useState<string | null>(null)

  const [partnerDialogOpen, setPartnerDialogOpen] = useState(false)
  const [contactDialogOpen, setContactDialogOpen] = useState(false)
  const [dealDialogOpen, setDealDialogOpen] = useState(false)
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false)
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [salesDialogOpen, setSalesDialogOpen] = useState(false)
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false)
  const [issueDialogOpen, setIssueDialogOpen] = useState(false)
  const [activityLogDialogOpen, setActivityLogDialogOpen] = useState(false)

  const [editingDeal, setEditingDeal] = useState<PartnerDeal | null>(null)
  const [editingContact, setEditingContact] = useState<PartnerContact | null>(null)
  const [editingDocument, setEditingDocument] = useState<PartnerDocument | null>(null)
  const [editingSchedule, setEditingSchedule] = useState<PartnerScheduleItem | null>(null)
  const [editingSales, setEditingSales] = useState<PartnerSalesRecord | null>(null)
  const [editingChecklist, setEditingChecklist] = useState<PartnerOpsChecklistItem | null>(null)
  const [editingIssue, setEditingIssue] = useState<PartnerOpsIssue | null>(null)
  const [editingActivityLog, setEditingActivityLog] = useState<PartnerActivityLog | null>(null)
  const [creationContext, setCreationContext] = useState<PartnerActionContext | null>(null)

  const requestedTab = searchParams.get("tab")
  const activeTab: PartnerWorkspaceTab = isWorkspaceTab(requestedTab) ? requestedTab : "overview"

  const applyResult = (data: { workspace: PartnerWorkspace; source: PartnerDataSource; warning?: string }) => {
    setWorkspace(data.workspace)
    setSource(data.source)
    setWarning(data.warning)
    setErrorMessage(null)
  }

  const handleTabChange = (tab: PartnerWorkspaceTab) => {
    const nextParams = new URLSearchParams(searchParams.toString())
    if (tab === "overview") nextParams.delete("tab")
    else nextParams.set("tab", tab)
    const query = nextParams.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  const openCreateFlow = (
    context: PartnerActionContext | undefined,
    setOpen: (open: boolean) => void
  ) => {
    const normalizedContext = context
      ? {
          ...context,
          dealId: context.dealId ?? context.deal?.id,
        }
      : null
    if (context?.tab) {
      handleTabChange(context.tab)
    }
    setCreationContext(normalizedContext)
    setOpen(true)
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

  const saveContact = async (payload: PartnerContactInput) => {
    setSavingKind("contact")
    setErrorMessage(null)
    try {
      const data = await adminFetch(`/api/admin/partners/${workspace.partner.id}/contacts`, {
        method: "POST",
        body: JSON.stringify(payload),
      })
      if (data?.workspace) applyResult(data)
      setContactDialogOpen(false)
      setEditingContact(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "연락처 저장에 실패했습니다.")
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

  const saveChecklist = async (payload: PartnerChecklistInput) => {
    setSavingKind("checklist")
    setErrorMessage(null)
    try {
      const data = await adminFetch(`/api/admin/partners/${workspace.partner.id}/checklists`, {
        method: "POST",
        body: JSON.stringify(payload),
      })
      if (data?.workspace) applyResult(data)
      setChecklistDialogOpen(false)
      setEditingChecklist(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "이행 체크 저장에 실패했습니다.")
    } finally {
      setSavingKind(null)
    }
  }

  const saveIssue = async (payload: PartnerIssueInput) => {
    setSavingKind("issue")
    setErrorMessage(null)
    try {
      const data = await adminFetch(`/api/admin/partners/${workspace.partner.id}/issues`, {
        method: "POST",
        body: JSON.stringify(payload),
      })
      if (data?.workspace) applyResult(data)
      setIssueDialogOpen(false)
      setEditingIssue(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "이슈 저장에 실패했습니다.")
    } finally {
      setSavingKind(null)
    }
  }

  const saveActivityLog = async (payload: PartnerActivityLogInput) => {
    setSavingKind("activity-log")
    setErrorMessage(null)
    try {
      const data = await adminFetch(`/api/admin/partners/${workspace.partner.id}/activity-logs`, {
        method: "POST",
        body: JSON.stringify(payload),
      })
      if (data?.workspace) applyResult(data)
      setActivityLogDialogOpen(false)
      setEditingActivityLog(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "운영 로그 저장에 실패했습니다.")
    } finally {
      setSavingKind(null)
    }
  }

  return (
    <>
      <PartnerWorkspaceShell
        workspace={workspace}
        source={source}
        warning={warning}
        errorMessage={errorMessage}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onEditPartner={() => setPartnerDialogOpen(true)}
        onCreateContact={() => {
          setEditingContact(null)
          setCreationContext(null)
          setContactDialogOpen(true)
        }}
        onEditContact={(contact) => {
          setEditingContact(contact)
          setCreationContext(null)
          setContactDialogOpen(true)
        }}
        onCreateDeal={(context) => {
          setEditingDeal(null)
          openCreateFlow(context, setDealDialogOpen)
        }}
        onEditDeal={(deal) => {
          setEditingDeal(deal)
          setCreationContext(null)
          setDealDialogOpen(true)
        }}
        onCreateSchedule={(context) => {
          setEditingSchedule(null)
          openCreateFlow(context, setScheduleDialogOpen)
        }}
        onEditSchedule={(item) => {
          setEditingSchedule(item)
          setCreationContext(null)
          setScheduleDialogOpen(true)
        }}
        onCreateChecklist={(context) => {
          setEditingChecklist(null)
          openCreateFlow(context, setChecklistDialogOpen)
        }}
        onEditChecklist={(item) => {
          setEditingChecklist(item)
          setCreationContext(null)
          setChecklistDialogOpen(true)
        }}
        onCreateDocument={(context) => {
          setEditingDocument(null)
          openCreateFlow(context, setDocumentDialogOpen)
        }}
        onEditDocument={(document) => {
          setEditingDocument(document)
          setCreationContext(null)
          setDocumentDialogOpen(true)
        }}
        onCreateSales={(context) => {
          setEditingSales(null)
          openCreateFlow(context, setSalesDialogOpen)
        }}
        onEditSales={(sale) => {
          setEditingSales(sale)
          setCreationContext(null)
          setSalesDialogOpen(true)
        }}
        onCreateIssue={(context) => {
          setEditingIssue(null)
          openCreateFlow(context, setIssueDialogOpen)
        }}
        onEditIssue={(issue) => {
          setEditingIssue(issue)
          setCreationContext(null)
          setIssueDialogOpen(true)
        }}
        onCreateActivityLog={(context) => {
          setEditingActivityLog(null)
          openCreateFlow(context, setActivityLogDialogOpen)
        }}
        onEditActivityLog={(log) => {
          setEditingActivityLog(log)
          setCreationContext(null)
          setActivityLogDialogOpen(true)
        }}
      />

      <PartnerFormDialog
        key={`${partnerDialogOpen ? "open" : "closed"}-${workspace.partner.id}`}
        open={partnerDialogOpen}
        initialPartner={workspace.partner}
        loading={savingKind === "partner"}
        onClose={() => !savingKind && setPartnerDialogOpen(false)}
        onSave={savePartner}
      />

      <ContactFormDialog
        key={`${contactDialogOpen ? "open" : "closed"}-${editingContact?.id ?? "new"}`}
        open={contactDialogOpen}
        partner={workspace.partner}
        initialContact={editingContact}
        loading={savingKind === "contact"}
        onClose={() => {
          if (!savingKind) {
            setContactDialogOpen(false)
            setEditingContact(null)
            setCreationContext(null)
          }
        }}
        onSave={saveContact}
      />

      <DealFormDialog
        key={`${dealDialogOpen ? "open" : "closed"}-${editingDeal?.id ?? creationContext?.dealId ?? "new"}`}
        open={dealDialogOpen}
        initialDeal={editingDeal}
        loading={savingKind === "deal"}
        onClose={() => {
          if (!savingKind) {
            setDealDialogOpen(false)
            setEditingDeal(null)
            setCreationContext(null)
          }
        }}
        onSave={saveDeal}
      />

      <DocumentFormDialog
        key={`${documentDialogOpen ? "open" : "closed"}-${editingDocument?.id ?? creationContext?.dealId ?? "new"}`}
        open={documentDialogOpen}
        deals={workspace.deals}
        initialDocument={editingDocument}
        defaultDealId={creationContext?.dealId}
        loading={savingKind === "document"}
        onClose={() => {
          if (!savingKind) {
            setDocumentDialogOpen(false)
            setEditingDocument(null)
            setCreationContext(null)
          }
        }}
        onSave={saveDocument}
      />

      <ScheduleFormDialog
        key={`${scheduleDialogOpen ? "open" : "closed"}-${editingSchedule?.id ?? creationContext?.dealId ?? "new"}`}
        open={scheduleDialogOpen}
        deals={workspace.deals}
        initialSchedule={editingSchedule}
        defaultDealId={creationContext?.dealId}
        loading={savingKind === "schedule"}
        onClose={() => {
          if (!savingKind) {
            setScheduleDialogOpen(false)
            setEditingSchedule(null)
            setCreationContext(null)
          }
        }}
        onSave={saveSchedule}
      />

      <SalesFormDialog
        key={`${salesDialogOpen ? "open" : "closed"}-${editingSales?.id ?? creationContext?.dealId ?? "new"}`}
        open={salesDialogOpen}
        deals={workspace.deals}
        initialSales={editingSales}
        defaultDealId={creationContext?.dealId}
        loading={savingKind === "sales"}
        onClose={() => {
          if (!savingKind) {
            setSalesDialogOpen(false)
            setEditingSales(null)
            setCreationContext(null)
          }
        }}
        onSave={saveSales}
      />

      <ChecklistFormDialog
        key={`${checklistDialogOpen ? "open" : "closed"}-${editingChecklist?.id ?? creationContext?.dealId ?? "new"}`}
        open={checklistDialogOpen}
        deals={workspace.deals}
        initialChecklist={editingChecklist}
        defaultDealId={creationContext?.dealId}
        loading={savingKind === "checklist"}
        onClose={() => {
          if (!savingKind) {
            setChecklistDialogOpen(false)
            setEditingChecklist(null)
            setCreationContext(null)
          }
        }}
        onSave={saveChecklist}
      />

      <IssueFormDialog
        key={`${issueDialogOpen ? "open" : "closed"}-${editingIssue?.id ?? creationContext?.dealId ?? "new"}`}
        open={issueDialogOpen}
        deals={workspace.deals}
        documents={workspace.documents}
        checklists={workspace.checklists}
        initialIssue={editingIssue}
        defaultDealId={creationContext?.dealId}
        loading={savingKind === "issue"}
        onClose={() => {
          if (!savingKind) {
            setIssueDialogOpen(false)
            setEditingIssue(null)
            setCreationContext(null)
          }
        }}
        onSave={saveIssue}
      />

      <ActivityLogFormDialog
        key={`${activityLogDialogOpen ? "open" : "closed"}-${editingActivityLog?.id ?? creationContext?.dealId ?? "new"}`}
        open={activityLogDialogOpen}
        deals={workspace.deals}
        documents={workspace.documents}
        schedule={workspace.schedule}
        checklists={workspace.checklists}
        issues={workspace.issues}
        initialLog={editingActivityLog}
        defaultDealId={creationContext?.dealId}
        loading={savingKind === "activity-log"}
        onClose={() => {
          if (!savingKind) {
            setActivityLogDialogOpen(false)
            setEditingActivityLog(null)
            setCreationContext(null)
          }
        }}
        onSave={saveActivityLog}
      />
    </>
  )
}
