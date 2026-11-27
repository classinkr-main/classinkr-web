import type { Metadata } from "next"

import { RequestsWorkspace } from "@/components/admin/requests/RequestsWorkspace"
import { resolveAdminShellSession, STAFF_ADMIN_API_ROLES } from "@/lib/admin-auth"
import { requestContextQuery } from "@/lib/admin/requests"

export const metadata: Metadata = { title: "요청" }

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [params, session] = await Promise.all([searchParams, resolveAdminShellSession()])
  const context = requestContextQuery({
    get: (key) => typeof params[key] === "string" ? params[key] : null,
  })
  const testSite = process.env.ADMIN_TEST_SITE_URL || "https://test.classin.co.kr"

  return (
    <RequestsWorkspace
      key={context.toString()}
      initialCanManage={session?.source === "supabase" && STAFF_ADMIN_API_ROLES.some((role) => role === session.role)}
      initialRequest={context.get("request")}
      screen={context.get("screen")}
      testVersion={context.get("testVersion")}
      errorCode={context.get("errorCode")}
      testSite={testSite}
    />
  )
}
