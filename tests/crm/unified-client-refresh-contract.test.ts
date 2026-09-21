/**
 * unified-02 · unified-10 — 통합 고객 목록 클라이언트의 갱신 실패 신호·배너 톤 소스 계약.
 *
 * CrmUnifiedCustomersClient 는 라우터·dynamic()·useSearchParams 에 묶여 있어 동기 렌더가
 * 불안정하므로 tests/crm/unified-customers-accessibility-contract.test.ts 와 같은 소스 계약
 * 방식을 소스 문자열 검사에 병행한다. 다만 2026-09-12 리뷰(#4)가 지적했듯 문자열 매칭만으로는
 * 실제 상태 전이(성공/실패 announce, 필터 변경 후 실패 분류)를 검증할 수 없다 — 그 두 결함은
 * loadPage에서 순수 함수로 뽑아낸 describeUnifiedListStatus/queryKeyFromUrl/isSameLoadQuery를
 * 실제 입력·출력으로 테스트한다(아래 두 번째 describe 블록).
 *
 *  - 새로고침(force)은 staleIfError 폴백 없이 실패를 throw 받아야 한다(조용한 성공 금지).
 *  - staleReason === "error" 폴백은 성공이 아니라 '갱신 실패 — 이전 결과 표시 중' 경고다.
 *  - 조회 실패는 danger, 갱신 실패·부분 데이터·담당자 매핑은 warning 으로 CrmNoticeBanner 만 쓴다.
 *  - 팔레트 밖 #B85C33 계열 리터럴을 남기지 않는다.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { describeUnifiedListStatus, isSameLoadQuery, queryKeyFromUrl } from "@/components/admin/crm/CrmUnifiedCustomersClient"

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

  it("백그라운드 재검증 실패도 경고로 올리고, 같은 질의 실패라면 화면의 이전 결과를 지우지 않는다", () => {
    expect(clientSource).toContain("error: revalidateError")
    expect(clientSource).toContain("failRefresh(revalidateError)")
    expect(clientSource).toContain("if (hasDataRef.current && isSameLoadQuery(lastLoadedQueryKeyRef.current, url)) {")
    expect(clientSource).toContain("갱신 실패 — 이전 결과 표시 중")
  })

  it("다른 질의(검색어·필터 변경)의 실패는 조회 실패로 보내고 무관한 이전 결과를 비운다", () => {
    expect(clientSource).toContain("setData(null)")
    expect(clientSource).toContain("hasDataRef.current = false")
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

  it("재시도는 force 로 나가고, 강제 재조회 버튼은 신선도 캡션 하나뿐이다(요청·재검증 중 비활성)", () => {
    expect(clientSource).toContain("{ force: true, append: refreshFailure.retryAppend }")
    // P2: 헤더의 별도 새로고침 버튼은 걷어내고 FreshnessCaption 의 onRefresh 로 모았다.
    expect(clientSource).toContain("onRefresh={() => void loadPage(0, { force: true })}")
    expect(clientSource).toContain("refreshing={refreshing || revalidating}")
    expect(clientSource).toContain('staleReason={refreshFailure ? "error" : null}')
    expect(clientSource).not.toContain("RefreshCw")
  })

  it("성공/실패 announce가 겹치지 않도록 상시 live region은 하나만 마운트한다 (2026-09-12 리뷰 #3)", () => {
    const statusRegions = clientSource.match(/<div className="sr-only" role=/g) ?? []
    expect(statusRegions.length).toBe(1)
    expect(clientSource).not.toContain('role="alert" aria-atomic="true">')
  })
})

describe("describeUnifiedListStatus — sr-only 진행 상태 라이브 리전 (2026-09-12 리뷰 #1)", () => {
  const base = {
    refreshing: false,
    loadingMore: false,
    loading: false,
    error: null as string | null,
    refreshFailure: null as unknown,
    totalCount: null as number | null,
  }

  it("진행 중 상태가 완료 문구보다 우선한다", () => {
    expect(describeUnifiedListStatus({ ...base, refreshing: true, totalCount: 120 })).toBe(
      "통합 고객 목록을 새로고치는 중입니다."
    )
    expect(describeUnifiedListStatus({ ...base, loadingMore: true, totalCount: 120 })).toBe(
      "다음 고객 목록을 불러오는 중입니다."
    )
    expect(describeUnifiedListStatus({ ...base, loading: true, totalCount: 120 })).toBe(
      "통합 고객 목록을 불러오는 중입니다."
    )
  })

  it("정상 완료 시에만 결과 건수를 읽는다", () => {
    expect(describeUnifiedListStatus({ ...base, totalCount: 42 })).toBe("통합 고객 42명 결과를 불러왔습니다.")
    expect(describeUnifiedListStatus({ ...base, totalCount: null })).toBe("")
  })

  it("갱신 실패(refreshFailure) 중에는 성공 문구를 읽지 않는다 — 회귀했던 버그", () => {
    // 새로고침 실패 후: refreshing/loadingMore/loading 모두 false로 리셋되고 이전 데이터(totalCount)는
    // 화면에 남지만, refreshFailure가 켜져 있으므로 "N명 결과를 불러왔습니다"를 내면 안 된다.
    expect(
      describeUnifiedListStatus({ ...base, refreshFailure: { message: "네트워크 오류" }, totalCount: 50 })
    ).toBe("")
  })

  it("조회 실패(error) 중에도 성공 문구를 읽지 않는다", () => {
    expect(describeUnifiedListStatus({ ...base, error: "네트워크 오류", totalCount: 50 })).toBe("")
  })
})

describe("queryKeyFromUrl · isSameLoadQuery — 필터 변경 vs 페이지/새로고침 재요청 구분 (2026-09-12 리뷰 #2)", () => {
  it("offset만 다른 재요청은 같은 질의로 본다 (다음 페이지·새로고침 재시도)", () => {
    const first = "/api/admin/crm/customers/unified?limit=50&offset=0&q=%EA%B9%80%EC%B2%A0%EC%88%98"
    const nextPage = "/api/admin/crm/customers/unified?limit=50&offset=50&q=%EA%B9%80%EC%B2%A0%EC%88%98"
    expect(queryKeyFromUrl(first)).toBe(queryKeyFromUrl(nextPage))
    expect(isSameLoadQuery(queryKeyFromUrl(first), nextPage)).toBe(true)
  })

  it("검색어·필터가 바뀐 재요청은 다른 질의로 본다", () => {
    const noFilter = "/api/admin/crm/customers/unified?limit=50&offset=0"
    const searched = "/api/admin/crm/customers/unified?limit=50&offset=0&q=%EA%B9%80%EC%B2%A0%EC%88%98"
    expect(queryKeyFromUrl(noFilter)).not.toBe(queryKeyFromUrl(searched))
    expect(isSameLoadQuery(queryKeyFromUrl(noFilter), searched)).toBe(false)
  })

  it("아직 아무 질의도 성공한 적이 없으면(null) 항상 다른 질의로 본다", () => {
    expect(isSameLoadQuery(null, "/api/admin/crm/customers/unified?limit=50&offset=0")).toBe(false)
  })

  it("담당자·라벨·미확인 포함 토글이 바뀌어도 다른 질의로 본다", () => {
    const ownerA = "/api/admin/crm/customers/unified?limit=50&offset=0&owner=%EC%B2%A0%EC%88%98"
    const ownerB = "/api/admin/crm/customers/unified?limit=50&offset=0&owner=%EC%98%81%ED%9D%AC"
    expect(isSameLoadQuery(queryKeyFromUrl(ownerA), ownerB)).toBe(false)
  })
})

describe("crm-unified-customers 통화 라벨 계약 (unified-08)", () => {
  it("전환 고객 계약·미수 라벨은 ₩ 기호를 포함하고 '원' 접미사를 쓰지 않는다", () => {
    expect(repositorySource).toContain('return `₩${Math.round(amount).toLocaleString("ko-KR")}`')
    expect(repositorySource).not.toContain('toLocaleString("ko-KR")}원`')
  })
})
