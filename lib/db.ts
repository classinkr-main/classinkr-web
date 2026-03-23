import fs from "fs"
import path from "path"

const DATA_DIR = path.join(process.cwd(), "data")

function readJson<T>(file: string): T {
  const p = path.join(DATA_DIR, file)
  if (!fs.existsSync(p)) return (Array.isArray([]) ? [] : {}) as T
  return JSON.parse(fs.readFileSync(p, "utf8")) as T
}

function writeJson(file: string, data: unknown) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2))
}

export type LeadStatus = "new" | "contacted" | "converted" | "closed"

export interface LeadRecord {
  id: string
  source: string
  name?: string
  org?: string
  role?: string
  size?: string
  email?: string
  phone?: string
  message?: string
  timestamp: string
  status: LeadStatus
  branch?: string
  notes?: string
}

export function getLeads(): LeadRecord[] {
  return readJson<LeadRecord[]>("leads.json")
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
  const idx = leads.findIndex((l) => l.id === id)
  if (idx === -1) return null
  leads[idx] = { ...leads[idx], ...patch, id }
  writeJson("leads.json", leads)
  return leads[idx]
}

export function deleteLead(id: string): boolean {
  const leads = getLeads()
  const next = leads.filter((l) => l.id !== id)
  if (next.length === leads.length) return false
  writeJson("leads.json", next)
  return true
}

export interface SiteSettings {
  demoFormEnabled: boolean
  demoBannerEnabled: boolean
  demoBannerText: string
  blogSectionEnabled: boolean
  noticeBannerEnabled: boolean
  noticeBannerText: string
  /** 외부 연동 URL — Supabase 전환 시 admin_settings 테이블로 이동 */
  googleSheetWebhookUrl?: string
  leadWebhookUrl?: string
  channelTalkWebhookUrl?: string
  emailWebhookUrl?: string
}

const DEFAULT_SETTINGS: SiteSettings = {
  demoFormEnabled: true,
  demoBannerEnabled: false,
  demoBannerText: "",
  blogSectionEnabled: true,
  noticeBannerEnabled: false,
  noticeBannerText: "",
}

export function getSettings(): SiteSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...readJson<Partial<SiteSettings>>("settings.json") }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function updateSettings(patch: Partial<SiteSettings>): SiteSettings {
  const current = getSettings()
  const next = { ...current, ...patch }
  writeJson("settings.json", next)
  return next
}
