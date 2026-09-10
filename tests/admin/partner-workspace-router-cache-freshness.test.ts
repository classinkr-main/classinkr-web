import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Admin 속도 레버 A의 빈틈 보강 — /admin/crm/deals/kpi 는 서버(page.tsx)가 데이터를 만들지만
// 마운트 시 자체 재페치가 없는 유일한 force-dynamic 어드민 페이지다. staleTimes.dynamic(180초)
// 으로 재사용된 RSC 응답이 그대로 화면에 남지 않도록 generatedAt 스탬프 + 오래된 마운트의
// router.refresh() + 새 props 동기화를 소스 계약으로 고정한다.

const page = readFileSync(join(process.cwd(), "app/admin/crm/deals/kpi/page.tsx"), "utf8")
const client = readFileSync(
  join(process.cwd(), "components/admin/partners/PartnerWorkspacePageClient.tsx"),
  "utf8"
)

describe("deals/kpi page — router cache freshness", () => {
  it("stamps generatedAt on the server and passes it to the client", () => {
    expect(page).toContain("generatedAt: Date.now()")
    expect(page).toContain("generatedAt={generatedAt}")
  })

  it("client refreshes once when mounted from a reused (stale) payload and syncs new props", () => {
    expect(client).toContain('import { isPrefetchFresh } from "@/lib/admin/prefetch-freshness"')
    expect(client).toContain("if (!isPrefetchFresh(generatedAt)) router.refresh()")
    expect(client).toContain("appliedGeneratedAtRef")
    expect(client).toContain("setWorkspaces(initialWorkspaces)")
  })
})
