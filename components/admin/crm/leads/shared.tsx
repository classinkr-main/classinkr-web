"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"

import type { LeadRecord, LeadStatus } from "@/lib/repositories/leads"
import type { ContactLogResult, ContactLogType } from "@/lib/repositories/contact-logs"
import { getLeadMagnetTitle } from "@/lib/lead-magnets"

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
export const SOURCE_LABEL: Record<string, string> = {
  demo_modal: "데모 신청", contact_page: "문의", newsletter: "뉴스레터", meta_lead_ads: "Meta 리드",
}
export const RESPONSE_TARGET_SOURCES = new Set(["demo_modal", "contact_page", "meta_lead_ads"])

export type LeadFilter = LeadStatus | "all" | "unresponded" | "unresponded_24h" | "unresponded_48h" | "unassigned"
export const LEAD_FILTER_KEYS: LeadFilter[] = [
  "all", "new", "contacted", "converted", "closed",
  "unresponded", "unresponded_24h", "unresponded_48h", "unassigned",
]

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

export function getLeadSourceDetail(lead: LeadRecord) {
  return lead.source_detail?.trim() || ""
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
