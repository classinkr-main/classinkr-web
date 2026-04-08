import "server-only"

import {
  DEFAULT_SITE_SETTINGS,
  type SiteSettings,
} from "@/lib/db"
import { mergeNotificationAppearance } from "@/lib/notifications/types"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type { SiteSettings } from "@/lib/db"

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

function normalizeStringArray(values?: string[] | null) {
  if (!Array.isArray(values)) return []

  return [...new Set(
    values
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
  )]
}

function parseDigestEmailEnv(raw?: string | null) {
  if (!raw) return []

  return normalizeStringArray(
    raw
      .split(/[\n,;]/)
      .map((value) => value.trim())
      .filter(Boolean)
  )
}

function publicSettings(settings: SiteSettings): SiteSettings {
  return {
    ...settings,
    googleSheetWebhookUrl: "",
    leadWebhookUrl: "",
    channelTalkWebhookUrl: "",
    emailWebhookUrl: "",
    wecomOpsWebhookUrl: "",
    wecomCriticalWebhookUrl: "",
    kakaoAlimtalkWebhookUrl: "",
  }
}

function mergeResolvedSettings(settings: SiteSettings): SiteSettings {
  return {
    ...DEFAULT_SITE_SETTINGS,
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
    wecomOpsWebhookUrl:
      normalizeOptional(settings.wecomOpsWebhookUrl) ??
      normalizeOptional(process.env.WECOM_OPS_WEBHOOK_URL),
    wecomCriticalWebhookUrl:
      normalizeOptional(settings.wecomCriticalWebhookUrl) ??
      normalizeOptional(process.env.WECOM_CRITICAL_WEBHOOK_URL),
    kakaoAlimtalkWebhookUrl:
      normalizeOptional(settings.kakaoAlimtalkWebhookUrl) ??
      normalizeOptional(process.env.KAKAO_ALIMTALK_WEBHOOK_URL),
    notificationDigestEmailList:
      settings.notificationDigestEmailList.length > 0
        ? normalizeStringArray(settings.notificationDigestEmailList)
        : parseDigestEmailEnv(process.env.NOTIFICATION_DIGEST_EMAIL_LIST),
    notificationAppearance: mergeNotificationAppearance(settings.notificationAppearance),
  }
}

export async function getSettings(): Promise<SiteSettings> {
  const { data, error } = await sb()
    .from("site_settings")
    .select("*")
    .eq("id", "default")
    .single()

  if (error || !data) return DEFAULT_SITE_SETTINGS
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

  const settings = await getSettings().catch(() => DEFAULT_SITE_SETTINGS)
  const resolved = mergeResolvedSettings(settings)

  resolvedSettingsCache = {
    expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS,
    value: resolved,
  }

  return resolved
}

export async function getPublicResolvedSettings(options?: {
  forceRefresh?: boolean
}) {
  const resolved = await getResolvedSettings(options)
  return publicSettings(resolved)
}

export function clearResolvedSettingsCache() {
  resolvedSettingsCache = null
}

export async function updateSettings(
  patch: Partial<SiteSettings>
): Promise<SiteSettings> {
  const current = await getSettings().catch(() => DEFAULT_SITE_SETTINGS)
  const nextAppearance =
    patch.notificationAppearance !== undefined
      ? mergeNotificationAppearance(
          current.notificationAppearance,
          patch.notificationAppearance
        )
      : current.notificationAppearance

  const nextDigestEmailList =
    patch.notificationDigestEmailList !== undefined
      ? normalizeStringArray(patch.notificationDigestEmailList)
      : current.notificationDigestEmailList

  const webhookValues = {
    googleSheetWebhookUrl:
      normalizeOptional(patch.googleSheetWebhookUrl) ??
      current.googleSheetWebhookUrl,
    leadWebhookUrl:
      normalizeOptional(patch.leadWebhookUrl) ?? current.leadWebhookUrl,
    channelTalkWebhookUrl:
      normalizeOptional(patch.channelTalkWebhookUrl) ??
      current.channelTalkWebhookUrl,
    emailWebhookUrl:
      normalizeOptional(patch.emailWebhookUrl) ?? current.emailWebhookUrl,
    wecomOpsWebhookUrl:
      normalizeOptional(patch.wecomOpsWebhookUrl) ?? current.wecomOpsWebhookUrl,
    wecomCriticalWebhookUrl:
      normalizeOptional(patch.wecomCriticalWebhookUrl) ??
      current.wecomCriticalWebhookUrl,
    kakaoAlimtalkWebhookUrl:
      normalizeOptional(patch.kakaoAlimtalkWebhookUrl) ??
      current.kakaoAlimtalkWebhookUrl,
  }

  const next: SiteSettings = {
    ...current,
    ...patch,
    ...webhookValues,
    notificationDigestEmailList: nextDigestEmailList,
    notificationAppearance: nextAppearance,
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
        google_sheet_webhook_url: next.googleSheetWebhookUrl ?? null,
        lead_webhook_url: next.leadWebhookUrl ?? null,
        channel_talk_webhook_url: next.channelTalkWebhookUrl ?? null,
        email_webhook_url: next.emailWebhookUrl ?? null,
        wecom_ops_webhook_url: next.wecomOpsWebhookUrl ?? null,
        wecom_critical_webhook_url: next.wecomCriticalWebhookUrl ?? null,
        kakao_alimtalk_webhook_url: next.kakaoAlimtalkWebhookUrl ?? null,
        notification_digest_email_list: next.notificationDigestEmailList,
        notification_appearance_json: next.notificationAppearance,
      },
      { onConflict: "id" }
    )
    .select()
    .single()

  if (error || !data) {
    throw new Error(`[settings] update failed: ${error?.message}`)
  }

  clearResolvedSettingsCache()

  return rowToLegacy(data)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToLegacy(row: any): SiteSettings {
  return {
    demoFormEnabled: Boolean(row.demo_form_enabled ?? DEFAULT_SITE_SETTINGS.demoFormEnabled),
    demoBannerEnabled: Boolean(
      row.demo_banner_enabled ?? DEFAULT_SITE_SETTINGS.demoBannerEnabled
    ),
    demoBannerText: row.demo_banner_text ?? "",
    blogSectionEnabled: Boolean(
      row.blog_section_enabled ?? DEFAULT_SITE_SETTINGS.blogSectionEnabled
    ),
    noticeBannerEnabled: Boolean(
      row.notice_banner_enabled ?? DEFAULT_SITE_SETTINGS.noticeBannerEnabled
    ),
    noticeBannerText: row.notice_banner_text ?? "",
    googleSheetWebhookUrl: row.google_sheet_webhook_url ?? undefined,
    leadWebhookUrl: row.lead_webhook_url ?? undefined,
    channelTalkWebhookUrl: row.channel_talk_webhook_url ?? undefined,
    emailWebhookUrl: row.email_webhook_url ?? undefined,
    wecomOpsWebhookUrl: row.wecom_ops_webhook_url ?? undefined,
    wecomCriticalWebhookUrl: row.wecom_critical_webhook_url ?? undefined,
    kakaoAlimtalkWebhookUrl: row.kakao_alimtalk_webhook_url ?? undefined,
    notificationDigestEmailList: normalizeStringArray(
      row.notification_digest_email_list
    ),
    notificationAppearance: mergeNotificationAppearance(
      row.notification_appearance_json
    ),
  }
}
