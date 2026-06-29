export type PremiumContentType = "article" | "video" | "file" | "link"
export type PremiumContentStatus = "draft" | "published" | "archived"
export type PremiumEntitlementStatus = "active" | "revoked" | "expired"
export type PremiumAccessAction =
  | "view_attempt"
  | "view_allowed"
  | "view_denied"
  | "download_issued"
  | "login_prompt"

export interface PremiumContentItem {
  id: string
  slug: string
  title: string
  summary: string | null
  content_type: PremiumContentType
  status: PremiumContentStatus
  required_tier: string
  storage_bucket: string | null
  storage_path: string | null
  external_url: string | null
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface PremiumEntitlement {
  id: string
  user_id: string
  tier: string
  status: PremiumEntitlementStatus
  source: string
  starts_at: string
  ends_at: string | null
  granted_by: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PremiumAccessEventInsert {
  content_id?: string | null
  content_slug?: string | null
  user_id?: string | null
  lead_id?: string | null
  anonymous_id?: string | null
  action: PremiumAccessAction
  reason?: string | null
  provider?: string | null
  page?: string | null
  referrer?: string | null
  user_agent?: string | null
}
