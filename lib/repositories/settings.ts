import "server-only"

import {
  DEFAULT_SITE_SETTINGS,
} from "@/lib/db"
import { mergeNotificationSchedule } from "@/lib/notifications/schedule"
import { mergeNotificationAppearance } from "@/lib/notifications/types"
import type { SiteSettings } from "@/lib/site-settings-types"
import {
  isWebhookEnabled,
  normalizeWebhookEnabledMap,
  WEBHOOK_SETTING_ENV_KEYS,
  WEBHOOK_SETTING_KEYS,
  type WebhookSettingKey,
} from "@/lib/webhook-settings"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type { SiteSettings } from "@/lib/site-settings-types"

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
  const masked = { ...settings }
  for (const key of WEBHOOK_SETTING_KEYS) masked[key] = ""
  return masked
}

function mergeResolvedSettings(settings: SiteSettings): SiteSettings {
  // 켜짐/꺼짐은 여기서 URL 을 지우지 않는다 — 지우면 "URL 없음"과 "꺼둠"이
  // 연동 상태 화면에서 같은 모양이 된다. 발송 차단은 emit-event 의
  // resolveWebhookTarget 과 각 직접 발송 경로에서 판정한다.
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
    wecomCsWebhookUrl:
      normalizeOptional(settings.wecomCsWebhookUrl) ??
      normalizeOptional(process.env.WECOM_CS_WEBHOOK_URL),
    wecomLeadReportWebhookUrl:
      normalizeOptional(settings.wecomLeadReportWebhookUrl) ??
      normalizeOptional(process.env.WECOM_LEAD_REPORT_WEBHOOK_URL),
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
    webhookEnabled: normalizeWebhookEnabledMap(settings.webhookEnabled),
    notificationSchedule: mergeNotificationSchedule(settings.notificationSchedule),
  }
}

