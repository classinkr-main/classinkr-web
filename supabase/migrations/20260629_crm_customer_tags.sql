-- CRM customer manual labels/tags.
-- Operator-applied free-form labels on a unified customer (lead or neo_account),
-- distinct from system-derived flags (deriveCustomerFlags). Powers manual
-- segmentation/filtering that the derived flags cannot express.

CREATE TABLE IF NOT EXISTS public.crm_customer_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL DEFAULT 'unknown'
    CHECK (target_type IN ('lead', 'neo_account', 'customer', 'unknown')),
  target_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  UNIQUE (target_type, target_id, tag)
);

CREATE INDEX IF NOT EXISTS crm_customer_tags_target_idx
  ON public.crm_customer_tags (target_type, target_id);

CREATE INDEX IF NOT EXISTS crm_customer_tags_tag_idx
  ON public.crm_customer_tags (tag);

ALTER TABLE public.crm_customer_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage CRM customer tags" ON public.crm_customer_tags;
CREATE POLICY "Admins manage CRM customer tags"
  ON public.crm_customer_tags
  FOR ALL
  USING (is_active_admin())
  WITH CHECK (is_active_admin());

-- 태그 길이 가드 — 저장소 정규화(40자)와 동일한 제약을 DB에서도 강제(빈 값/과길이 차단).
ALTER TABLE public.crm_customer_tags
  DROP CONSTRAINT IF EXISTS crm_customer_tags_tag_len_check;
ALTER TABLE public.crm_customer_tags
  ADD CONSTRAINT crm_customer_tags_tag_len_check CHECK (char_length(tag) BETWEEN 1 AND 40);
