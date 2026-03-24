import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { getSupabaseBrowserEnv, hasSupabaseBrowserEnv } from "./public-env"

export async function updateSupabaseSession(request: NextRequest) {
  if (!hasSupabaseBrowserEnv()) {
    return NextResponse.next({ request })
  }

  const { url, publishableKey } = getSupabaseBrowserEnv()
  let response = NextResponse.next({ request })

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value)
        })

        response = NextResponse.next({ request })

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  await supabase.auth.getUser()

  return response
}
