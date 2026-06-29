import "server-only"

import type {
  AdminIntegrationHealth,
  AdminIntegrationSource,
  AdminIntegrationStatusItem,
  AdminIntegrationStatusResponse,
} from "@/lib/admin-integrations/types"
import type { SiteSettings } from "@/lib/site-settings-types"

type AdminIntegrationStatus = AdminIntegrationStatusItem

type WebhookSettingKey =
  | "googleSheetWebhookUrl"
  | "leadWebhookUrl"
  | "channelTalkWebhookUrl"
  | "emailWebhookUrl"
  | "wecomOpsWebhookUrl"
  | "wecomCsWebhookUrl"
  | "wecomCriticalWebhookUrl"
  | "kakaoAlimtalkWebhookUrl"

const WEBHOOK_SETTING_ENV_KEYS = {
  googleSheetWebhookUrl: "GOOGLE_SHEET_WEBHOOK_URL",
  leadWebhookUrl: "LEAD_WEBHOOK_URL",
  channelTalkWebhookUrl: "CHANNEL_TALK_WEBHOOK_URL",
  emailWebhookUrl: "EMAIL_WEBHOOK_URL",
  wecomOpsWebhookUrl: "WECOM_OPS_WEBHOOK_URL",
  wecomCsWebhookUrl: "WECOM_CS_WEBHOOK_URL",
  wecomCriticalWebhookUrl: "WECOM_CRITICAL_WEBHOOK_URL",
  kakaoAlimtalkWebhookUrl: "KAKAO_ALIMTALK_WEBHOOK_URL",
} as const satisfies Record<WebhookSettingKey, string>

const ANALYTICS_PLACEHOLDER_IDS = new Set([
  "g-xxxxxxxxxx",
  "xxxxxxxxxxxxxxx",
  "your_kakao_pixel_id",
])

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim()
  return value ? value : null
}

function hasEnv(name: string): boolean {
  return readEnv(name) !== null
}

function hasAnyEnv(names: readonly string[]): boolean {
  return names.some((name) => hasEnv(name))
}

function hasAllEnv(names: readonly string[]): boolean {
  return names.every((name) => hasEnv(name))
}

function hasSettingValue(settings: SiteSettings, key: WebhookSettingKey): boolean {
  return Boolean(settings[key]?.trim())
}

function sourceFromEnv(names: readonly string[]): AdminIntegrationSource {
  return hasAnyEnv(names) ? "env" : "not_configured"
}

function sourceFromSetting(
  settings: SiteSettings,
  key: WebhookSettingKey
): AdminIntegrationSource {
  if (hasEnv(WEBHOOK_SETTING_ENV_KEYS[key])) return "env"
  return hasSettingValue(settings, key) ? "db" : "not_configured"
}

function sourceFromDigestList(settings: SiteSettings): AdminIntegrationSource {
  if (hasEnv("NOTIFICATION_DIGEST_EMAIL_LIST")) return "env"
  return settings.notificationDigestEmailList.length > 0 ? "db" : "not_configured"
}

function combineSources(
  ...sources: readonly AdminIntegrationSource[]
): AdminIntegrationSource {
  const active = new Set(
    sources.filter((source) => source !== "not_configured")
  )

  if (active.size === 0) return "not_configured"
  if (active.size === 1) return [...active][0]
  return "mixed"
}

function healthForPresence(
  configured: boolean,
  hasPartialConfig: boolean,
  missingHealth: AdminIntegrationHealth = "warning"
): AdminIntegrationHealth {
  if (configured) return "ok"
  return hasPartialConfig ? "warning" : missingHealth
}

function hasConfiguredAnalyticsId(name: string): boolean {
  const value = readEnv(name)
  if (!value) return false
  return !ANALYTICS_PLACEHOLDER_IDS.has(value.toLowerCase())
}

function hasSupabaseServerEnv(): boolean {
  return hasAnyEnv(["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"])
}

function buildSupabaseStatus(): AdminIntegrationStatus {
  const browserConfigured = hasAllEnv([
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ])
  const configured = browserConfigured && hasSupabaseServerEnv()
  const hasPartialConfig =
    browserConfigured ||
    hasSupabaseServerEnv() ||
    hasAnyEnv([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ])

  return {
    key: "supabase",
    label: "Supabase",
    category: "core",
    configured,
    source: sourceFromEnv([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SECRET_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]),
    health: healthForPresence(configured, hasPartialConfig, "error"),
    requiredKeys: [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY",
    ],
    adminHref: "/admin/settings?tab=integrations",
  }
}

