-- Internal CS copilot queue, chat archive, and human review state.
-- The assistant may draft answers, but only an authenticated CS/admin actor can
-- approve, correct, resolve, or archive them through the admin API.

CREATE TABLE IF NOT EXISTS public.internal_cs_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '새 내부 CS 상담',
  status TEXT NOT NULL DEFAULT 'queue'
    CHECK (status IN ('queue', 'active', 'waiting_review', 'resolved', 'archived')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assignee_user_id TEXT,
  assignee_name TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  customer_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  archive_reason TEXT,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS internal_cs_conversations_queue_idx
  ON public.internal_cs_conversations (status, priority, last_message_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS internal_cs_conversations_assignee_idx
  ON public.internal_cs_conversations (assignee_user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS internal_cs_conversations_tags_idx
  ON public.internal_cs_conversations USING GIN (tags);

DROP TRIGGER IF EXISTS internal_cs_conversations_updated_at ON public.internal_cs_conversations;
CREATE TRIGGER internal_cs_conversations_updated_at
  BEFORE UPDATE ON public.internal_cs_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.internal_cs_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.internal_cs_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL
    CHECK (role IN ('user', 'assistant', 'internal_note', 'system')),
  content TEXT NOT NULL CHECK (length(btrim(content)) > 0),
  visibility TEXT NOT NULL DEFAULT 'internal'
    CHECK (visibility = 'internal'),
  model_provider TEXT,
  model_name TEXT,
  model_mode TEXT CHECK (model_mode IS NULL OR model_mode IN ('fast', 'deep', 'backup')),
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_state TEXT NOT NULL DEFAULT 'not_required'
    CHECK (review_state IN ('not_required', 'pending', 'approved', 'changes_requested', 'rejected')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  corrected_content TEXT,
  feedback_labels TEXT[] NOT NULL DEFAULT '{}',
  regression_candidate BOOLEAN NOT NULL DEFAULT false,
  regression_outcome TEXT NOT NULL DEFAULT 'not_evaluated'
    CHECK (regression_outcome IN ('not_evaluated', 'pass', 'needs_fix', 'promoted', 'excluded')),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT internal_cs_messages_review_role_check CHECK (
    (role = 'assistant' AND review_state IN ('pending', 'approved', 'changes_requested', 'rejected'))
    OR (role <> 'assistant' AND review_state = 'not_required')
  ),
  CONSTRAINT internal_cs_messages_reviewer_check CHECK (
    (review_state IN ('not_required', 'pending') AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (review_state IN ('approved', 'changes_requested', 'rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS internal_cs_messages_conversation_idx
  ON public.internal_cs_messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS internal_cs_messages_pending_review_idx
  ON public.internal_cs_messages (created_at ASC)
  WHERE role = 'assistant' AND review_state = 'pending';

CREATE INDEX IF NOT EXISTS internal_cs_messages_regression_idx
  ON public.internal_cs_messages (regression_outcome, updated_at DESC)
  WHERE regression_candidate = true;

DROP TRIGGER IF EXISTS internal_cs_messages_updated_at ON public.internal_cs_messages;
CREATE TRIGGER internal_cs_messages_updated_at
  BEFORE UPDATE ON public.internal_cs_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.internal_cs_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_cs_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active admins manage internal CS conversations" ON public.internal_cs_conversations;
CREATE POLICY "Active admins manage internal CS conversations"
  ON public.internal_cs_conversations
  FOR ALL
  USING (is_active_admin())
  WITH CHECK (is_active_admin());

DROP POLICY IF EXISTS "Active admins manage internal CS messages" ON public.internal_cs_messages;
CREATE POLICY "Active admins manage internal CS messages"
  ON public.internal_cs_messages
  FOR ALL
  USING (is_active_admin())
  WITH CHECK (is_active_admin());

COMMENT ON TABLE public.internal_cs_conversations IS
  'Internal-only CS copilot queue and archive. Never exposed through public chatbot APIs.';
COMMENT ON COLUMN public.internal_cs_conversations.customer_context IS
  'Internal customer/case context. Must not be copied to public answers without human review.';
COMMENT ON COLUMN public.internal_cs_messages.review_state IS
  'Assistant drafts remain pending until a human CS/admin actor records the final judgement.';
COMMENT ON COLUMN public.internal_cs_messages.regression_outcome IS
  'Human-labelled outcome for future evaluation and regression-set curation.';
