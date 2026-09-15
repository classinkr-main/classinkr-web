/**
 * unified-02 · unified-10 — 통합 고객 목록 클라이언트의 갱신 실패 신호·배너 톤 소스 계약.
 *
 * CrmUnifiedCustomersClient 는 라우터·dynamic()·useSearchParams 에 묶여 있어 동기 렌더가
 * 불안정하므로 tests/crm/unified-customers-accessibility-contract.test.ts 와 같은 소스 계약
 * 방식으로 지킨다.
 *
 *  - 새로고침(force)은 staleIfError 폴백 없이 실패를 throw 받아야 한다(조용한 성공 금지).
 *  - staleReason === "error" 폴백은 성공이 아니라 '갱신 실패 — 이전 결과 표시 중' 경고다.
 *  - 조회 실패는 danger, 갱신 실패·부분 데이터·담당자 매핑은 warning 으로 CrmNoticeBanner 만 쓴다.
 *  - 팔레트 밖 #B85C33 계열 리터럴을 남기지 않는다.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const clientSource = readFileSync(
  resolve(process.cwd(), "components/admin/crm/CrmUnifiedCustomersClient.tsx"),
  "utf8"
)
const repositorySource = readFileSync(
  resolve(process.cwd(), "lib/repositories/crm-unified-customers.ts"),
  "utf8"
)

describe("CrmUnifiedCustomersClient 갱신 실패 신호 계약", () => {
  it("stale 메타를 돌려주는 래퍼를 쓰고 force 경로는 staleIfError 폴백을 끈다", () => {
    expect(clientSource).toContain("adminFetchJsonCachedWithMeta<CrmUnifiedCustomers>")
    expect(clientSource).not.toMatch(/\badminFetchJsonCached</)
    expect(clientSource).toContain("staleIfError: !options?.force")
    expect(clientSource).toContain('result.stale && result.staleReason === "error"')
  })

  it("백그라운드 재검증 실패도 경고로 올리고, 실패 시 화면의 이전 결과를 지우지 않는다", () => {
    expect(clientSource).toContain("error: revalidateError")
    expect(clientSource).toContain("failRefresh(revalidateError)")
    expect(clientSource).toContain("if (hasDataRef.current) {")
    expect(clientSource).toContain("갱신 실패 — 이전 결과 표시 중")
  })

  it("배너는 CrmNoticeBanner 톤으로만 가르고 (danger=조회 실패 · warning=그 외) 팔레트 밖 리터럴이 없다", () => {
    expect(clientSource).toContain('tone="danger"')
    expect(clientSource).toContain('title="조회 실패"')
    expect((clientSource.match(/tone="warning"/g) ?? []).length).toBeGreaterThanOrEqual(3)
    expect(clientSource).toContain('label: "다시 시도"')
    expect(clientSource).not.toContain("#B85C33")
    expect(clientSource).not.toContain("#F6D5C5")
    expect(clientSource).not.toContain("#FEF3EE")
    expect(clientSource).not.toContain("AlertTriangle")
  })

  it("재시도는 force 로 나가고 새로고침 버튼은 요청 중 aria-busy 다", () => {
    expect(clientSource).toContain("{ force: true, append: refreshFailure.retryAppend }")
    expect(clientSource).toContain("aria-busy={refreshing || undefined}")
  })
})

describe("crm-unified-customers 통화 라벨 계약 (unified-08)", () => {
  it("전환 고객 계약·미수 라벨은 ₩ 기호를 포함하고 '원' 접미사를 쓰지 않는다", () => {
    expect(repositorySource).toContain('return `₩${Math.round(amount).toLocaleString("ko-KR")}`')
    expect(repositorySource).not.toContain('toLocaleString("ko-KR")}원`')
  })
})
