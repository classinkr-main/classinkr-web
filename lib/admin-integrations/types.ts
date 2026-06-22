export const ADMIN_INTEGRATION_SECTION_KEYS = [
  "status",
  "apiKeys",
  "connectors",
  "webhooks",
] as const

export type AdminIntegrationSection = (typeof ADMIN_INTEGRATION_SECTION_KEYS)[number]
export type AdminIntegrationHealth = "ok" | "warning" | "error" | "unknown"
export type AdminIntegrationSource = "env" | "db" | "mixed" | "not_configured"
export type AdminIntegrationCategory =
  | "core"
  | "lead"
  | "notification"
  | "marketing"
  | "crm"
  | "billing"
  | "portal"
  | "ops"

export interface AdminIntegrationStatusItem {
  key: string
  label: string
  category: AdminIntegrationCategory
  configured: boolean
  source: AdminIntegrationSource
  health: AdminIntegrationHealth
  description?: string
  requiredKeys: string[]
  lastCheckedAt?: string
  lastSuccessAt?: string
  lastErrorSummary?: string
  adminHref?: string
}

export interface AdminIntegrationStatusResponse {
  generatedAt: string
  items: AdminIntegrationStatusItem[]
}
