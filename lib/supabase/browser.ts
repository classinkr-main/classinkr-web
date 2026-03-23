"use client"

import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

import { getSupabaseBrowserEnv } from "./public-env"

let browserClient: SupabaseClient | null = null

export function createSupabaseBrowserClient() {
  if (browserClient) return browserClient

  const { url, publishableKey } = getSupabaseBrowserEnv()
  browserClient = createBrowserClient(url, publishableKey)

  return browserClient
}
