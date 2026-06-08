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
  eventSlug?: string
  sourceDetail?: string
  leadMagnet?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  utmContent?: string
  gclid?: string
  fbclid?: string
  msclkid?: string
  ttclid?: string
  landingPage?: string
  currentPage?: string
  referrer?: string
}
