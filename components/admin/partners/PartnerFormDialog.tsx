"use client"

import { useState } from "react"
import type { FormEvent } from "react"

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
import type { PartnerSummary, PartnerSummaryInput } from "@/lib/partners-types"

interface PartnerFormDialogProps {
  open: boolean
  initialPartner?: PartnerSummary | null
  error?: string
  loading?: boolean
  onClose: () => void
  onSave: (payload: PartnerSummaryInput) => Promise<void> | void
}

interface PartnerFormState {
  name: string
  status: PartnerSummaryInput["status"]
  channel: PartnerSummaryInput["channel"]
  region: string
  ownerName: string
  ownerEmail: string
  accountManager: string
  tags: string
  notes: string
}

const EMPTY_FORM: PartnerFormState = {
  name: "",
  status: "lead",
  channel: "direct",
  region: "",
  ownerName: "",
  ownerEmail: "",
  accountManager: "",
  tags: "",
  notes: "",
}

const SELECT_CLASSNAME =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function toFormState(partner?: PartnerSummary | null): PartnerFormState {
  if (!partner) return EMPTY_FORM

  return {
    name: partner.name,
    status: partner.status,
    channel: partner.channel,
    region: partner.region,
    ownerName: partner.ownerName,
    ownerEmail: partner.ownerEmail,
    accountManager: partner.accountManager,
    tags: partner.tags.join(", "),
    notes: partner.notes ?? "",
  }
}

export default function PartnerFormDialog({
  open,
  initialPartner,
  error,
  loading,
  onClose,
  onSave,
}: PartnerFormDialogProps) {
  const formKey = `${initialPartner?.id ?? "new"}-${open ? "open" : "closed"}`

  return (
    <PartnerFormDialogInner
      key={formKey}
      open={open}
      initialPartner={initialPartner}
      error={error}
      loading={loading}
      onClose={onClose}
      onSave={onSave}
    />
  )
}

function PartnerFormDialogInner({
  open,
  initialPartner,
  error,
  loading,
  onClose,
  onSave,
}: PartnerFormDialogProps) {
  const [form, setForm] = useState<PartnerFormState>(() => toFormState(initialPartner))
  const [clientError, setClientError] = useState<string>()

  const set = <K extends keyof PartnerFormState>(key: K, value: PartnerFormState[K]) => {
    if (clientError) setClientError(undefined)
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const name = form.name.trim()
    const ownerName = form.ownerName.trim()
    const ownerEmail = form.ownerEmail.trim().toLowerCase()

    if (!name || !ownerName || !ownerEmail) {
      setClientError("계정명, 대표 연락처명, 대표 이메일은 필수입니다.")
      return
    }

    if (!EMAIL_REGEX.test(ownerEmail)) {
      setClientError("대표 이메일 형식이 올바르지 않습니다.")
      return
    }

    await onSave({
      name,
      status: form.status,
      channel: form.channel,
      region: form.region.trim(),
      ownerName,
      ownerEmail,
      accountManager: form.accountManager.trim(),
      tags: form.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      notes: form.notes.trim(),
    })
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="bg-white sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initialPartner ? "계정 정보 수정" : "새 계정 등록"}</DialogTitle>
          <DialogDescription>
            계정 기본 정보는 리스트, 상세 워크스페이스, 거래/정산 담당 흐름의 기준값으로 사용됩니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          {(clientError || error) && (
            <div className="rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-4 py-3 text-[12px] leading-5 text-[#B85C33]">
              {clientError || error}
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="partner-name">계정명 *</Label>
            <Input
              id="partner-name"
              value={form.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="예: 미래아카데미"
              required
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="partner-status">상태</Label>
              <select
                id="partner-status"
                value={form.status}
                onChange={(event) => set("status", event.target.value as PartnerSummaryInput["status"])}
                className={SELECT_CLASSNAME}
              >
                <option value="lead">신규</option>
                <option value="active">활성</option>
                <option value="paused">보류</option>
                <option value="churn_risk">리스크</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="partner-channel">채널</Label>
              <select
                id="partner-channel"
                value={form.channel}
                onChange={(event) => set("channel", event.target.value as PartnerSummaryInput["channel"])}
                className={SELECT_CLASSNAME}
              >
                <option value="direct">직접</option>
                <option value="reseller">리셀러</option>
                <option value="referral">추천</option>
                <option value="branch">지사</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="partner-region">지역</Label>
              <Input
                id="partner-region"
                value={form.region}
                onChange={(event) => set("region", event.target.value)}
                placeholder="예: 서울 강남"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="partner-manager">담당자</Label>
              <Input
                id="partner-manager"
                value={form.accountManager}
                onChange={(event) => set("accountManager", event.target.value)}
                placeholder="예: 정소연"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="partner-owner-name">대표 연락처명 *</Label>
              <Input
                id="partner-owner-name"
                value={form.ownerName}
                onChange={(event) => set("ownerName", event.target.value)}
                placeholder="예: 김지훈"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="partner-owner-email">대표 이메일 *</Label>
              <Input
                id="partner-owner-email"
                type="email"
                value={form.ownerEmail}
                onChange={(event) => set("ownerEmail", event.target.value)}
                placeholder="email@example.com"
                required
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="partner-tags">태그</Label>
            <Input
              id="partner-tags"
              value={form.tags}
              onChange={(event) => set("tags", event.target.value)}
              placeholder="예: 활성, 재계약 후보, 전자칠판"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="partner-notes">메모</Label>
            <textarea
              id="partner-notes"
              value={form.notes}
              onChange={(event) => set("notes", event.target.value)}
              rows={4}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              placeholder="운영 메모를 적어주세요."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              취소
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "저장 중..." : initialPartner ? "수정 저장" : "계정 추가"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
