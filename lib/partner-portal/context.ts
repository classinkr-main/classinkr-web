import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import {
  getSupabaseBrowserEnv,
  hasSupabaseBrowserEnv,
} from "@/lib/supabase/public-env";

export interface PartnerAccountContext {
  userId: string;
  partnerAccountId: string | null;
  legacyPartnerId: string | null;
  customerId: string | null;
  role: string;
  source: "v2" | "legacy";
  isSuperAdmin?: boolean;
}

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  if (!hasSupabaseBrowserEnv()) return null;

  const { url, publishableKey } = getSupabaseBrowserEnv();
  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll() {},
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user.id;
}

export async function resolvePartnerAccountContext(
  req: NextRequest
): Promise<PartnerAccountContext | null> {
  // 1. Supabase 세션으로 일반 파트너 인증
  const userId = await getAuthenticatedUserId(req);
  if (userId) {
    const admin = createSupabaseAdminClient();

    const { data: v2User } = await admin
      .from("partner_account_users")
      .select("partner_account_id, role, status")
      .eq("user_id", userId)
      .eq("status", "active")
      .single();

    if (v2User?.partner_account_id) {
      return {
        userId,
        partnerAccountId: v2User.partner_account_id as string,
        legacyPartnerId: null,
        customerId: null,
        role: (v2User.role as string) ?? "owner",
        source: "v2",
      };
    }

    const { data: legacyUser } = await admin
      .from("partner_users")
      .select("partner_id, role, status")
      .eq("user_id", userId)
      .eq("status", "active")
      .single();

    if (legacyUser?.partner_id) {
      return {
        userId,
        partnerAccountId: null,
        legacyPartnerId: legacyUser.partner_id as string,
        customerId: legacyUser.partner_id as string,
        role: (legacyUser.role as string) ?? "admin",
        source: "legacy",
      };
    }
  }

  return null;
}