function buildPageFormWebhookStatus(): AdminIntegrationStatus {
  const configured = hasEnv("PAGE_WEBHOOK_SECRET")

  return {
    key: "page_form_webhook",
    label: "Page Form Webhook",
    category: "lead",
    configured,
    source: sourceFromEnv(["PAGE_WEBHOOK_SECRET"]),
    health: healthForPresence(configured, false),
    requiredKeys: ["PAGE_WEBHOOK_SECRET"],
    adminHref: "/admin/settings?tab=integrations",
  }
}

function buildLeadWebhookStatus(settings: SiteSettings): AdminIntegrationStatus {
  const settingKeys: WebhookSettingKey[] = [
    "googleSheetWebhookUrl",
    "leadWebhookUrl",
  ]
  const configuredCount = settingKeys.filter((key) =>
    hasSettingValue(settings, key)
  ).length
  const configured = configuredCount > 0

  return {
    key: "lead_webhooks",
    label: "Lead Webhooks",
    category: "lead",
    configured,
    source: combineSources(
      ...settingKeys.map((key) => sourceFromSetting(settings, key))
    ),
    health: configuredCount === settingKeys.length ? "ok" : "warning",
    requiredKeys: [
      "GOOGLE_SHEET_WEBHOOK_URL or site_settings.google_sheet_webhook_url",
      "LEAD_WEBHOOK_URL or site_settings.lead_webhook_url",
    ],
    adminHref: "/admin/settings?tab=integrations",
  }
}

function buildNotificationStatus(settings: SiteSettings): AdminIntegrationStatus {
  const webhookKeys: WebhookSettingKey[] = [
    "wecomOpsWebhookUrl",
    "wecomCsWebhookUrl",
    "wecomCriticalWebhookUrl",
    "kakaoAlimtalkWebhookUrl",
  ]
  const configuredCount = webhookKeys.filter((key) =>
    hasSettingValue(settings, key)
  ).length
  const hasDigestRecipients = settings.notificationDigestEmailList.length > 0
  const configured = configuredCount > 0 || hasDigestRecipients

  return {
    key: "notifications",
    label: "Notifications",
    category: "notification",
    configured,
    source: combineSources(
      ...webhookKeys.map((key) => sourceFromSetting(settings, key)),
      sourceFromDigestList(settings)
    ),
    health: healthForPresence(configured, false),
    requiredKeys: [
      "WECOM_OPS_WEBHOOK_URL or site_settings.wecom_ops_webhook_url",
      "WECOM_CS_WEBHOOK_URL or site_settings.wecom_cs_webhook_url",
      "WECOM_CRITICAL_WEBHOOK_URL or site_settings.wecom_critical_webhook_url",
      "KAKAO_ALIMTALK_WEBHOOK_URL or site_settings.kakao_alimtalk_webhook_url",
      "NOTIFICATION_DIGEST_EMAIL_LIST or site_settings.notification_digest_email_list",
    ],
    adminHref: "/admin/settings?tab=notifications",
  }
}

