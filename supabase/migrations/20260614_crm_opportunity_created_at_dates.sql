-- Opportunity "order date" should mean the order creation time in Neo CRM.
-- closeDate is a forecast/expected close date and can sit months in the future,
-- which makes CRM home "recent orders" and monthly opportunity KPIs drift.

UPDATE public.crm_xiaoshouyi_query_catalog
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{occurredAtFields}',
  '["createdAt","updatedAt","closeDate"]'::jsonb,
  true
)
WHERE source_system = 'xiaoshouyi'
  AND object_api_key = 'opportunity';

WITH opportunity_dates AS (
  SELECT
    id,
    CASE
      WHEN payload->>'createdAt' ~ '^\d+(\.\d+)?$'
        THEN to_timestamp((payload->>'createdAt')::numeric / 1000)
      WHEN payload->>'createdAt' ~ '^\d{4}-\d{2}-\d{2}'
        THEN (payload->>'createdAt')::timestamptz
      ELSE NULL
    END AS neo_created_at
  FROM public.external_crm_records
  WHERE source_system = 'xiaoshouyi'
    AND object_api_key = 'opportunity'
    AND COALESCE(payload->>'createdAt', '') <> ''
)
UPDATE public.external_crm_records records
SET occurred_at = opportunity_dates.neo_created_at
FROM opportunity_dates
WHERE records.id = opportunity_dates.id
  AND opportunity_dates.neo_created_at IS NOT NULL
  AND records.occurred_at IS DISTINCT FROM opportunity_dates.neo_created_at;
