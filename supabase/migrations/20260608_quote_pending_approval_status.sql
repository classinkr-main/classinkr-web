-- Quote approval flow status fix.
-- App code and generated v2 types use `pending_approval`; the original V2
-- domain enum was created before the approval gate was added.

ALTER TYPE public.quote_document_status_v2
  ADD VALUE IF NOT EXISTS 'pending_approval';
