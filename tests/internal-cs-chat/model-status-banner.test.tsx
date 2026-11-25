import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

// 저장소에 jsdom 이 없어 서버 렌더 결과로 확인한다(다른 화면 시험과 같은 방식).
import ModelStatusBanner, { describeModelFailure, IncompleteDraftNotice } from "@/components/admin/cs-chat/components/ModelStatusBanner"
import ReviewWarningList from "@/components/admin/cs-chat/components/ReviewWarningList"

describe("ModelStatusBanner", () => {
  it("renders a different role=alert message for quota, auth and timeout", () => {
    const quota = renderToStaticMarkup(<ModelStatusBanner origin="deterministic" failureKinds={["quota"]} />)
    const auth = renderToStaticMarkup(<ModelStatusBanner origin="deterministic" failureKinds={["auth"]} />)
    const timeout = renderToStaticMarkup(<ModelStatusBanner origin="deterministic" failureKinds={["timeout"]} />)
    for (const html of [quota, auth, timeout]) {
      expect(html).toContain('role="alert"')
      expect(html).toContain("AI 연결 실패")
    }
    expect(quota).toContain("사용 한도")
    expect(auth).toContain("키·권한")
    expect(timeout).toContain("제한 시간")
    expect(new Set([quota, auth, timeout]).size).toBe(3)
  })

  it("renders nothing for a successful model answer and still warns for a bare deterministic result", () => {
    expect(renderToStaticMarkup(<ModelStatusBanner origin="model" failureKinds={[]} />)).toBe("")
    expect(renderToStaticMarkup(<ModelStatusBanner />)).toBe("")
    const bare = renderToStaticMarkup(<ModelStatusBanner origin="deterministic" failureKinds={[]} />)
    expect(bare).toContain('role="alert"')
    expect(bare).toContain("AI 답이 아닙니다")
  })

  it("shows the most urgent cause first when several kinds are mixed", () => {
    expect(describeModelFailure(["timeout", "quota"])).toContain("사용 한도")
    expect(describeModelFailure(["bogus"])).toBeNull()
    expect(describeModelFailure(undefined)).toBeNull()
  })
})

describe("IncompleteDraftNotice (R21)", () => {
  it("불완전 초안이면 role=alert 안내를 보이고, 아니면 아무것도 그리지 않는다", () => {
    const html = renderToStaticMarkup(<IncompleteDraftNotice incomplete />)
    expect(html).toContain('role="alert"')
    expect(html).toContain("불완전한 초안")
    expect(describeModelFailure(["incomplete"])).toContain("끝까지 만들어지지 않았습니다")
    expect(renderToStaticMarkup(<IncompleteDraftNotice incomplete={false} />)).toBe("")
    expect(renderToStaticMarkup(<IncompleteDraftNotice />)).toBe("")
  })
})

describe("ReviewWarningList", () => {
  it("lists each warning with its severity and excerpt", () => {
    const html = renderToStaticMarkup(
      <ReviewWarningList
        warnings={[
          { code: "refund_promise", severity: "high", label: "환불을 약속하는 표현이 있습니다.", excerpt: "전액 환불 해드립니다" },
          { code: "amount", severity: "medium", label: "금액이 적혀 있습니다.", excerpt: "" },
        ]}
      />
    )
    expect(html).toContain("검토 경고 2건")
    expect(html).toContain('data-code="refund_promise"')
    expect(html).toContain("꼭 확인")
    expect(html).toContain("전액 환불 해드립니다")
    expect(html).toContain('data-code="amount"')
  })

  it("renders nothing when there are no warnings", () => {
    expect(renderToStaticMarkup(<ReviewWarningList warnings={[]} />)).toBe("")
    expect(renderToStaticMarkup(<ReviewWarningList />)).toBe("")
  })
})
