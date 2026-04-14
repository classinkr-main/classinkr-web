ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS open_count INT NOT NULL DEFAULT 0;

-- Atomic open_count increment used by /api/track/open
CREATE OR REPLACE FUNCTION increment_campaign_open_count(campaign_id UUID)
RETURNS VOID LANGUAGE SQL SECURITY DEFINER AS $$
  UPDATE email_campaigns
  SET open_count = open_count + 1
  WHERE id = campaign_id;
$$;
