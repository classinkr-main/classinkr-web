-- Sync the Xiaoshouyi `User` object so ownerId (stored on every record) can be
-- resolved to a person name for per-owner Korea team revenue.
-- Records arrive as external_crm_records(object_api_key='User', external_id=user id,
-- display_name=user name); lib/admin-crm-neo.ts builds the id -> name map from them.
-- If the object key or `name` field differs in this Xiaoshouyi tenant, adjust this
-- catalog row (it is read at sync runtime) — a mismatch only fails the User sync run.

INSERT INTO public.crm_xiaoshouyi_query_catalog (
  object_api_key,
  fields,
  order_by,
  page_size,
  max_pages,
  sync_priority,
  is_default_enabled,
  is_write_allowed,
  notes,
  metadata
)
VALUES
  (
    'User',
    ARRAY['id', 'name'],
    'id DESC',
    100,
    -- 100 pages: the HQ directory exceeds 2,000 users and `id DESC` puts older
    -- Korea owner ids past the cutoff; 20 pages truncated the sync at exactly 2,000.
    100,
    5,
    true,
    false,
    'Staff/user directory — used to resolve ownerId to a person name.',
    '{"displayNameFields":["name"],"role":"owner_lookup"}'::jsonb
  )
ON CONFLICT (object_api_key) DO UPDATE SET
  fields = EXCLUDED.fields,
  order_by = EXCLUDED.order_by,
  page_size = EXCLUDED.page_size,
  max_pages = EXCLUDED.max_pages,
  sync_priority = EXCLUDED.sync_priority,
  is_default_enabled = EXCLUDED.is_default_enabled,
  notes = EXCLUDED.notes,
  metadata = EXCLUDED.metadata,
  updated_at = now();
