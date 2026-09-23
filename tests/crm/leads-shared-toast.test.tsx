import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Toast } from "@/components/admin/crm/leads/shared"
import { STATUS_TONE_CLASS } from "@/lib/crm/status-tone"

describe("leads/shared Toast", () => {
  it("keeps the legacy success call shape: role=status, polite, dark fill, no buttons", () => {
    const html = renderToStaticMarkup(<Toast msg="저장했습니다" type="success" />)
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain("bg-[#111110] text-white")
    expect(html).toContain("bottom-6")
    expect(html).not.toContain("<button")
  })

  it("raised moves the toast above the bottom panel", () => {
    expect(renderToStaticMarkup(<Toast msg="x" type="success" raised />)).toContain("bottom-28")
  })

  it("error promotes to role=alert and uses status-tone danger instead of #B85C33", () => {
    const html = renderToStaticMarkup(<Toast msg="실패했습니다" type="error" />)
    expect(html).toContain('role="alert"')
    expect(html).not.toContain('aria-live="polite"')
    expect(html).toContain(STATUS_TONE_CLASS.danger)
    expect(html).not.toContain("#B85C33")
  })

  it("renders optional dismiss and action controls", () => {
    const html = renderToStaticMarkup(
      <Toast
        msg="삭제했습니다"
        type="success"
        onDismiss={() => undefined}
        action={{ label: "되돌리기", onClick: () => undefined }}
      />
    )
    expect(html).toContain('aria-label="알림 닫기"')
    expect(html).toContain(">되돌리기</button>")
  })
})
