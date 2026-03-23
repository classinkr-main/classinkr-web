import "server-only"

import { createClient } from "@supabase/supabase-js"

import { getSupabaseServerEnv } from "./server-env"

export function createSupabaseAdminClient() {
  const { url, secretKey } = getSupabaseServerEnv()

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
