-- Associate a blog post with a lead-magnet slug.
-- Rendered as a gated download block at the end of the article body
-- (see components/blog/LeadMagnetGate.tsx). The slug references
-- lib/lead-magnets.ts; subscribers captured through the block carry
-- the matching `lead_magnet` tag on the leads/newsletter pipeline.

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS lead_magnet_slug TEXT;

CREATE INDEX IF NOT EXISTS idx_blog_posts_lead_magnet_slug
  ON public.blog_posts(lead_magnet_slug)
  WHERE lead_magnet_slug IS NOT NULL;

COMMENT ON COLUMN public.blog_posts.lead_magnet_slug IS 'Lead-magnet slug (lib/lead-magnets.ts) rendered as a gated download block at the end of the article body.';
