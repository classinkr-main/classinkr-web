import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import LeadMagnetsAdminClient from "@/components/admin/LeadMagnetsAdminClient"
import { leadMagnets } from "@/lib/lead-magnets"

describe("LeadMagnetsAdminClient storage truth", () => {
  it("surfaces a missing production table and disables content mutations", () => {
    const html = renderToStaticMarkup(
      <LeadMagnetsAdminClient
        initialLeadMagnets={[leadMagnets[0]]}
        initialStorage={{
          source: "bundled-json-fallback",
          writable: false,
          reason: "table-missing",
        }}
      />
    )

    expect(html).toContain("읽기 전용 폴백")
    expect(html).toContain("운영 lead_magnets 테이블이 없어")
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*새 자료/)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*저장/)
    expect(html).toMatch(/<fieldset[^>]*disabled=""/)
  })

  it("labels local JSON as development-only instead of implying production sync", () => {
    const html = renderToStaticMarkup(
      <LeadMagnetsAdminClient
        initialLeadMagnets={[leadMagnets[0]]}
        initialStorage={{
          source: "local-json",
          writable: true,
          reason: "local-development",
        }}
      />
    )

    expect(html).toContain("로컬 개발 저장소")
    expect(html).toContain("배포 데이터베이스와 자동 동기화되지 않습니다")
  })
})
