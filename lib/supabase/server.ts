import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import { getSupabaseBrowserEnv } from "./public-env"

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  const { url, publishableKey } = getSupabaseBrowserEnv()

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Middleware is responsible for keeping auth cookies in sync when
          // server components cannot mutate cookies during render.
        }
      },
    },
  })
}
