export type LeadSource =
  | "demo_modal"
  | "contact_page"
  | "newsletter"
  | "meta_lead_ads"

export interface LeadPayload {
  source: LeadSource
  name?: string
  org?: string
  role?: string
  size?: string
  email?: string
  phone?: string
  message?: string
  timestamp: string
  marketingConsent?: boolean
}
