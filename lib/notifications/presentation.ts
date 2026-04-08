import {
  mergeNotificationAppearance,
  type NotificationAppearanceSettings,
  type NotificationCategory,
  type NotificationSeverity,
  type NotificationType,
} from "@/lib/notifications/types"

export function resolveNotificationPresentation(input: {
  notificationType: NotificationType
  categoryTag: NotificationCategory
  severity: NotificationSeverity
  appearance?: Partial<NotificationAppearanceSettings> | null
}) {
  const appearance = mergeNotificationAppearance(input.appearance)
  const typeStyle = appearance.typeStyles[input.notificationType]
  const categoryStyle = appearance.categoryStyles[input.categoryTag]
  const severityOverride = appearance.severityOverrides[input.severity] ?? {}

  return {
    iconKey:
      severityOverride.iconKey ??
      categoryStyle?.iconKey ??
      typeStyle.iconKey,
    tone:
      severityOverride.tone ??
      categoryStyle?.tone ??
      typeStyle.tone,
  }
}
