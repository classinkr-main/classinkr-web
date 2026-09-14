export const BUG_STATUS_VALUES = ["open", "in-progress", "resolved", "closed"] as const
export const BUG_SEVERITY_VALUES = ["low", "medium", "high", "critical"] as const
export const PATCH_NOTE_STATUS_VALUES = ["draft", "published"] as const

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T)
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
