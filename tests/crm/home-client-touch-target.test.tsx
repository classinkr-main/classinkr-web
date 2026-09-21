import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { MOBILE_TOUCH_TARGET_CLASS, SECONDARY_TEXT_CLASS } from "@/components/admin/crm/home/shared"

// home-07·home-03 — CrmHomeClient 루트가 모바일 44px 터치 타깃 유틸을 걸고, 홈 부제·설치·방문
// 부제가 SECONDARY_TEXT_CLASS 를 쓰며, 픽커가 '고객 찾기' 헤더와 aria-labelledby 로 이어진다.
// CrmHomeClient 는 use()·dynamic()·라우터에 묶여 있어 동기 렌더가 불안정하므로
// tests/admin/overview-crm-streaming-suspense.test.ts 와 같은 소스 계약 방식으로 지킨다.

const SOURCE = readFileSync(join(process.cwd(), "components/admin/crm/home/CrmHomeClient.tsx"), "utf8")
const STRIP = readFileSync(join(process.cwd(), "components/admin/crm/CrmCoverageStrip.tsx"), "utf8")

describe("CrmHomeClient 터치 타깃·대비·픽커 라벨 계약", () => {
  it("루트 div 가 MOBILE_TOUCH_TARGET_CLASS 를 건다", () => {
    expect(SOURCE).toContain("<div className={MOBILE_TOUCH_TARGET_CLASS}>")
    expect(MOBILE_TOUCH_TARGET_CLASS).toContain("[&_button]:min-h-11")
  })

  it("홈 부제·설치/방문 부제·커버리지 수치 설명이 /42·/45 알파 대신 SECONDARY_TEXT_CLASS 를 쓴다", () => {
    expect(SOURCE).not.toContain("text-[#1a1a1a]/42")
    expect(SOURCE).not.toContain("text-[#1a1a1a]/45")
    expect(SOURCE).not.toContain("text-[#1a1a1a]/35")
    expect(SOURCE).not.toContain("text-[#1a1a1a]/40")
    expect(SOURCE).toContain("SECONDARY_TEXT_CLASS")
    expect(STRIP).not.toContain("text-[#1a1a1a]/45")
    expect(STRIP).not.toContain("text-[#1a1a1a]/42")
    expect(STRIP).not.toContain("text-[#1a1a1a]/70")
    expect(STRIP).toContain("SECONDARY_TEXT_CLASS")
    expect(SECONDARY_TEXT_CLASS).toBe("text-[#615D59]")
  })

  it("'고객 찾기' 헤더 id 가 픽커 labelledBy 로 전달된다", () => {
    expect(SOURCE).toContain('id={CRM_HOME_CUSTOMER_SEARCH_HEADING_ID}')
    expect(SOURCE).toContain("labelledBy={CRM_HOME_CUSTOMER_SEARCH_HEADING_ID}")
  })
})
