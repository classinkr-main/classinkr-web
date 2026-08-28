import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

// 본체는 components/admin/crm/unified/* 로 분해됐다(2026-08-28) — 계약은 화면 단위로
// 유지해야 하므로 본체 + 분해 모듈 전체를 합쳐 검사한다.
const unifiedDir = resolve(process.cwd(), "components/admin/crm/unified")
const clientSource = [
  readFileSync(resolve(process.cwd(), "components/admin/crm/CrmUnifiedCustomersClient.tsx"), "utf8"),
  ...readdirSync(unifiedDir)
    .sort()
    .map((name) => readFileSync(resolve(unifiedDir, name), "utf8")),
].join("\n")
const pageSource = readFileSync(resolve(process.cwd(), "app/admin/crm/customers/unified/page.tsx"), "utf8")

describe("CRM 통합 고객 접근성 계약", () => {
  it("모바일 조작부는 44px 계약과 일관된 키보드 포커스를 제공한다", () => {
    expect(clientSource).toContain("[&_button]:min-h-11")
    expect(clientSource).toContain("[&_a]:min-h-11")
    expect(clientSource).toContain("[&_input:not([type=checkbox]):not([type=file])]:min-h-11")
    expect(clientSource).toContain("[&_select]:min-h-11")
    expect(clientSource).toContain("[&_button]:focus-visible:ring-2")
    expect(clientSource).toContain("[&_a]:focus-visible:ring-2")
    expect(clientSource).toContain("lg:[&_button]:min-h-6")
    expect(clientSource).toContain('className="flex min-h-11 cursor-pointer list-none items-center gap-1')
    expect(clientSource).toContain("lg:h-8 lg:min-h-0")
  })

  it("검색·필터·목록에 이름과 상태 의미를 제공한다", () => {
    expect(clientSource).toContain('aria-label="통합 고객 검색"')
    expect(clientSource).toContain('role="group" aria-label="빠른 고객 필터"')
    expect(clientSource).toContain('aria-label="통합 고객 검색 결과"')
    expect(clientSource).toContain("<caption className=\"sr-only\">통합 고객 검색 결과 목록</caption>")
    expect(clientSource).toContain('role="alert"')
    expect(clientSource).toContain("다시 시도")
    expect(clientSource).toContain("aria-busy={loading || loadingMore || refreshing}")
  })

  it("운영 기준 DB와 참고 원천을 같은 실패 분모로 합치지 않는다", () => {
    expect(clientSource).toContain('status.role === "primary"')
    expect(clientSource).toContain("primaryReady")
    expect(clientSource).toContain("primaryTotal")
    expect(clientSource).toContain("referenceTotal")
    expect(clientSource).toContain("데이터 원천 · 기준 DB")
    expect(clientSource).not.toContain("데이터 원천 · 정상 {data.sources.statuses.filter")
  })

  it("부분 동기화는 장애색이 아니라 주의색으로 구분한다", () => {
    expect(clientSource).toContain('if (!status.ok)')
    expect(clientSource).toContain('if (status.partial)')
    expect(clientSource).toContain('surface: "border-[#ECD29C] bg-[#FBF1E0]"')
    expect(clientSource).toContain('surface: "border-[#F6D5C5] bg-[#FEF3EE]"')
  })

  it("Suspense 첫 페인트가 빈 화면이 아니라 의미 있는 로딩 골격이다", () => {
    expect(pageSource).toContain("function UnifiedCustomersLoading()")
    expect(pageSource).toContain('role="status"')
    expect(pageSource).toContain('aria-label="통합 고객 화면 로딩 중"')
    expect(pageSource).toContain("fallback={<UnifiedCustomersLoading />}")
    expect(pageSource).not.toContain("fallback={null}")
  })
})
