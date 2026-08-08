import type { NotificationAppearanceSettings } from "@/lib/notifications/types"

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
  source_detail?: string
  lead_magnet?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
  gclid?: string
  fbclid?: string
  msclkid?: string
  ttclid?: string
  landing_page?: string
  current_page?: string
  referrer?: string
  confirmed_at?: string
}

export interface SiteSettings {
  demoFormEnabled: boolean
  demoBannerEnabled: boolean
  demoBannerText: string
  blogSectionEnabled: boolean
  noticeBannerEnabled: boolean
  noticeBannerText: string
  googleSheetWebhookUrl?: string
  leadWebhookUrl?: string
  channelTalkWebhookUrl?: string
  emailWebhookUrl?: string
  wecomOpsWebhookUrl?: string
  wecomOpsWebhookEnabled: boolean
  wecomCsWebhookUrl?: string
  wecomLeadReportWebhookUrl?: string
  wecomCriticalWebhookUrl?: string
  kakaoAlimtalkWebhookUrl?: string
  notificationDigestEmailList: string[]
  notificationAppearance: NotificationAppearanceSettings
}
