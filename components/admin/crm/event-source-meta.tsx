// crm_customer_events source_type → 라벨·아이콘 SSOT.
// 라벨 문자열은 rail/activity-contract.ts sourceLabel()과 일치해야 한다(칩·필터와 동일 표기).
// 아이콘도 이 모듈이 단일 소유 — 드로어·360 디테일·NEO 타임라인이 같은 매핑을 쓴다.

import type { ReactNode } from "react"
import {
  Building2,
  CalendarClock,
  ClipboardList,
  FileAudio,
  FileText,
  Globe,
  MessageSquare,
  PhoneCall,
  StickyNote,
  type LucideIcon,
} from "lucide-react"

import { sourceLabel, type CrmEventRecord } from "./rail/activity-contract"

export type CrmEventSourceType = CrmEventRecord["sourceType"]

const EVENT_SOURCE_ICONS: Record<CrmEventSourceType, LucideIcon> = {
  manual_note: StickyNote,
  meeting_minutes: FileText,
  call: PhoneCall,
  sms: MessageSquare,
  recording: FileAudio,
  calendar_event: CalendarClock,
  lead_contact_log: PhoneCall,
  external_crm: Building2,
  sheet: ClipboardList,
  site_inflow: Globe,
}

/** 알려진 source_type 전체 — 파생 맵(타임라인 메타 등) 구성용. */
export const CRM_EVENT_SOURCE_TYPES = Object.keys(EVENT_SOURCE_ICONS) as CrmEventSourceType[]

function isCrmEventSourceType(value: string): value is CrmEventSourceType {
  return value in EVENT_SOURCE_ICONS
}

/** source_type → 한국어 라벨. 미지의 값은 raw 문자열 그대로(소비처 기존 폴백 동일). */
export function eventSourceLabel(sourceType: string): string {
  return isCrmEventSourceType(sourceType) ? sourceLabel(sourceType) : sourceType
}

/** source_type → 아이콘 노드. 미지의 값은 ClipboardList 폴백. */
export function eventSourceIcon(sourceType: string, className = "h-3.5 w-3.5"): ReactNode {
  const Icon = isCrmEventSourceType(sourceType) ? EVENT_SOURCE_ICONS[sourceType] : ClipboardList
  return <Icon className={className} />
}
