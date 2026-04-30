-- Backfill slug for public_events rows that were created before the slug
-- column existed (or saved without one). The format mirrors the JS
-- generateSlug() in lib/repositories/public-events.ts: title-based with a
-- short id suffix to avoid uniqueness collisions.
UPDATE public_events
SET slug = LEFT(
  COALESCE(
    NULLIF(
      btrim(
        regexp_replace(
          regexp_replace(
            regexp_replace(lower(title), '\s+', '-', 'g'),
            '[^a-z0-9가-힣\-]', '', 'g'
          ),
          '-+', '-', 'g'
        ),
        '-'
      ),
      ''
    ),
    'event'
  ) || '-' || substr(id::text, 1, 5),
  60
)
WHERE slug IS NULL OR slug = '';