function buildChannelTalkStatus(settings: SiteSettings): AdminIntegrationStatus {
  const hasOpenApiKey =
    hasAnyEnv(["CHANNEL_TALK_ACCESS", "CHANNEL_ACCESS_KEY"]) &&
    hasAnyEnv(["CHANNEL_TALK_ACCESS_SECRET", "CHANNEL_ACCESS_SECRET"])
  const hasInboundWebhookAuth = hasAnyEnv([
    "CHANNEL_TALK_WEBHOOK_URL_TOKEN",
    "CHANNEL_WEBHOOK_URL_TOKEN",
    "CHANNEL_TALK_WEBHOOK_SECRET",
    "CHANNEL_WEBHOOK_SECRET",
  ])
  const hasWidgetKey = hasAnyEnv([
    "NEXT_PUBLIC_CHANNEL_PLUGIN_KEY",
    "NEXT_PUBLIC_CHANNEL_TALK_PLUGIN_KEY",
  ])
  const hasOutboundWebhook = hasSettingValue(settings, "channelTalkWebhookUrl")
  const configured =
    hasOpenApiKey || hasInboundWebhookAuth || hasWidgetKey || hasOutboundWebhook

  return {
    key: "channel_talk",
    label: "Channel Talk",
    category: "lead",
    configured,
    source: combineSources(
      sourceFromEnv([
        "CHANNEL_TALK_ACCESS",
        "CHANNEL_ACCESS_KEY",
        "CHANNEL_TALK_ACCESS_SECRET",
        "CHANNEL_ACCESS_SECRET",
        "CHANNEL_TALK_WEBHOOK_URL_TOKEN",
        "CHANNEL_WEBHOOK_URL_TOKEN",
        "CHANNEL_TALK_WEBHOOK_SECRET",
        "CHANNEL_WEBHOOK_SECRET",
        "NEXT_PUBLIC_CHANNEL_PLUGIN_KEY",
        "NEXT_PUBLIC_CHANNEL_TALK_PLUGIN_KEY",
      ]),
      sourceFromSetting(settings, "channelTalkWebhookUrl")
    ),
    health:
      hasOpenApiKey && (hasInboundWebhookAuth || hasWidgetKey || hasOutboundWebhook)
        ? "ok"
        : healthForPresence(configured, configured),
    requiredKeys: [
      "CHANNEL_TALK_ACCESS or CHANNEL_ACCESS_KEY",
      "CHANNEL_TALK_ACCESS_SECRET or CHANNEL_ACCESS_SECRET",
      "CHANNEL_TALK_WEBHOOK_URL_TOKEN or CHANNEL_TALK_WEBHOOK_SECRET",
      "NEXT_PUBLIC_CHANNEL_PLUGIN_KEY or NEXT_PUBLIC_CHANNEL_TALK_PLUGIN_KEY",
      "CHANNEL_TALK_WEBHOOK_URL or site_settings.channel_talk_webhook_url",
    ],
    adminHref: "/admin/channel-talk",
  }
}

function buildEmailStatus(settings: SiteSettings): AdminIntegrationStatus {
  const hasResend = hasEnv("RESEND_API_KEY")
  const hasGmail = hasAllEnv(["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"])
  const hasWebhook = hasSettingValue(settings, "emailWebhookUrl")
  const configured = hasResend || hasGmail || hasWebhook

  return {
    key: "email_provider",
    label: "Email",
    category: "notification",
    configured,
    source: combineSources(
      sourceFromEnv([
        "RESEND_API_KEY",
        "RESEND_FROM",
        "GOOGLE_SERVICE_ACCOUNT_EMAIL",
        "GOOGLE_PRIVATE_KEY",
      ]),
      sourceFromSetting(settings, "emailWebhookUrl")
    ),
    health: hasResend || hasGmail ? "ok" : healthForPresence(configured, configured),
    requiredKeys: [
      "RESEND_API_KEY",
      "GOOGLE_SERVICE_ACCOUNT_EMAIL",
      "GOOGLE_PRIVATE_KEY",
      "EMAIL_WEBHOOK_URL or site_settings.email_webhook_url",
    ],
    adminHref: "/admin/settings?tab=integrations",
  }
}

function buildGoogleStatus(): AdminIntegrationStatus {
  const configured = hasAllEnv([
    "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    "GOOGLE_PRIVATE_KEY",
  ])
  const hasPartialConfig = hasAnyEnv([
    "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    "GOOGLE_PRIVATE_KEY",
    "GOOGLE_SHEET_ID",
    "GOOGLE_CALENDAR_ID",
  ])

  return {
    key: "google_service_account",
    label: "Google",
    category: "ops",
    configured,
    source: sourceFromEnv([
      "GOOGLE_SERVICE_ACCOUNT_EMAIL",
      "GOOGLE_PRIVATE_KEY",
      "GOOGLE_SHEET_ID",
      "GOOGLE_CALENDAR_ID",
    ]),
    health: healthForPresence(configured, hasPartialConfig),
    requiredKeys: ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"],
    adminHref: "/admin/calendar",
  }
}

