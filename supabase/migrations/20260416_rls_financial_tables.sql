-- RLS 보안 강화: 결제 관련 신규 테이블에 deny-all 기본 정책 적용
-- 모든 접근은 service role(admin client)를 통해서만 허용.

ALTER TABLE public.software_quote_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_code_redemptions ENABLE ROW LEVEL SECURITY;

-- Deny-all default: no authenticated or anon user can read/write these tables.
-- All application access uses the Supabase service role (createSupabaseAdminClient),
-- which bypasses RLS. This prevents accidental exposure if anon key is ever used.
-- To grant read access to specific roles in the future, add explicit policies here.
