export const ROADMAP_STATUS_VALUES = ["planned", "in-progress", "done"] as const
export const BUG_STATUS_VALUES = ["open", "in-progress", "resolved", "closed"] as const
export const BUG_SEVERITY_VALUES = ["low", "medium", "high", "critical"] as const
export const PATCH_NOTE_STATUS_VALUES = ["draft", "published"] as const

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T)
}

export function isRoadmapStatus(value: unknown) {
  return isOneOf(value, ROADMAP_STATUS_VALUES)
}

export function isBugStatus(value: unknown) {
  return isOneOf(value, BUG_STATUS_VALUES)
}

export function isBugSeverity(value: unknown) {
  return isOneOf(value, BUG_SEVERITY_VALUES)
}

export function isPatchNoteStatus(value: unknown) {
  return isOneOf(value, PATCH_NOTE_STATUS_VALUES)
}

export function hasValidRoadmapStatuses(input: Record<string, unknown>) {
  if (input.status !== undefined && !isRoadmapStatus(input.status)) return false
  if (input.features === undefined) return true
  if (!Array.isArray(input.features)) return false

  return input.features.every((feature) => {
    if (!feature || typeof feature !== "object" || Array.isArray(feature)) return false
    return isRoadmapStatus((feature as Record<string, unknown>).status)
  })
}