function buildBranchSheetsStatus(): AdminIntegrationStatus {
  const serviceAccountConfigured = hasAllEnv([
    "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    "GOOGLE_PRIVATE_KEY",
  ])
  const sheetIdsConfigured = hasAllEnv([
    "GOOGLE_BRANCH_DASHBOARD_SHEET_ID",
    "GOOGLE_BRANCH_HARDWARE_SHEET_ID",
  ])
  const configured = serviceAccountConfigured && sheetIdsConfigured
  const hasPartialConfig =
    serviceAccountConfigured ||
    sheetIdsConfigured ||
    hasAnyEnv([
      "GOOGLE_SERVICE_ACCOUNT_EMAIL",
      "GOOGLE_PRIVATE_KEY",
      "GOOGLE_BRANCH_DASHBOARD_SHEET_ID",
      "GOOGLE_BRANCH_HARDWARE_SHEET_ID",
    ])

  return {
    key: "branch_sheets",
    label: "Branch Sheets",
    category: "ops",
    configured,
    source: sourceFromEnv([
      "GOOGLE_SERVICE_ACCOUNT_EMAIL",
      "GOOGLE_PRIVATE_KEY",
      "GOOGLE_BRANCH_DASHBOARD_SHEET_ID",
      "GOOGLE_BRANCH_HARDWARE_SHEET_ID",
    ]),
    health: healthForPresence(configured, hasPartialConfig),
    requiredKeys: [
      "GOOGLE_SERVICE_ACCOUNT_EMAIL",
      "GOOGLE_PRIVATE_KEY",
      "GOOGLE_BRANCH_DASHBOARD_SHEET_ID",
      "GOOGLE_BRANCH_HARDWARE_SHEET_ID",
    ],
    adminHref: "/admin/branch",
  }
}

function buildGeminiStatus(): AdminIntegrationStatus {
  const configured = hasEnv("GEMINI_API_KEY")

  return {
    key: "gemini",
    label: "Gemini",
    category: "ops",
    configured,
    source: sourceFromEnv([
      "GEMINI_API_KEY",
      "GEMINI_MODEL",
      "GEMINI_FAST_MODEL",
      "GEMINI_REASONING_MODEL",
      "GEMINI_EMBED_MODEL",
      "GEMINI_EMBED_DIM",
    ]),
    health: healthForPresence(configured, false),
    requiredKeys: ["GEMINI_API_KEY"],
    adminHref: "/admin/docs",
  }
}

function buildMetaStatus(): AdminIntegrationStatus {
  const hasToken = hasAnyEnv([
    "META_ACCESS_TOKEN",
    "META_PAGE_ACCESS_TOKEN",
    "META_CAPI_ACCESS_TOKEN",
  ])
  const hasAdAccount = hasEnv("META_AD_ACCOUNT_ID")
  const hasWebhookAuth = hasAllEnv([
    "META_APP_SECRET",
    "META_WEBHOOK_VERIFY_TOKEN",
  ])
  const configured = (hasToken && hasAdAccount) || hasWebhookAuth
  const hasPartialConfig =
    hasToken ||
    hasAdAccount ||
    hasWebhookAuth ||
    hasAnyEnv([
      "META_APP_ID",
      "META_APP_SECRET",
      "META_BUSINESS_ID",
      "META_PAGE_ID",
      "META_WEBHOOK_VERIFY_TOKEN",
      "META_DATASET_ID",
    ])

  return {
    key: "meta_marketing",
    label: "Meta",
    category: "marketing",
    configured,
    source: sourceFromEnv([
      "META_APP_ID",
      "META_APP_SECRET",
      "META_GRAPH_API_VERSION",
      "META_BUSINESS_ID",
      "META_AD_ACCOUNT_ID",
      "META_ACCESS_TOKEN",
      "META_PAGE_ID",
      "META_PAGE_ACCESS_TOKEN",
      "META_INSTAGRAM_BUSINESS_ACCOUNT_ID",
      "INSTAGRAM_BUSINESS_ACCOUNT_ID",
      "IG_USER_ID",
      "META_WEBHOOK_VERIFY_TOKEN",
      "META_DATASET_ID",
      "META_CAPI_ACCESS_TOKEN",
      "META_TEST_EVENT_CODE",
    ]),
    health: healthForPresence(configured, hasPartialConfig),
    requiredKeys: [
      "META_AD_ACCOUNT_ID",
      "META_ACCESS_TOKEN or META_CAPI_ACCESS_TOKEN",
      "META_APP_SECRET",
      "META_WEBHOOK_VERIFY_TOKEN",
    ],
    adminHref: "/admin/campaigns",
  }
}

