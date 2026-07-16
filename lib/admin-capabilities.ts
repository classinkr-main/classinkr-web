export const ADMIN_CAPABILITIES = ["hardware.finalize"] as const

export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number]

const ADMIN_CAPABILITY_SET = new Set<string>(ADMIN_CAPABILITIES)

export function isAdminCapability(value: unknown): value is AdminCapability {
  return typeof value === "string" && ADMIN_CAPABILITY_SET.has(value)
}

export function normalizeAdminCapabilities(value: unknown): AdminCapability[] | null {
  if (!Array.isArray(value)) return null

  const capabilities = value.filter(isAdminCapability)
  if (capabilities.length !== value.length) return null

  return [...new Set(capabilities)].sort()
}
