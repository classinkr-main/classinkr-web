-- Add rich content + slug fields to public_events
ALTER TABLE public_events
  ADD COLUMN IF NOT EXISTS slug text UNIQUE,
  ADD COLUMN IF NOT EXISTS content_markdown text;
