-- Register Naver shared-map folders as a supporting, read-only CRM source.
-- Saved places remain external snapshots until an operator confirms a link;
-- they never overwrite customer master data or auto-confirm candidates.

INSERT INTO public.crm_source_priorities (
  source_system,
  label,
  priority,
  trust_tier,
  is_primary,
  read_policy,
  write_policy,
  freshness_window_hours,
  auto_confirm_enabled,
  auto_confirm_min_confidence,
  auto_confirm_min_gap,
  notes,
  metadata
)
VALUES (
  'naver_shared_map',
  '네이버 공유지도',
  85,
  'supporting',
  false,
  'read_snapshot',
  'disabled',
  168,
  false,
  0.9200,
  0.1500,
  'Team-curated saved places are review evidence only. Confirmed links must be created separately and customer master data is never overwritten.',
  '{"object_api_key":"saved_place","region_source":"address","region_standard":"korea_17_provinces","matching":"name_region_rev_review"}'::jsonb
)
ON CONFLICT (source_system) DO UPDATE SET
  label = EXCLUDED.label,
  priority = EXCLUDED.priority,
  trust_tier = EXCLUDED.trust_tier,
  is_primary = EXCLUDED.is_primary,
  read_policy = EXCLUDED.read_policy,
  write_policy = EXCLUDED.write_policy,
  freshness_window_hours = EXCLUDED.freshness_window_hours,
  auto_confirm_enabled = EXCLUDED.auto_confirm_enabled,
  auto_confirm_min_confidence = EXCLUDED.auto_confirm_min_confidence,
  auto_confirm_min_gap = EXCLUDED.auto_confirm_min_gap,
  notes = EXCLUDED.notes,
  metadata = EXCLUDED.metadata,
  updated_at = now();
