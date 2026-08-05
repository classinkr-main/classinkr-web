"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"

import type { LeadRecord, LeadStatus } from "@/lib/repositories/leads"
import type { ContactLogResult, ContactLogType } from "@/lib/repositories/contact-logs"
import { getLeadMagnetIntentScore, getLeadMagnetTitle } from "@/lib/lead-magnets"
import {
  RESPONSE_TARGET_SOURCES,
  SOURCE_GROUP_DOT,
  SOURCE_GROUP_LABEL,
  SOURCE_GROUP_ORDER,
  SOURCE_LABEL,
  getLeadSourceDetail,
  getLeadSourceGroup,
  getMetaAdInfo,
  type LeadSourceGroup,
  type MetaAdInfo,
} from "@/lib/crm/lead-attribution"

// 유입 그룹·Meta 광고 파싱 규칙은 lib/crm/lead-attribution.ts(순수 모듈)로 옮겼다 —
// 서버 집계·트래킹 롤업이 같은 표를 봐야 하기 때문. 기존 import 경로 유지를 위해 여기서 다시 내보낸다.
export {
  SOURCE_LABEL,
  RESPONSE_TARGET_SOURCES,
  SOURCE_GROUP_ORDER,
  SOURCE_GROUP_LABEL,
  SOURCE_GROUP_DOT,
  getLeadSourceGroup,
  getMetaAdInfo,
  getLeadSourceDetail,
}
export type { LeadSourceGroup, MetaAdInfo }

// 리드 보드(/admin/crm/customers/leads)와 현황 액션 밴드(/admin/crm)가 같이 쓰는
// 상수·계산 헬퍼·소형 UI. 리드 분류 규칙을 한 곳에서만 정의한다.

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "신규", contacted: "연락중", converted: "전환", closed: "종료",
}
export const STATUS_COLOR: Record<LeadStatus, string> = {
  new: "bg-[#ECFDF5] text-[#084734]",
  contacted: "bg-yellow-50 text-yellow-600",
  converted: "bg-green-50 text-green-600",
  closed: "bg-[#f0f0ec] text-[#1a1a1a]/40",
}
// 목록 행 상태 표시 — 파스텔 채움 대신 점+라벨(아웃라인 취향, 유입 색점과 같은 시스템).
export const STATUS_DOT: Record<LeadStatus, string> = {
  new: "#1D9E75", contacted: "#D97706", converted: "#084734", closed: "#9A9A94",
}

