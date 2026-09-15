import { getBusinessDateParts } from "@/lib/business-time"

import type { SyncHealthInput } from "./sync-health-copy"

// 장부 상단 상태 한 줄 — 순수 판정(LedgerStatusRail이 쓴다).
// 예전엔 정합 체크·CRM 연결·동기화 끊김이 각자 한 줄씩 쌓여 표보다 먼저 세 줄을 읽어야 했다.
// 세 신호를 칸 하나씩으로 요약하고, 가장 심각한 톤을 테두리 한 곳에만 쓴다.
// 시트 공유가 끊기면 정합 체크 실패는 같은 원인이라 별도 경보로 세우지 않는다(중립 톤으로 강등).

export type LedgerStatusTone = "danger" | "warning" | "ok" | "neutral" | "low" | "partial" | "healthy"

export type LedgerIntegrityInput =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; warnCount: number; errorCount: number }

export type LedgerCrmInput =
  | { state: "loading" | "unavailable" | "empty" }
  | {
      state: "ready"
      health: "low" | "partial" | "healthy"
      accountConnected: number
      accountTotal: number
      revenuePctLabel: string
    }

export interface LedgerStatusSegment {
  id: "sync" | "integrity" | "crm"
  tone: LedgerStatusTone
  label: string
}

export interface LedgerStatusSummary {
  segments: LedgerStatusSegment[]
  /** 테두리 한 곳에 쓸 가장 심각한 톤. CRM 연결 부족(만성 지표)은 전체 톤을 올리지 않는다. */
  worst: "danger" | "warning" | "neutral" | "ok"
}

const RANK: Record<LedgerStatusTone, number> = {
  danger: 3,
  warning: 2,
  neutral: 1,
  low: 1,
  partial: 1,
  ok: 0,
  healthy: 0,
}

function shortDate(iso: string): string {
  const [, month, day] = getBusinessDateParts(new Date(iso)).date.split("-")
  return `${Number(month)}/${Number(day)}`
}

function syncSegment(sync: SyncHealthInput | undefined): LedgerStatusSegment {
  if (!sync) return { id: "sync", tone: "neutral", label: "동기화 상태 확인 중" }
  if (sync.failedDays <= 0) return { id: "sync", tone: "ok", label: "동기화 정상" }
  const days = sync.truncated ? `${sync.failedDays}일 이상` : `${sync.failedDays}일째`
  const basis = sync.lastSuccessAt ? `${shortDate(sync.lastSuccessAt)} 기준` : "기준 미확인"
  return {
    id: "sync",
    // 크론 알림·배너와 같은 문턱: 이틀째부터 위험.
    tone: sync.failedDays >= 2 ? "danger" : "warning",
    label: `동기화 ${days} 실패 · ${basis}`,
  }
}

function integritySegment(integrity: LedgerIntegrityInput, sync: SyncHealthInput | undefined): LedgerStatusSegment {
  if (integrity.state === "loading") return { id: "integrity", tone: "neutral", label: "정합 확인 중" }
  if (integrity.state === "error") {
    const blockedBySheet = Boolean(sync && sync.failedDays > 0 && sync.permissionDenied)
    return { id: "integrity", tone: "neutral", label: blockedBySheet ? "정합 체크 중단 — 시트 끊김" : "정합 체크 불가" }
  }
  const total = integrity.warnCount + integrity.errorCount
  if (total === 0) return { id: "integrity", tone: "ok", label: "정합 이상 없음" }
  return { id: "integrity", tone: integrity.errorCount > 0 ? "danger" : "warning", label: `정합 이슈 ${total}건` }
}

function crmSegment(crm: LedgerCrmInput): LedgerStatusSegment | null {
  if (crm.state !== "ready") {
    if (crm.state === "empty") return null
    return { id: "crm", tone: "neutral", label: crm.state === "loading" ? "CRM 연결 확인 중" : "CRM 연결 확인 불가" }
  }
  return {
    id: "crm",
    tone: crm.health,
    label: `CRM 연결 ${crm.accountConnected}/${crm.accountTotal} · 매출 ${crm.revenuePctLabel}`,
  }
}

export function describeLedgerStatus(input: {
  sync: SyncHealthInput | undefined
  integrity: LedgerIntegrityInput
  crm: LedgerCrmInput
  now: Date
}): LedgerStatusSummary {
  const segments = [
    syncSegment(input.sync),
    integritySegment(input.integrity, input.sync),
    crmSegment(input.crm),
  ].filter((segment): segment is LedgerStatusSegment => segment !== null)
  const maxRank = Math.max(...segments.map((segment) => RANK[segment.tone]))
  const worst = maxRank >= 3 ? "danger" : maxRank === 2 ? "warning" : maxRank === 1 ? "neutral" : "ok"
  return { segments, worst }
}
