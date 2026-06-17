alter table public.site_settings
  add column if not exists wecom_cs_webhook_url text;
