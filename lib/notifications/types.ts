export const NOTIFICATION_TYPES = [
  "action_required",
  "approval_required",
  "status_update",
  "reminder",
  "warning",
  "incident",
  "digest",
] as const

export const NOTIFICATION_CATEGORIES = [
  "general",
  "lead",
  "schedule",
  "partner",
  "system",
  "bug",
  "finance",
  "marketing",
  "content",
] as const

export const NOTIFICATION_SEVERITIES = ["info", "warning", "critical"] as const

export const NOTIFICATION_SCOPES = [
  "personal",
  "team",
  "branch",
  "org_admin",
  "critical_control",
] as const

export const NOTIFICATION_CHANNELS = [
  "in_app",
  "wecom_webhook",
  "channel_talk_webhook",
  "kakao_alimtalk",
  "email",
] as const

export const NOTIFICATION_RECIPIENT_TYPES = [
  "admin_role",
  "admin_user",
  "partner_account",
  "partner_user",
] as const

export const NOTIFICATION_ICON_KEYS = [
  "bell",
  "triangle_alert",
  "shield_alert",
  "badge_check",
  "users",
  "calendar_clock",
  "building",
  "bug",
  "wallet",
  "megaphone",
  "mail",
  "inbox",
  "file_text",
  "sparkles",
  "circle_help",
] as const

export const NOTIFICATION_TONES = [
  "slate",
  "blue",
  "green",
  "amber",
  "red",
  "sky",
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number]
export type NotificationScope = (typeof NOTIFICATION_SCOPES)[number]
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]
export type NotificationRecipientType = (typeof NOTIFICATION_RECIPIENT_TYPES)[number]
export type NotificationIconKey = (typeof NOTIFICATION_ICON_KEYS)[number]
export type NotificationTone = (typeof NOTIFICATION_TONES)[number]

export type NotificationStatus = "unread" | "read" | "archived"

export interface NotificationAppearanceStyle {
  iconKey: NotificationIconKey
  tone: NotificationTone
}

export interface NotificationAppearanceSettings {
  typeStyles: Record<NotificationType, NotificationAppearanceStyle>
  categoryStyles: Partial<Record<NotificationCategory, NotificationAppearanceStyle>>
  severityOverrides: Partial<Record<NotificationSeverity, Partial<NotificationAppearanceStyle>>>
}

export interface NotificationRecipientTarget {
  recipientType: NotificationRecipientType
  recipientId: string
}

export interface NotificationInboxItem {
  id: string
  eventId: string | null
  recipientType: NotificationRecipientType
  recipientId: string
  channel: NotificationChannel
  eventType: string
  notificationType: NotificationType
  categoryTag: NotificationCategory
  scopeTag: NotificationScope
  severity: NotificationSeverity
  title: string
  message: string
  routeUrl?: string
  iconKey: NotificationIconKey
  tone: NotificationTone
  status: NotificationStatus
  metadata: Record<string, unknown>
  readAt?: string
  createdAt: string
}

export const DEFAULT_NOTIFICATION_APPEARANCE: NotificationAppearanceSettings = {
  typeStyles: {
    action_required: { iconKey: "triangle_alert", tone: "amber" },
    approval_required: { iconKey: "shield_alert", tone: "blue" },
    status_update: { iconKey: "badge_check", tone: "blue" },
    reminder: { iconKey: "bell", tone: "slate" },
    warning: { iconKey: "triangle_alert", tone: "amber" },
    incident: { iconKey: "shield_alert", tone: "red" },
    digest: { iconKey: "inbox", tone: "slate" },
  },
  categoryStyles: {
    lead: { iconKey: "users", tone: "blue" },
    schedule: { iconKey: "calendar_clock", tone: "amber" },
    partner: { iconKey: "building", tone: "blue" },
    system: { iconKey: "shield_alert", tone: "slate" },
    bug: { iconKey: "bug", tone: "red" },
    finance: { iconKey: "wallet", tone: "green" },
    marketing: { iconKey: "megaphone", tone: "sky" },
    content: { iconKey: "file_text", tone: "slate" },
    general: { iconKey: "bell", tone: "slate" },
  },
  severityOverrides: {
    info: {},
    warning: { tone: "amber" },
    critical: { iconKey: "shield_alert", tone: "red" },
  },
}

