import { describe, expect, it } from "vitest"

import { extractEmail, extractPhone, parseTabularGrid, parseUnstructuredLines } from "@/lib/crm/capture/parsers"
import { captureTaskDueAt, captureTaskTemplate } from "@/lib/crm/capture/task-templates"

describe("extractPhone / extractEmail", () => {
  it("extracts mobile and landline numbers", () => {
    expect(extractPhone("문의 010-1234-5678 입니다")).toBe("010-1234-5678")
    expect(extractPhone("부산 해운대 A학원 051-000-0000 설치")).toBe("051-000-0000")
    expect(extractPhone("no phone here")).toBeNull()
  })
  it("extracts emails", () => {
    expect(extractEmail("연락 owner@test.co.kr 으로")).toBe("owner@test.co.kr")
    expect(extractEmail("없음")).toBeNull()
  })
})

describe("parseTabularGrid", () => {
  it("auto-detects a tab-delimited header (Excel/Sheets copy)", () => {
    const raw = "기관명\t담당자\t전화\t이메일\n대치스파르타\t김원장\t010-1111-2222\towner@a.com\n해운대A학원\t이실장\t051-333-4444\t"
    const result = parseTabularGrid(raw)
    expect(result.detectedHeader).toBe(true)
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toMatchObject({
      organizationName: "대치스파르타",
      contactName: "김원장",
      phone: "010-1111-2222",
      email: "owner@a.com",
    })
    expect(result.rows[1].phone).toBe("051-333-4444")
  })

  it("falls back to a positional map when there is no header", () => {
    const raw = "대치스파르타\t김원장\t010-1111-2222\towner@a.com"
    const result = parseTabularGrid(raw)
    expect(result.detectedHeader).toBe(false)
    expect(result.rows[0]).toMatchObject({ organizationName: "대치스파르타", contactName: "김원장", phone: "010-1111-2222" })
  })

  it("parses comma-delimited CSV and folds unmapped columns into memo", () => {
    const raw = "기관명,전화,비고없는열\nA학원,010-9999-8888,관심높음"
    const result = parseTabularGrid(raw)
    expect(result.rows[0].organizationName).toBe("A학원")
    expect(result.rows[0].phone).toBe("010-9999-8888")
    expect(result.rows[0].memo).toContain("관심높음")
  })

  it("normalizes a region column", () => {
    const raw = "기관명\t지역\nA학원\t부산 해운대"
    const result = parseTabularGrid(raw)
    expect(result.rows[0].regionLabel).toBeTruthy()
  })
})

describe("parseUnstructuredLines", () => {
  it("splits KakaoTalk/memo lines into row candidates with safe extraction", () => {
    const raw = [
      "김원장 / 대치스파르타 / 행사 참석 / 관심 높음",
      "부산 해운대 A학원 051-000-0000 설치 완료 7일 후 확인",
      "",
      "- owner@test.com 견적 요청",
    ].join("\n")
    const rows = parseUnstructuredLines(raw)
    expect(rows).toHaveLength(3)
    expect(rows[0].memo).toContain("대치스파르타")
    expect(rows[1].phone).toBe("051-000-0000")
    expect(rows[1].organizationName).toBe("A학원")
    expect(rows[1].regionLabel).toBeTruthy()
    expect(rows[2].email).toBe("owner@test.com")
  })

  it("strips KakaoTalk timestamp/sender prefixes", () => {
    const rows = parseUnstructuredLines("[오후 2:14] [김매니저] 대치학원 010-1234-5678 데모 완료")
    expect(rows[0].phone).toBe("010-1234-5678")
    expect(rows[0].rawText.startsWith("[")).toBe(false)
  })
})

describe("captureTaskTemplate", () => {
  it("maps activity types to follow-up templates, memo has none", () => {
    expect(captureTaskTemplate("event_attended")).toMatchObject({ offsetDays: 1 })
    expect(captureTaskTemplate("installation")).toMatchObject({ offsetDays: 7 })
    expect(captureTaskTemplate("memo")).toBeNull()
  })

  it("computes due date from offset, honoring batch override", () => {
    const now = new Date("2026-06-27T00:00:00.000Z")
    expect(captureTaskDueAt("event_attended", now)).toBe("2026-06-28T00:00:00.000Z")
    expect(captureTaskDueAt("event_attended", now, 3)).toBe("2026-06-30T00:00:00.000Z")
    expect(captureTaskDueAt("memo", now)).toBeNull()
  })
})
