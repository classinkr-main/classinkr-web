-- Align internal CS chat tables with the explicit grant pattern used by
-- 20260716_internal_cs_multimodal_bridge: anon must have no direct access,
-- authenticated goes through is_active_admin() RLS, service_role keeps full access.
-- 20260715_internal_cs_chat relied on default privileges only; this closes that gap.

REVOKE ALL ON TABLE public.internal_cs_conversations FROM anon;
REVOKE ALL ON TABLE public.internal_cs_messages FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.internal_cs_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.internal_cs_messages TO authenticated;

GRANT ALL ON TABLE public.internal_cs_conversations TO service_role;
GRANT ALL ON TABLE public.internal_cs_messages TO service_role;