export async function getSettings(): Promise<SiteSettings> {
  const { data, error } = await sb()
    .from("site_settings")
    .select("*")
    .eq("id", "default")
    .single()

  if (error) {
    // 설정 장애를 기본값으로 바꾸면 꺼둔 웹훅이 다시 켜지고 그 결과가 캐시된다.
    throw new Error(`[settings] read failed (${error.code ?? "unavailable"})`)
  }
  if (!data) throw new Error("[settings] default row is missing")
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

  const settings = await getSettings()
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

export type WebhookConfigSource = "db" | "env" | "not_configured"

export interface WebhookConfigMeta {
  configured: boolean
  source: WebhookConfigSource
  enabled: boolean
}

/**
 * 웹훅별 "설정됨 / 어디서 왔는지 / 켜짐" 요약. 값 자체는 화면에 절대 내려보내지
 * 않으므로(마스킹), 이게 없으면 운영자는 새로고침 후 빈 칸만 보고 뭐가 켜져
 * 있는지 알 수 없다.
 *
 * source 판정 순서는 mergeResolvedSettings 의 실제 우선순위와 같아야 한다 —
 * DB 값이 있으면 그게 쓰이고, 없을 때만 env 로 내려간다. 반대로 적으면
 * "env" 라고 표시된 채 실제로는 DB 값이 나가는 상태가 된다.
 */
export async function getWebhookConfigMeta(): Promise<
  Record<WebhookSettingKey, WebhookConfigMeta>
> {
  const stored = await getSettings()
  const enabledMap = normalizeWebhookEnabledMap(stored.webhookEnabled)

  return Object.fromEntries(
    WEBHOOK_SETTING_KEYS.map((key) => {
      const fromDb = normalizeOptional(stored[key])
      const fromEnv = normalizeOptional(process.env[WEBHOOK_SETTING_ENV_KEYS[key]])
      const source: WebhookConfigSource = fromDb
        ? "db"
        : fromEnv
          ? "env"
          : "not_configured"

      return [
        key,
        {
          configured: source !== "not_configured",
          source,
          enabled: isWebhookEnabled(enabledMap, key),
        },
      ]
    })
  ) as Record<WebhookSettingKey, WebhookConfigMeta>
}

export async function updateSettings(
  patch: Partial<SiteSettings>
): Promise<SiteSettings> {
  const current = await getSettings()
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
    wecomCsWebhookUrl:
      normalizeOptional(patch.wecomCsWebhookUrl) ?? current.wecomCsWebhookUrl,
    wecomLeadReportWebhookUrl:
      normalizeOptional(patch.wecomLeadReportWebhookUrl) ??
      current.wecomLeadReportWebhookUrl,
    wecomCriticalWebhookUrl:
      normalizeOptional(patch.wecomCriticalWebhookUrl) ??
      current.wecomCriticalWebhookUrl,
    kakaoAlimtalkWebhookUrl:
      normalizeOptional(patch.kakaoAlimtalkWebhookUrl) ??
      current.kakaoAlimtalkWebhookUrl,
  }

  // 웹훅 스위치와 스케줄은 patch 에 있을 때만 갈아끼운다. 설정 화면이 전체
  // 객체를 PATCH 하므로, 없는 키를 기본값으로 되돌리면 다른 탭 저장이
  // 이 둘을 조용히 초기화한다.
  const nextWebhookEnabled =
    patch.webhookEnabled !== undefined
      ? normalizeWebhookEnabledMap(patch.webhookEnabled)
      : current.webhookEnabled
  const nextSchedule =
    patch.notificationSchedule !== undefined
      ? mergeNotificationSchedule(patch.notificationSchedule)
      : current.notificationSchedule

  const next: SiteSettings = {
    ...current,
    ...patch,
    ...webhookValues,
    notificationDigestEmailList: nextDigestEmailList,
    notificationAppearance: nextAppearance,
    webhookEnabled: nextWebhookEnabled,
    notificationSchedule: nextSchedule,
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
        // 직전 배포로 돌아가도 운영 채널의 활성 상태를 보존한다.
        wecom_ops_webhook_enabled: isWebhookEnabled(next.webhookEnabled, "wecomOpsWebhookUrl"),
        wecom_cs_webhook_url: next.wecomCsWebhookUrl ?? null,
        wecom_lead_report_webhook_url: next.wecomLeadReportWebhookUrl ?? null,
        wecom_critical_webhook_url: next.wecomCriticalWebhookUrl ?? null,
        kakao_alimtalk_webhook_url: next.kakaoAlimtalkWebhookUrl ?? null,
        notification_digest_email_list: next.notificationDigestEmailList,
        notification_appearance_json: next.notificationAppearance,
        webhook_enabled_json: next.webhookEnabled,
        notification_schedule_json: next.notificationSchedule,
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
    wecomCsWebhookUrl: row.wecom_cs_webhook_url ?? undefined,
    wecomLeadReportWebhookUrl:
      row.wecom_lead_report_webhook_url ?? undefined,
    wecomCriticalWebhookUrl: row.wecom_critical_webhook_url ?? undefined,
    kakaoAlimtalkWebhookUrl: row.kakao_alimtalk_webhook_url ?? undefined,
    notificationDigestEmailList: normalizeStringArray(
      row.notification_digest_email_list
    ),
    notificationAppearance: mergeNotificationAppearance(
      row.notification_appearance_json
    ),
    // 옛 boolean 컬럼은 마이그레이션이 JSONB 로 백필한 뒤에도 남겨둔다.
    // 백필 전 배포가 잠깐 겹치는 구간에서 wecomOps 만 옛 컬럼으로 되읽는다.
    webhookEnabled: normalizeWebhookEnabledMap(
      row.webhook_enabled_json ??
        (row.wecom_ops_webhook_enabled === false ? { wecomOpsWebhookUrl: false } : {})
    ),
    notificationSchedule: mergeNotificationSchedule(row.notification_schedule_json),
  }
}