function buildAnalyticsPixelsStatus(): AdminIntegrationStatus {
  const browserConfigured =
    hasConfiguredAnalyticsId("NEXT_PUBLIC_GTM_ID") ||
    hasConfiguredAnalyticsId("NEXT_PUBLIC_META_PIXEL_ID") ||
    hasConfiguredAnalyticsId("NEXT_PUBLIC_KAKAO_PIXEL_ID") ||
    hasEnv("NEXT_PUBLIC_GOOGLE_ADS_DEMO_CONVERSION_LABEL") ||
    hasEnv("NEXT_PUBLIC_INTERNAL_TRACKING_ENABLED")
  const metaCapiConfigured =
    hasAnyEnv(["META_DATASET_ID", "NEXT_PUBLIC_META_PIXEL_ID"]) &&
    hasAnyEnv(["META_CAPI_ACCESS_TOKEN", "META_ACCESS_TOKEN"])
  const ga4ServerConfigured = hasAllEnv(["GA4_MEASUREMENT_ID", "GA4_API_SECRET"])
  const configured =
    browserConfigured ||
    metaCapiConfigured ||
    ga4ServerConfigured
  const hasPartialServerConfig = hasAnyEnv([
    "META_DATASET_ID",
    "META_CAPI_ACCESS_TOKEN",
    "META_ACCESS_TOKEN",
    "GA4_MEASUREMENT_ID",
    "GA4_API_SECRET",
  ])

  return {
    key: "analytics_pixels",
    label: "Analytics Pixels",
    category: "marketing",
    configured,
    source: sourceFromEnv([
      "NEXT_PUBLIC_GTM_ID",
      "NEXT_PUBLIC_META_PIXEL_ID",
      "NEXT_PUBLIC_KAKAO_PIXEL_ID",
      "NEXT_PUBLIC_GOOGLE_ADS_DEMO_CONVERSION_LABEL",
      "NEXT_PUBLIC_INTERNAL_TRACKING_ENABLED",
      "META_DATASET_ID",
      "META_CAPI_ACCESS_TOKEN",
      "GA4_MEASUREMENT_ID",
      "GA4_API_SECRET",
    ]),
    health: healthForPresence(configured, hasPartialServerConfig),
    requiredKeys: [
      "NEXT_PUBLIC_GTM_ID",
      "NEXT_PUBLIC_META_PIXEL_ID",
      "NEXT_PUBLIC_KAKAO_PIXEL_ID",
      "NEXT_PUBLIC_INTERNAL_TRACKING_ENABLED",
      "META_DATASET_ID + META_CAPI_ACCESS_TOKEN for Meta CAPI",
      "GA4_MEASUREMENT_ID + GA4_API_SECRET for GA4 Measurement Protocol",
    ],
    adminHref: "/admin/analytics",
  }
}

function buildTossStatus(): AdminIntegrationStatus {
  const hasWidgetKey = hasEnv("NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY")
  const hasSecretKey = hasEnv("TOSS_SECRET_KEY")
  const checkoutEnabled = readEnv("NEXT_PUBLIC_SW_CHECKOUT_ENABLED") === "true"
  const configured = hasWidgetKey && hasSecretKey
  const hasPartialConfig = hasWidgetKey || hasSecretKey || checkoutEnabled

  return {
    key: "toss_payments",
    label: "Toss",
    category: "billing",
    configured,
    source: sourceFromEnv([
      "NEXT_PUBLIC_SW_CHECKOUT_ENABLED",
      "NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY",
      "TOSS_SECRET_KEY",
    ]),
    health:
      configured && checkoutEnabled
        ? "ok"
        : configured
          ? "warning"
          : healthForPresence(configured, hasPartialConfig),
    requiredKeys: [
      "NEXT_PUBLIC_SW_CHECKOUT_ENABLED",
      "NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY",
      "TOSS_SECRET_KEY",
    ],
    adminHref: "/admin/software-quote-codes",
  }
}

