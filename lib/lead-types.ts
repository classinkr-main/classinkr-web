export type LeadSource = "demo_modal" | "contact_page" | "newsletter"

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