export const NOTIFICATION_TYPE_OPTIONS = [
  { value: "action_required", label: "Action required" },
  { value: "approval_required", label: "Approval required" },
  { value: "status_update", label: "Status update" },
  { value: "reminder", label: "Reminder" },
  { value: "warning", label: "Warning" },
  { value: "incident", label: "Incident" },
  { value: "digest", label: "Digest" },
] as const

export const NOTIFICATION_CATEGORY_OPTIONS = [
  { value: "general", label: "General" },
  { value: "lead", label: "Lead / CRM" },
  { value: "schedule", label: "Schedule" },
  { value: "partner", label: "Partner" },
  { value: "system", label: "System" },
  { value: "bug", label: "Bug / QA" },
  { value: "finance", label: "Finance" },
  { value: "marketing", label: "Marketing" },
  { value: "content", label: "Content" },
] as const

export const NOTIFICATION_SEVERITY_OPTIONS = [
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "critical", label: "Critical" },
] as const

export const NOTIFICATION_ICON_OPTIONS = [
  { value: "bell", label: "Bell" },
  { value: "triangle_alert", label: "Triangle alert" },
  { value: "shield_alert", label: "Shield alert" },
  { value: "badge_check", label: "Badge check" },
  { value: "users", label: "Users" },
  { value: "calendar_clock", label: "Calendar clock" },
  { value: "building", label: "Building" },
  { value: "bug", label: "Bug" },
  { value: "wallet", label: "Wallet" },
  { value: "megaphone", label: "Megaphone" },
  { value: "mail", label: "Mail" },
  { value: "inbox", label: "Inbox" },
  { value: "file_text", label: "File text" },
  { value: "sparkles", label: "Sparkles" },
  { value: "circle_help", label: "Help" },
] as const

export const NOTIFICATION_TONE_OPTIONS = [
  { value: "slate", label: "Slate" },
  { value: "blue", label: "Blue" },
  { value: "green", label: "Green" },
  { value: "amber", label: "Amber" },
  { value: "red", label: "Red" },
  { value: "sky", label: "Sky" },
] as const

function mergeStyle(
  base: NotificationAppearanceStyle,
  override?: Partial<NotificationAppearanceStyle>
): NotificationAppearanceStyle {
  return {
    iconKey: override?.iconKey ?? base.iconKey,
    tone: override?.tone ?? base.tone,
  }
}

export function mergeNotificationAppearance(
  ...overrides: Array<Partial<NotificationAppearanceSettings> | null | undefined>
): NotificationAppearanceSettings {
  const merged: NotificationAppearanceSettings = {
    typeStyles: { ...DEFAULT_NOTIFICATION_APPEARANCE.typeStyles },
    categoryStyles: { ...DEFAULT_NOTIFICATION_APPEARANCE.categoryStyles },
    severityOverrides: { ...DEFAULT_NOTIFICATION_APPEARANCE.severityOverrides },
  }

  for (const override of overrides) {
    if (!override) continue

    for (const type of NOTIFICATION_TYPES) {
      const nextStyle = override.typeStyles?.[type]
      if (nextStyle) {
        merged.typeStyles[type] = mergeStyle(merged.typeStyles[type], nextStyle)
      }
    }

    for (const category of NOTIFICATION_CATEGORIES) {
      const nextStyle = override.categoryStyles?.[category]
      if (nextStyle) {
        const current =
          merged.categoryStyles[category] ??
          DEFAULT_NOTIFICATION_APPEARANCE.categoryStyles[category] ??
          DEFAULT_NOTIFICATION_APPEARANCE.typeStyles.status_update
        merged.categoryStyles[category] = mergeStyle(current, nextStyle)
      }
    }

    for (const severity of NOTIFICATION_SEVERITIES) {
      const nextOverride = override.severityOverrides?.[severity]
      if (nextOverride) {
        merged.severityOverrides[severity] = {
          ...merged.severityOverrides[severity],
          ...nextOverride,
        }
      }
    }
  }

  return merged
}
