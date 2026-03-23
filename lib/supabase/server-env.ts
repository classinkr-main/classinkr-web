import "server-only"

import { getSupabaseBrowserEnv } from "./public-env"

function readEnv(name: string) {
  const value = process.env[name]?.trim()
  return value && value.length > 0 ? value : null
}

export function getSupabaseServerEnv() {
  const { url, publishableKey } = getSupabaseBrowserEnv()
  const secretKey =
    readEnv("SUPABASE_SECRET_KEY") ?? readEnv("SUPABASE_SERVICE_ROLE_KEY")

  if (!secretKey) {
    throw new Error(
      "Missing Supabase server env. Set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY."
    )
  }

  return { url, publishableKey, secretKey }
}
