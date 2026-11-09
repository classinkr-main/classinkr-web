import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// 서버 렌더라 effect(성과·블로그 요청)는 돌지 않는다 — 첫 화면의 뼈대·패널·미리보기 편집 칸을 본다.
vi.mock("@/lib/admin-client", () => ({
  adminFetch: vi.fn(),
  adminFetchJson: vi.fn(),
  adminFetchJsonCached: vi.fn(() => new Promise(() => undefined)),
}))

import LeadMagnetsAdminClient from "@/components/admin/LeadMagnetsAdminClient"
import { leadMagnets } from "@/lib/lead-magnets"

const supabase = { source: "supabase" as const, writable: true, reason: "ready" as const }

describe("자료 퍼널 workspace (A안 확정)", () => {
  it("shows totals, the to-do strip, the table and the preview-edit panel for the first magnet", () => {
    const magnets = leadMagnets.slice(0, 3)
    const html = renderToStaticMarkup(<LeadMagnetsAdminClient initialLeadMagnets={magnets} initialStorage={supabase} />)

    expect(html).toContain(">자료 퍼널</h1>")
    expect(html).toContain('aria-label="자료 퍼널 합계"')
    expect(html).toContain("이번 주 손볼 곳")
    for (const magnet of magnets) expect(html).toContain(magnet.title)
    // 오른쪽 패널: 편집 탭이 먼저, 블로그 신청 상자 모양 그대로 고칠 수 있는 칸
    expect(html).toMatch(/aria-pressed="true"[^>]*>편집/)
    expect(html).toContain('aria-label="블로그 신청 상자 미리보기"')
    expect(html).toContain(`aria-label="상자 제목"`)
    expect(html).toContain(magnets[0].ctaCopy.buttonLabel)
    expect(html).toContain("전체 편집")
    // 전체 편집은 닫혀 있다
    expect(html).not.toContain('role="dialog"')
    // 저장소가 운영 DB 면 저장소 안내 띠가 없다
    expect(html).not.toContain("읽기 전용 폴백")
  })

  it("never offers editing for fixed public copy (form fields and buttons)", () => {
    const html = renderToStaticMarkup(<LeadMagnetsAdminClient initialLeadMagnets={leadMagnets.slice(0, 1)} initialStorage={supabase} />)
    expect(html).toContain("이메일을 입력해주세요")
    expect(html).not.toMatch(/<input[^>]*value="이메일을 입력해주세요"/)
  })
})
