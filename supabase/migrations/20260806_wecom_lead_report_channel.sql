ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS wecom_lead_report_webhook_url TEXT,
  ADD COLUMN IF NOT EXISTS wecom_ops_webhook_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.site_settings.wecom_lead_report_webhook_url IS
  'Daily, weekly, and monthly lead report destination. Kept separate from operational alerts.';
COMMENT ON COLUMN public.site_settings.wecom_ops_webhook_enabled IS
  'When false, disables the normal WeCom operations webhook including environment fallback.';
