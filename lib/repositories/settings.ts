import "server-only"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { SiteSettings } from "@/lib/db"

export type { SiteSettings } from "@/lib/db"

const DEFAULT: SiteSettings = {
  demoFormEnabled: true,
  demoBannerEnabled: false,
  demoBannerText: "",
  blogSectionEnabled: true,
  noticeBannerEnabled: false,
  noticeBannerText: "",
}

const sb = () => createSupabaseAdminClient()
const SETTINGS_CACHE_TTL_MS = 30_000

let resolvedSettingsCache:
  | {
      expiresAt: number
      value: SiteSettings
    }
  | null = null

function normalizeOptional(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function publicSettings(settings: SiteSettings): SiteSettings {
  return {
    ...settings,
    googleSheetWebhookUrl: "",
    leadWebhookUrl: "",
    channelTalkWebhookUrl: "",
    emailWebhookUrl: "",
  }
}

function mergeWebhookSettings(settings: SiteSettings): SiteSettings {
  return {
    ...DEFAULT,
    ...settings,
    googleSheetWebhookUrl:
      normalizeOptional(settings.googleSheetWebhookUrl) ??
      normalizeOptional(process.env.GOOGLE_SHEET_WEBHOOK_URL),
    leadWebhookUrl:
      normalizeOptional(settings.leadWebhookUrl) ??
      normalizeOptional(process.env.LEAD_WEBHOOK_URL),
    channelTalkWebhookUrl:
      normalizeOptional(settings.channelTalkWebhookUrl) ??
      normalizeOptional(process.env.CHANNEL_TALK_WEBHOOK_URL),
    emailWebhookUrl:
      normalizeOptional(settings.emailWebhookUrl) ??
      normalizeOptional(process.env.EMAIL_WEBHOOK_URL),
  }
}

export async function getSettings(): Promise<SiteSettings> {
  const { data, error } = await sb()
    .from("site_settings")
    .select("*")
    .eq("id", "default")
    .single()
  if (error || !data) return DEFAULT
  return rowToLegacy(data)
}

export async function getResolvedSettings(options?: {
  forceRefresh?: boolean
}): Promise<SiteSettings> {
  if (
    !options?.forceRefresh &&
    resolvedSettingsCache &&
    resolvedSettingsCache.expiresAt > Date.now()
  ) {
    return resolvedSettingsCache.value
  }

  const settings = await getSettings().catch(() => DEFAULT)
  const resolved = mergeWebhookSettings(settings)

  resolvedSettingsCache = {
    expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS,
    value: resolved,
  }

  return resolved
}

export async function getPublicResolvedSettings(options?: {
  forceRefresh?: boolean
}): Promise<SiteSettings> {
  const resolved = await getResolvedSettings(options)
  return publicSettings(resolved)
}

export function clearResolvedSettingsCache() {
  resolvedSettingsCache = null
}

export async function updateSettings(
  patch: Partial<SiteSettings>
): Promise<SiteSettings> {
  const current = await getSettings().catch(() => DEFAULT)
  const next = { ...current, ...patch }
  const webhookValues = {
    googleSheetWebhookUrl:
      normalizeOptional(patch.googleSheetWebhookUrl) ?? current.googleSheetWebhookUrl,
    leadWebhookUrl: normalizeOptional(patch.leadWebhookUrl) ?? current.leadWebhookUrl,
    channelTalkWebhookUrl:
      normalizeOptional(patch.channelTalkWebhookUrl) ?? current.channelTalkWebhookUrl,
    emailWebhookUrl: normalizeOptional(patch.emailWebhookUrl) ?? current.emailWebhookUrl,
  }

  const { data, error } = await sb()
    .from("site_settings")
    .upsert(
      {
        id: "default",
        demo_form_enabled: next.demoFormEnabled,
        demo_banner_enabled: next.demoBannerEnabled,
        demo_banner_text: next.demoBannerText,
        blog_section_enabled: next.blogSectionEnabled,
        notice_banner_enabled: next.noticeBannerEnabled,
        notice_banner_text: next.noticeBannerText,
        google_sheet_webhook_url: webhookValues.googleSheetWebhookUrl ?? null,
        lead_webhook_url: webhookValues.leadWebhookUrl ?? null,
        channel_talk_webhook_url: webhookValues.channelTalkWebhookUrl ?? null,
        email_webhook_url: webhookValues.emailWebhookUrl ?? null,
      },
      { onConflict: "id" }
    )
    .select()
    .single()

  if (error || !data) throw new Error(`[settings] update failed: ${error?.message}`)
  clearResolvedSettingsCache()
  return {
    ...rowToLegacy(data),
    ...webhookValues,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToLegacy(row: any): SiteSettings {
  return {
    demoFormEnabled: row.demo_form_enabled,
    demoBannerEnabled: row.demo_banner_enabled,
    demoBannerText: row.demo_banner_text ?? "",
    blogSectionEnabled: row.blog_section_enabled,
    noticeBannerEnabled: row.notice_banner_enabled,
    noticeBannerText: row.notice_banner_text ?? "",
    googleSheetWebhookUrl: row.google_sheet_webhook_url ?? undefined,
    leadWebhookUrl: row.lead_webhook_url ?? undefined,
    channelTalkWebhookUrl: row.channel_talk_webhook_url ?? undefined,
    emailWebhookUrl: row.email_webhook_url ?? undefined,
  }
}