function buildFxStatus(): AdminIntegrationStatus {
  return {
    key: "fx_rate",
    label: "FX",
    category: "billing",
    configured: true,
    source: sourceFromEnv(["USD_KRW_FALLBACK_RATE", "CNY_KRW_FALLBACK_RATE"]),
    health: "ok",
    requiredKeys: ["USD_KRW_FALLBACK_RATE", "CNY_KRW_FALLBACK_RATE"],
    adminHref: "/admin/software-quote-codes",
  }
}

function buildXiaoshouyiStatus(): AdminIntegrationStatus {
  const hasBaseUrl = hasAnyEnv([
    "XIAOSHOUYI_BASE_URL",
    "XIAOSHOUYI_API_BASE_URL",
    "XIAOSHOUYI_API_URL",
    "COMPANY_CRM_API_URL",
    "CRM_API_URL",
  ])
  const hasAccessToken = hasAnyEnv([
    "XIAOSHOUYI_ACCESS_TOKEN",
    "XIAOSHOUYI_SERVICE_ACCESS_TOKEN",
  ])
  const hasServiceCredentials =
    hasAllEnv(["XIAOSHOUYI_CLIENT_ID", "XIAOSHOUYI_CLIENT_SECRET"]) &&
    hasAnyEnv(["XIAOSHOUYI_USERNAME", "XIAOSHOUYI_SERVICE_USERNAME"]) &&
    hasAnyEnv(["XIAOSHOUYI_PASSWORD", "XIAOSHOUYI_SERVICE_PASSWORD"])
  const configured = hasBaseUrl && (hasAccessToken || hasServiceCredentials)
  const hasPartialConfig = hasBaseUrl || hasAccessToken || hasServiceCredentials

  return {
    key: "xiaoshouyi_crm",
    label: "Xiaoshouyi / Neo CRM",
    category: "crm",
    configured,
    source: sourceFromEnv([
      "XIAOSHOUYI_BASE_URL",
      "XIAOSHOUYI_API_BASE_URL",
      "XIAOSHOUYI_API_URL",
      "COMPANY_CRM_API_URL",
      "CRM_API_URL",
      "XIAOSHOUYI_ACCESS_TOKEN",
      "XIAOSHOUYI_SERVICE_ACCESS_TOKEN",
      "XIAOSHOUYI_CLIENT_ID",
      "XIAOSHOUYI_CLIENT_SECRET",
      "XIAOSHOUYI_USERNAME",
      "XIAOSHOUYI_SERVICE_USERNAME",
      "XIAOSHOUYI_PASSWORD",
      "XIAOSHOUYI_SERVICE_PASSWORD",
      "XIAOSHOUYI_SYNC_OBJECTS",
      "XIAOSHOUYI_SYNC_PAGE_SIZE",
      "XIAOSHOUYI_SYNC_MAX_PAGES",
    ]),
    health: healthForPresence(configured, hasPartialConfig),
    requiredKeys: [
      "XIAOSHOUYI_BASE_URL or XIAOSHOUYI_API_BASE_URL or XIAOSHOUYI_API_URL",
      "XIAOSHOUYI_ACCESS_TOKEN or XIAOSHOUYI_SERVICE_ACCESS_TOKEN or service OAuth credentials",
    ],
    adminHref: "/admin/crm",
  }
}

function hasXiaoshouyiBaseUrl() {
  return hasAnyEnv([
    "XIAOSHOUYI_BASE_URL",
    "XIAOSHOUYI_API_BASE_URL",
    "XIAOSHOUYI_API_URL",
    "COMPANY_CRM_API_URL",
    "CRM_API_URL",
  ])
}

function hasXiaoshouyiCredential() {
  const hasAccessToken = hasAnyEnv([
    "XIAOSHOUYI_ACCESS_TOKEN",
    "XIAOSHOUYI_SERVICE_ACCESS_TOKEN",
  ])
  const hasServiceCredentials =
    hasAllEnv(["XIAOSHOUYI_CLIENT_ID", "XIAOSHOUYI_CLIENT_SECRET"]) &&
    hasAnyEnv(["XIAOSHOUYI_USERNAME", "XIAOSHOUYI_SERVICE_USERNAME"]) &&
    hasAnyEnv(["XIAOSHOUYI_PASSWORD", "XIAOSHOUYI_SERVICE_PASSWORD"])

  return hasAccessToken || hasServiceCredentials
}

