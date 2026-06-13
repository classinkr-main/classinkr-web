-- Curated ownerId -> name overrides for Xiaoshouyi records.
-- Records carry only a numeric ownerId; the synced `User` object would resolve
-- names automatically, but this table lets admins curate names (and merge
-- English + Korean) without depending on a User sync. lib/external-crm/owner-names.ts
-- merges this over the User object, with this table winning.

CREATE TABLE IF NOT EXISTS public.crm_xiaoshouyi_owner_names (
  external_id  TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  korean_name  TEXT,
  eeo_code     TEXT,
  team         TEXT,
  -- non-Korea owners (e.g. China team) excluded from Korea team revenue.
  is_excluded  BOOLEAN NOT NULL DEFAULT false,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_xiaoshouyi_owner_names
  ADD COLUMN IF NOT EXISTS is_excluded BOOLEAN NOT NULL DEFAULT false;

DROP TRIGGER IF EXISTS crm_xiaoshouyi_owner_names_updated_at ON public.crm_xiaoshouyi_owner_names;
CREATE TRIGGER crm_xiaoshouyi_owner_names_updated_at
  BEFORE UPDATE ON public.crm_xiaoshouyi_owner_names
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.crm_xiaoshouyi_owner_names ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage xiaoshouyi owner names" ON public.crm_xiaoshouyi_owner_names;
CREATE POLICY "Admins manage xiaoshouyi owner names"
  ON public.crm_xiaoshouyi_owner_names
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

-- Seed: resolved by matching the owner's account/deal to the synced ownerId.
-- Most clients have account owner == deal owner; 케이원스포츠 is split (account
-- owner = Jung Gyusung, deal owner = Minjae Kim), so Minjae Kim is taken from the
-- deal owner. Park Han is inferred from "KJ 영재센터"; correct here if wrong.
-- 3637122367183714 is the China team (excluded from Korea revenue).
INSERT INTO public.crm_xiaoshouyi_owner_names (external_id, display_name, korean_name, eeo_code, team, is_excluded, metadata)
VALUES
  ('3637139967525610', 'Somang Jin (진소망)',  '진소망', 'EEO03622', 'KR', false, '{"anchor_account":"미지원교육"}'::jsonb),
  ('3757503865438940', 'Shin Heesung (신희성)', '신희성', 'EEO04012', 'KR', false, '{"anchor_account":"TRUSS"}'::jsonb),
  ('4084650935091887', 'Jung Gyusung (정규성)', '정규성', 'EEO04371', 'KR', false, '{"anchor_account":"에듀온픽"}'::jsonb),
  ('3935704427463307', 'Mun Junhyuk (문준혁)',  '문준혁', 'EEO04186', 'KR', false, '{"anchor_account":"윤유경플러스학원"}'::jsonb),
  ('3637154579422025', 'Lee Wangchan (이왕찬)', '이왕찬', 'EEO03787', 'KR', false, '{"anchor_account":"과사람 국어관"}'::jsonb),
  ('3637136716307280', 'Park Han (박한)',       '박한',   'EEO03743', 'KR', false, '{"anchor_account":"KJ 영재센터","confidence":"inferred"}'::jsonb),
  ('3637139388521310', 'Minjae Kim (김민재)',   '김민재', 'EEO03644', 'KR', false, '{"anchor_deal":"케이원스포츠 / 필아트 / 킴스수학"}'::jsonb),
  ('3637122367183714', '중국팀 (제외)',          NULL,     NULL,       'CN', true,  '{"reason":"china_revenue","sample_accounts":"중국 에듀원아카데미 / 리뉴젠 / 비바영어"}'::jsonb),
  ('3637149069712202', '金美玲 (제외)',          NULL,     'EEO02475', 'CN', true,  '{"reason":"china_staff","source":"user_directory"}'::jsonb),
  ('3637161934543690', '张鑫 (제외)',            NULL,     'EEO01227', 'CN', true,  '{"reason":"china_staff","source":"user_directory"}'::jsonb)
ON CONFLICT (external_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  korean_name = EXCLUDED.korean_name,
  eeo_code = EXCLUDED.eeo_code,
  team = EXCLUDED.team,
  is_excluded = EXCLUDED.is_excluded,
  metadata = EXCLUDED.metadata,
  updated_at = now();
