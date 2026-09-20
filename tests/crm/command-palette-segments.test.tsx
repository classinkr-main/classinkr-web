import { describe, expect, it } from "vitest"
import { PhoneCall } from "lucide-react"

import { NAV_CMDS, matchesNavCommand } from "@/components/admin/crm/CrmCommandPalette"
import { LEAD_SEGMENTS, leadSegment, leadSegmentHref, type LeadSegmentId } from "@/lib/crm/lead-segments"

// 2026-09-20 Compass 정리 라운드 S3 — 커맨드 팔레트 세그먼트 이동 명령 4개.
// 렌더 없이(jsdom 미도입 환경) NAV_CMDS 데이터와 검색 매칭 순수 함수만 검증한다.

const SEGMENT_COMMANDS: Array<{ id: LeadSegmentId; label: string }> = [
  { id: "meta_ads", label: "메타 광고 리드 보기" },
  { id: "bd_handover", label: "인계 리드 보기" },
  { id: "existing", label: "기존 리드 보기" },
  { id: "customer", label: "고객(전환) 리드 보기" },
]

describe("CrmCommandPalette 세그먼트 이동 명령", () => {
  it("4개 명령이 모두 존재하고 href·부제가 lead-segments SSOT와 일치한다", () => {
    for (const { id, label } of SEGMENT_COMMANDS) {
      const nav = NAV_CMDS.find((cmd) => cmd.label === label)
      expect(nav, `NAV_CMDS에 "${label}" 명령이 있어야 한다`).toBeTruthy()
      expect(nav?.href).toBe(leadSegmentHref(id))
      expect(nav?.href).toContain(`segment=${id}`)
      // 부제(sub)는 LEAD_SEGMENTS의 hint 그대로 — 사본을 만들지 않는다.
      expect(nav?.sub).toBe(leadSegment(id).hint)
    }
  })

  it("4개 명령 모두 lucide PhoneCall을 재사용한다(새 아이콘·새 색 없음)", () => {
    for (const { label } of SEGMENT_COMMANDS) {
      const nav = NAV_CMDS.find((cmd) => cmd.label === label)
      expect((nav?.icon as { type?: unknown } | undefined)?.type).toBe(PhoneCall)
    }
  })

  it("전체(all)를 제외한 LEAD_SEGMENTS 항목 수만큼 이동 명령이 있다(세그먼트 추가 시 팔레트도 함께 갱신)", () => {
    const nonAllSegments = LEAD_SEGMENTS.filter((segment) => segment.id !== "all")
    expect(SEGMENT_COMMANDS).toHaveLength(nonAllSegments.length)
  })

  it("리드 보드 항목 바로 뒤에 세그먼트 명령 4개가 붙어 있다(기존 항목 순서 보존)", () => {
    const boardIndex = NAV_CMDS.findIndex((cmd) => cmd.label === "리드 보드")
    expect(boardIndex).toBeGreaterThanOrEqual(0)
    const following = NAV_CMDS.slice(boardIndex + 1, boardIndex + 1 + SEGMENT_COMMANDS.length).map((cmd) => cmd.label)
    expect(following).toEqual(SEGMENT_COMMANDS.map((cmd) => cmd.label))
  })

  it("기존 내비 항목(현황 홈 · 통합 고객 · 원천 고객 등)이 그대로 남아 있다", () => {
    for (const label of ["현황 · 홈", "통합 고객", "원천 고객", "매출 대시보드", "인사이트", "매칭 검수", "참석자 입력"]) {
      expect(NAV_CMDS.some((cmd) => cmd.label === label), label).toBe(true)
    }
  })

  it("검색어 '메타'는 메타 광고 리드 보기만 매칭한다", () => {
    const matched = NAV_CMDS.filter((nav) => matchesNavCommand(nav, "메타")).map((n) => n.label)
    expect(matched).toContain("메타 광고 리드 보기")
  })

  it("검색어 '광고'는 메타 광고 리드 보기를 매칭한다", () => {
    const matched = NAV_CMDS.filter((nav) => matchesNavCommand(nav, "광고")).map((n) => n.label)
    expect(matched).toContain("메타 광고 리드 보기")
  })

  it("검색어 '인계'는 인계 리드 보기를 매칭한다", () => {
    const matched = NAV_CMDS.filter((nav) => matchesNavCommand(nav, "인계")).map((n) => n.label)
    expect(matched).toContain("인계 리드 보기")
  })

  it("검색어 'BD'(대소문자 무관)는 인계 리드 보기를 매칭한다", () => {
    const upper = NAV_CMDS.filter((nav) => matchesNavCommand(nav, "BD")).map((n) => n.label)
    const lower = NAV_CMDS.filter((nav) => matchesNavCommand(nav, "bd")).map((n) => n.label)
    expect(upper).toContain("인계 리드 보기")
    expect(lower).toContain("인계 리드 보기")
  })

  it("검색어 '기존'은 기존 리드 보기를 매칭한다", () => {
    const matched = NAV_CMDS.filter((nav) => matchesNavCommand(nav, "기존")).map((n) => n.label)
    expect(matched).toContain("기존 리드 보기")
  })

  it("검색어 '고객'은 고객(전환) 리드 보기를 매칭한다(기존 '통합 고객'과 공존)", () => {
    const matched = NAV_CMDS.filter((nav) => matchesNavCommand(nav, "고객")).map((n) => n.label)
    expect(matched).toContain("고객(전환) 리드 보기")
    expect(matched).toContain("통합 고객")
  })

  it("검색어 '세그먼트'는 세그먼트 이동 명령 4개를 모두 매칭한다", () => {
    const matched = NAV_CMDS.filter((nav) => matchesNavCommand(nav, "세그먼트")).map((n) => n.label)
    for (const { label } of SEGMENT_COMMANDS) {
      expect(matched).toContain(label)
    }
  })

  it("빈 검색어는 모든 내비 명령을 그대로 반환한다(필터링 부작용 없음)", () => {
    expect(NAV_CMDS.every((nav) => matchesNavCommand(nav, ""))).toBe(true)
    expect(NAV_CMDS.every((nav) => matchesNavCommand(nav, "   "))).toBe(true)
  })
})
