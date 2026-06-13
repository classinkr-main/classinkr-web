import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { getSupabaseServerEnv } from "./server-env"

let cachedClient: SupabaseClient | null = null

export function createSupabaseAdminClient() {
  if (cachedClient) return cachedClient

  const { url, secretKey } = getSupabaseServerEnv()

  cachedClient = createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  return cachedClient
}
