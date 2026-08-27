import fs from "fs"
import path from "path"

import { atomicWriteJsonSync } from "@/lib/atomic-write"
import {
  DEFAULT_NOTIFICATION_APPEARANCE,
  mergeNotificationAppearance,
} from "@/lib/notifications/types"
import type { LeadRecord, SiteSettings } from "@/lib/site-settings-types"

export type { LeadRecord, LeadStatus, SiteSettings } from "@/lib/site-settings-types"

const DATA_DIR = path.join(process.cwd(), "data")

function readJson<T>(file: string): T {
  const target = path.join(DATA_DIR, file)
  if (!fs.existsSync(target)) return {} as T
  return JSON.parse(fs.readFileSync(target, "utf8")) as T
}

function writeJson(file: string, data: unknown) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  atomicWriteJsonSync(path.join(DATA_DIR, file), data)
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  demoFormEnabled: true,
  demoBannerEnabled: false,
  demoBannerText: "",
  blogSectionEnabled: true,
  noticeBannerEnabled: false,
  noticeBannerText: "",
  googleSheetWebhookUrl: undefined,
  leadWebhookUrl: undefined,
  channelTalkWebhookUrl: undefined,
  emailWebhookUrl: undefined,
  wecomOpsWebhookUrl: undefined,
  wecomOpsWebhookEnabled: true,
  wecomCsWebhookUrl: undefined,
  wecomLeadReportWebhookUrl: undefined,
  wecomCriticalWebhookUrl: undefined,
  kakaoAlimtalkWebhookUrl: undefined,
  notificationDigestEmailList: [],
  notificationAppearance: DEFAULT_NOTIFICATION_APPEARANCE,
}

function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return []

  return [...new Set(
    values
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean)
  )]
}

function normalizeSettings(raw?: Partial<SiteSettings>): SiteSettings {
  return {
    ...DEFAULT_SITE_SETTINGS,
    ...raw,
    googleSheetWebhookUrl: raw?.googleSheetWebhookUrl?.trim() || undefined,
    leadWebhookUrl: raw?.leadWebhookUrl?.trim() || undefined,
    channelTalkWebhookUrl: raw?.channelTalkWebhookUrl?.trim() || undefined,
    emailWebhookUrl: raw?.emailWebhookUrl?.trim() || undefined,
    wecomOpsWebhookUrl: raw?.wecomOpsWebhookUrl?.trim() || undefined,
    wecomOpsWebhookEnabled: raw?.wecomOpsWebhookEnabled !== false,
    wecomCsWebhookUrl: raw?.wecomCsWebhookUrl?.trim() || undefined,
    wecomLeadReportWebhookUrl: raw?.wecomLeadReportWebhookUrl?.trim() || undefined,
    wecomCriticalWebhookUrl: raw?.wecomCriticalWebhookUrl?.trim() || undefined,
    kakaoAlimtalkWebhookUrl: raw?.kakaoAlimtalkWebhookUrl?.trim() || undefined,
    notificationDigestEmailList: normalizeStringArray(raw?.notificationDigestEmailList),
    notificationAppearance: mergeNotificationAppearance(raw?.notificationAppearance),
  }
}

export function getLeads(): LeadRecord[] {
  try {
    const leads = readJson<unknown>("leads.json")
    return Array.isArray(leads) ? (leads as LeadRecord[]) : []
  } catch {
    return []
  }
}

export function saveLead(lead: Omit<LeadRecord, "id" | "status">): LeadRecord {
  const leads = getLeads()
  const newLead: LeadRecord = {
    ...lead,
    id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    status: "new",
  }
  leads.unshift(newLead)
  writeJson("leads.json", leads)
  return newLead
}

export function updateLead(id: string, patch: Partial<LeadRecord>): LeadRecord | null {
  const leads = getLeads()
  const index = leads.findIndex((lead) => lead.id === id)
  if (index === -1) return null

  leads[index] = { ...leads[index], ...patch, id }
  writeJson("leads.json", leads)
  return leads[index]
}

/**
 * 여러 리드를 한 번의 파일 쓰기로 갱신한다.
 *
 * 개발용 JSON 모드에서도 일괄 담당자 배정이 리드 수만큼 파일을 다시 쓰지 않게 한다.
 * 반환 순서는 입력 ID 순서가 아니라 저장된 리드 목록 순서이며, 존재하지 않는 ID는 생략한다.
 */
export function updateLeads(ids: string[], patch: Partial<LeadRecord>): LeadRecord[] {
  const idSet = new Set(ids)
  if (idSet.size === 0) return []

  const leads = getLeads()
  const updated: LeadRecord[] = []
  let changed = false
  const next = leads.map((lead) => {
    if (!idSet.has(lead.id)) return lead
    changed = true
    const merged = { ...lead, ...patch, id: lead.id }
    updated.push(merged)
    return merged
  })

  if (changed) writeJson("leads.json", next)
  return updated
}

export function deleteLead(id: string): boolean {
  const leads = getLeads()
  const next = leads.filter((lead) => lead.id !== id)
  if (next.length === leads.length) return false

  writeJson("leads.json", next)
  return true
}

export function getSettings(): SiteSettings {
  try {
    const raw = readJson<Partial<SiteSettings>>("settings.json")
    return normalizeSettings(raw)
  } catch {
    return DEFAULT_SITE_SETTINGS
  }
}

export function updateSettings(patch: Partial<SiteSettings>): SiteSettings {
  const current = getSettings()
  const next = normalizeSettings({
    ...current,
    ...patch,
  })

  writeJson("settings.json", next)
  return next
}
