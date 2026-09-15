import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import CrmNoticeBanner from "@/components/admin/crm/CrmNoticeBanner"
import { STATUS_TONE_CLASS } from "@/lib/crm/status-tone"

describe("CrmNoticeBanner", () => {
  it("danger renders role=alert with danger tokens, action and dismiss", () => {
    const html = renderToStaticMarkup(
      <CrmNoticeBanner
        tone="danger"
        title="일부 저장 실패"
        message="3건 중 1건 실패"
        action={{ label: "다시 시도", onClick: () => undefined }}
        onDismiss={() => undefined}
      />
    )
    expect(html).toContain('role="alert"')
    expect(html).not.toContain('aria-live="polite"')
    expect(html).toContain(STATUS_TONE_CLASS.danger)
    expect(html).toContain("일부 저장 실패")
    expect(html).toContain("3건 중 1건 실패")
    expect(html).toContain(">다시 시도</button>")
    expect(html).toContain('aria-label="알림 닫기"')
    expect(html).not.toContain("#B85C33")
  })

  it("non-danger tones render role=status + aria-live=polite and share the ok tokens for info/success", () => {
    const warning = renderToStaticMarkup(<CrmNoticeBanner tone="warning" message="참고" />)
    expect(warning).toContain('role="status"')
    expect(warning).toContain('aria-live="polite"')
    expect(warning).toContain(STATUS_TONE_CLASS.warning)

    const info = renderToStaticMarkup(<CrmNoticeBanner tone="info" message="안내" />)
    const success = renderToStaticMarkup(<CrmNoticeBanner tone="success" message="완료" />)
    expect(info).toContain(STATUS_TONE_CLASS.ok)
    expect(success).toContain(STATUS_TONE_CLASS.ok)
    expect(info).toContain('data-tone="info"')
    expect(success).toContain('data-tone="success"')
  })

  it("pending action is disabled + aria-busy; no buttons when neither action nor onDismiss is given", () => {
    const pending = renderToStaticMarkup(
      <CrmNoticeBanner tone="danger" message="x" action={{ label: "다시 시도", onClick: () => undefined, pending: true }} />
    )
    expect(pending).toMatch(/<button[^>]*disabled=""[^>]*aria-busy="true"|<button[^>]*aria-busy="true"[^>]*disabled=""/)

    const plain = renderToStaticMarkup(<CrmNoticeBanner tone="info" message="x" className="sticky bottom-0" id="n1" />)
    expect(plain).not.toContain("<button")
    expect(plain).toContain("sticky bottom-0")
    expect(plain).toContain('id="n1"')
  })
})