function buildCrmWritebackStatus(): AdminIntegrationStatus {
  const hasCrmCredential = hasXiaoshouyiBaseUrl() && hasXiaoshouyiCredential()
  const hasQueueStorage = hasSupabaseServerEnv()
  const configured = hasCrmCredential && hasQueueStorage
  const hasPartialConfig = hasCrmCredential || hasQueueStorage

  return {
    key: "crm_writeback",
    label: "CRM Writeback",
    category: "crm",
    configured,
    source: combineSources(
      sourceFromEnv([
        "XIAOSHOUYI_BASE_URL",
        "XIAOSHOUYI_API_BASE_URL",
        "XIAOSHOUYI_API_URL",
        "XIAOSHOUYI_ACCESS_TOKEN",
        "XIAOSHOUYI_SERVICE_ACCESS_TOKEN",
        "XIAOSHOUYI_CLIENT_ID",
        "XIAOSHOUYI_CLIENT_SECRET",
        "XIAOSHOUYI_USERNAME",
        "XIAOSHOUYI_SERVICE_USERNAME",
        "XIAOSHOUYI_PASSWORD",
        "XIAOSHOUYI_SERVICE_PASSWORD",
      ]),
      sourceFromEnv(["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"])
    ),
    health: healthForPresence(configured, hasPartialConfig),
    requiredKeys: [
      "XIAOSHOUYI_BASE_URL or XIAOSHOUYI_API_BASE_URL or XIAOSHOUYI_API_URL",
      "XIAOSHOUYI_ACCESS_TOKEN or service OAuth credentials",
      "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY",
    ],
    adminHref: "/admin/crm",
  }
}

function buildOpsScheduleStatus(): AdminIntegrationStatus {
  const configured = hasEnv("CRON_SECRET")

  return {
    key: "ops_schedule",
    label: "Ops Schedule",
    category: "ops",
    configured,
    source: sourceFromEnv(["CRON_SECRET"]),
    health: configured ? "warning" : "error",
    requiredKeys: ["CRON_SECRET"],
    lastErrorSummary:
      "vercel.json에 /api/cron/sync-branch 하루 3회, /api/cron/sync-external-crm 하루 4회가 등록되어 Hobby 기준 확인이 필요합니다.",
    adminHref: "/admin/settings?tab=integrations&section=connectors",
  }
}

function buildPartnerPortalStatus(): AdminIntegrationStatus {
  const supabaseConfigured =
    hasAllEnv([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ]) && hasSupabaseServerEnv()

  return {
    key: "partner_portal",
    label: "Partner Portal",
    category: "portal",
    configured: supabaseConfigured,
    source: sourceFromEnv([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SECRET_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]),
    health: healthForPresence(
      supabaseConfigured,
      hasAnyEnv([
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
        "SUPABASE_SECRET_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
      ])
    ),
    requiredKeys: [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY",
    ],
    adminHref: "/admin/partners",
  }
}

export async function getAdminIntegrationStatusResponse(): Promise<AdminIntegrationStatusResponse> {
  const { getResolvedSettings } = await import("@/lib/repositories/settings")
  const settings = await getResolvedSettings()
  const generatedAt = new Date().toISOString()

  const items = [
    buildSupabaseStatus(),
    buildPageFormWebhookStatus(),
    buildLeadWebhookStatus(settings),
    buildNotificationStatus(settings),
    buildChannelTalkStatus(settings),
    buildEmailStatus(settings),
    buildGoogleStatus(),
    buildBranchSheetsStatus(),
    buildGeminiStatus(),
    buildMetaStatus(),
    buildAnalyticsPixelsStatus(),
    buildTossStatus(),
    buildFxStatus(),
    buildXiaoshouyiStatus(),
    buildCrmWritebackStatus(),
    buildPartnerPortalStatus(),
    buildOpsScheduleStatus(),
  ].map((item) => ({
    ...item,
    lastCheckedAt: generatedAt,
    lastSuccessAt: item.health === "ok" ? generatedAt : undefined,
  }))

  return {
    generatedAt,
    items,
  }
}
