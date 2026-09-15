/**
 * unified-09 — 연락처 복사 버튼의 성공/실패 피드백 계약.
 *
 * 실패(권한 거부·비보안 컨텍스트)는 무음으로 두지 않고 Danger 톤 문구로 드러내며, 성공·실패 모두
 * 항상 마운트된 sr-only role=status 영역으로 스크린리더에 통지한다. DOM 환경이 없어 상태 전이는
 * 순수 헬퍼(contactCopyFeedback)로, 마크업은 정적 렌더로 검증한다.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import CrmContactValue, {
  CONTACT_COPY_FEEDBACK_MS,
  contactCopyFeedback,
} from "@/components/admin/crm/CrmContactValue"
import { INTERACTIVE_TEXT_CLASS, SECONDARY_TEXT_CLASS } from "@/components/admin/crm/home/shared"

describe("CrmContactValue 복사 피드백", () => {
  it("idle 은 문구 없이, copied/failed 는 인라인 문구와 SR 통지를 함께 낸다", () => {
    expect(contactCopyFeedback("idle")).toEqual({ title: "클릭하여 복사", inline: null, announce: "" })
    expect(contactCopyFeedback("copied")).toMatchObject({ title: "복사됨", inline: "복사됨" })
    expect(contactCopyFeedback("copied").announce).toContain("복사했습니다")
    expect(contactCopyFeedback("failed")).toMatchObject({ inline: "복사 실패" })
    expect(contactCopyFeedback("failed").title).toContain("직접 복사")
    expect(contactCopyFeedback("failed").announce).toContain("복사에 실패")
    expect(CONTACT_COPY_FEEDBACK_MS).toBe(1400)
  })

  it("항상 마운트된 sr-only role=status live region 을 가진다 (마운트 시점 통지 유실 방지)", () => {
    const html = renderToStaticMarkup(<CrmContactValue value="01012345678" />)

    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('aria-atomic="true"')
    expect(html).toContain('aria-label="연락처 010-1234-5678 복사"')
    expect(html).toContain('title="클릭하여 복사"')
    // idle: 인라인 피드백 문구 없음.
    expect(html).not.toContain("복사 실패")
    expect(html).not.toContain(">복사됨<")
  })

  it("인터랙티브 글자는 INTERACTIVE_TEXT_CLASS, 빈 값은 SECONDARY_TEXT_CLASS 이상 대비를 쓴다", () => {
    const filled = renderToStaticMarkup(<CrmContactValue value="01012345678" className="mt-0.5" />)
    const empty = renderToStaticMarkup(<CrmContactValue value={null} />)

    expect(filled).toContain(INTERACTIVE_TEXT_CLASS)
    expect(filled).toContain("mt-0.5")
    expect(filled).not.toContain("text-[#1a1a1a]/42")
    expect(empty).toContain(SECONDARY_TEXT_CLASS)
    expect(empty).toContain(">-<")
  })
})
