-- Persist lead-magnet and attribution details captured by public lead forms.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS source_detail TEXT,
  ADD COLUMN IF NOT EXISTS lead_magnet TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS gclid TEXT,
  ADD COLUMN IF NOT EXISTS fbclid TEXT,
  ADD COLUMN IF NOT EXISTS msclkid TEXT,
  ADD COLUMN IF NOT EXISTS ttclid TEXT,
  ADD COLUMN IF NOT EXISTS landing_page TEXT,
  ADD COLUMN IF NOT EXISTS current_page TEXT,
  ADD COLUMN IF NOT EXISTS referrer TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_source_detail
  ON public.leads(source_detail);

CREATE INDEX IF NOT EXISTS idx_leads_lead_magnet
  ON public.leads(lead_magnet)
  WHERE lead_magnet IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_utm_campaign_detail
  ON public.leads(utm_campaign, utm_content);

COMMENT ON COLUMN public.leads.source_detail IS 'CTA, topic, modal source, or lead-magnet source detail submitted by the client.';
COMMENT ON COLUMN public.leads.lead_magnet IS 'Lead-magnet slug when the lead came from a checklist, guide, or gated material.';
COMMENT ON COLUMN public.leads.landing_page IS 'First page URL captured for attribution.';
COMMENT ON COLUMN public.leads.current_page IS 'Current page URL at submission time.';
COMMENT ON COLUMN public.leads.referrer IS 'Browser referrer captured at submission time.';
