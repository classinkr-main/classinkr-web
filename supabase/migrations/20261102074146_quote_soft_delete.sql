-- 견적 원본과 계약 연결을 보존하면서 목록과 고객 공유에서 숨긴다.
ALTER TABLE public.quote_documents ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_quote_documents_deleted_at ON public.quote_documents (deleted_at) WHERE deleted_at IS NOT NULL;