export function StatusPill({ status }: { status: LeadStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap ${status === "closed" ? "text-[#1a1a1a]/45" : "text-[#111110]"}`}>
      <span aria-hidden className="inline-block h-[7px] w-[7px] shrink-0 rounded-full" style={{ backgroundColor: STATUS_DOT[status] }} />
      {STATUS_LABEL[status]}
    </span>
  )
}
export function SourceGroupDot({ group, size = 7 }: { group: LeadSourceGroup; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, backgroundColor: SOURCE_GROUP_DOT[group] }}
    />
  )
}

export type LeadFilter =
  | LeadStatus
  | "all"
  | "unresponded"
  | "unresponded_24h"
  | "unresponded_48h"
  | "unassigned"
  | "unconfirmed"
export const LEAD_FILTER_KEYS: LeadFilter[] = [
  "all", "new", "contacted", "converted", "closed",
  "unresponded", "unresponded_24h", "unresponded_48h", "unassigned", "unconfirmed",
]

// 이 필터들은 "응대·확인이 필요하다"는 게 관점 자체라 미확인 리드를 그대로 보여준다.
// 그 외 필터(전체/신규/연락중/...)는 검토 전 리드를 숨겨 기본 화면을 깨끗하게 유지한다.
export const CONFIRMATION_GATE_EXEMPT_FILTERS = new Set<LeadFilter>([
  "unconfirmed", "unresponded", "unresponded_24h", "unresponded_48h",
])

export const LOG_TYPE_LABEL: Record<ContactLogType, string> = {
  call: "전화", sms: "문자", kakao: "카카오", email: "이메일",
}
export const LOG_RESULT_LABEL: Record<ContactLogResult, string> = {
  answered: "연결됨", no_answer: "부재중", callback: "콜백 요청", meeting_set: "미팅 확정",
}
export const LOG_RESULT_COLOR: Record<ContactLogResult, string> = {
  answered: "text-green-600",
  no_answer: "text-[#1a1a1a]/40",
  callback: "text-yellow-600",
  meeting_set: "text-[#084734]",
}

// ─── 리드 스코어 계산 ───────────────────────────────────────────
export function calcScore(lead: LeadRecord): number {
  let s = 0
  if (lead.source === "demo_modal")    s += 40
  else if (lead.source === "contact_page") s += 25
  else if (lead.source === "meta_lead_ads") s += 25
  else if (lead.source === "newsletter")   s += 10
  if (lead.lead_magnet) s += getLeadMagnetIntentScore(lead.lead_magnet)
  if (lead.phone) s += 20
  if (lead.email) s += 5
  if (lead.size) {
    const n = parseInt(lead.size)
    if (n >= 300) s += 20
    else if (n >= 100) s += 10
    else s += 5
  }
  if (lead.org) s += 10
  return Math.min(s, 100)
}

export function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "text-[#084734]/70"
    : score >= 40 ? "text-[#1a1a1a]/40"
    : "text-[#1a1a1a]/25"
  return (
    <span className={`text-[10px] font-medium tabular-nums ${color}`}>
      ★{score}
    </span>
  )
}

// ─── 인증 헬퍼 ─────────────────────────────────────────────────
export async function readAdminResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error || fallbackMessage)
  }
  return data as T
}

export function toLocalDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
}

export function toFollowUpTimestamp(date: string) {
  return `${date}T12:00:00.000Z`
}

export function daysBetween(from: string | Date, to: string | Date = new Date()) {
  const fromDate = from instanceof Date ? from : new Date(from)
  const toDate = to instanceof Date ? to : new Date(to)
  const diff = toDate.getTime() - fromDate.getTime()
  return Math.max(0, Math.floor(diff / 86_400_000))
}

export function isActiveLead(status: LeadStatus) {
  return status !== "converted" && status !== "closed"
}

export function isResponseTargetLead(lead: LeadRecord) {
  return RESPONSE_TARGET_SOURCES.has(lead.source)
}

export function isUnrespondedLead(lead: LeadRecord) {
  return lead.status === "new" && isResponseTargetLead(lead)
}

// 공개 채널(문의·데모·뉴스레터·Meta 리드애즈 등)에서 들어와 아직 검토되지 않은 리드.
// 어드민 수기 등록은 생성 시점에 confirmed_at이 채워져 항상 false.
export function isUnconfirmedLead(lead: LeadRecord) {
  return !lead.confirmed_at
}

export function hoursBetween(from: string | Date, to: string | Date = new Date()) {
  const fromDate = from instanceof Date ? from : new Date(from)
  const toDate = to instanceof Date ? to : new Date(to)
  const diff = toDate.getTime() - fromDate.getTime()
  return Math.max(0, Math.floor(diff / 3_600_000))
}

export function formatResponseAge(hours: number) {
  if (hours < 24) return `${hours}시간`
  const days = Math.floor(hours / 24)
  const rest = hours % 24
  return rest > 0 ? `${days}일 ${rest}시간` : `${days}일`
}

export function getLeadOwner(lead: LeadRecord) {
  return lead.assigned_to?.trim() || "미배정"
}

export function getLeadMagnetLabel(value?: string) {
  if (!value) return ""
  const title = getLeadMagnetTitle(value)
  if (title) return title
  return value
    .split(/[-_:]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ")
}

export function getLeadDisplayName(lead?: LeadRecord) {
  if (!lead) return "이 리드"
  return lead.name?.trim() || lead.org?.trim() || lead.email?.trim() || lead.phone?.trim() || "이름 없는 리드"
}

// ─── 복사 버튼 ─────────────────────────────────────────────────
export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="p-1 rounded-md text-[#1a1a1a]/30 hover:text-[#1a1a1a]/60 hover:bg-[#f0f0ec] transition-all"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

// ─── 토스트 ────────────────────────────────────────────────────
export function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <div className={`fixed bottom-6 right-6 z-[60] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-[13px] font-medium ${
      type === "success" ? "bg-[#111110] text-white" : "bg-[#B85C33] text-white"
    }`}>
      {msg}
    </div>
  )
}
