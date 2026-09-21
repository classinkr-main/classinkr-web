/**
 * 통합 고객 "데이터 원천" 상태 타일 색 — customerSourceTone() 팔레트 정리(2026-09-21, CRM 기획 §10 후속).
 *
 * 예전엔 실패 톤이 DESIGN.md 팔레트 밖 `#B85C33`(텍스트)·`#FEF3EE`(배경)·`#F6D5C5`(보더), 정상 보더가
 * `#D7EBDD`였다. 이제 lib/crm/status-tone.ts(운영 상태 스케일 SSOT) 토큰만 조합한다 —
 * 실패=danger, 부분 동기화=warning, 정상=ok. 제목(12px 굵은 글자)은 강조 텍스트색이며
 * 틴트 배경 위 WCAG AA(4.5:1) 대비를 넘는지 실제 값으로 계산해 고정한다.
 */
import { describe, expect, it } from "vitest"

import {
  customerSourceStatusTone,
  customerSourceTone,
} from "@/components/admin/crm/unified/shared"
import {
  STATUS_TONE,
  STATUS_TONE_BG_CLASS,
  STATUS_TONE_BORDER_CLASS,
  STATUS_TONE_TEXT_STRONG_CLASS,
  type StatusTone,
} from "@/lib/crm/status-tone"

const FAILED = { ok: false, partial: false }
const FAILED_PARTIAL = { ok: false, partial: true }
const PARTIAL = { ok: true, partial: true }
const HEALTHY = { ok: true, partial: false }

// WCAG 2.x 상대 휘도·대비율.
function relativeLuminance(hex: string) {
  const channel = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}
function contrastRatio(a: string, b: string) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe("customerSourceStatusTone — 원천 상태 → 운영 상태 스케일", () => {
  it("실패=danger · 부분 동기화=warning · 정상=ok", () => {
    expect(customerSourceStatusTone(FAILED)).toBe("danger")
    expect(customerSourceStatusTone(PARTIAL)).toBe("warning")
    expect(customerSourceStatusTone(HEALTHY)).toBe("ok")
  })

  it("실패가 부분 동기화보다 우선한다(실패한 원천을 주의색으로 낮춰 그리지 않는다)", () => {
    expect(customerSourceStatusTone(FAILED_PARTIAL)).toBe("danger")
  })
})

describe("customerSourceTone — status-tone 토큰만 조합한다", () => {
  const cases: Array<[string, { ok: boolean; partial: boolean }, StatusTone]> = [
    ["실패", FAILED, "danger"],
    ["실패+부분", FAILED_PARTIAL, "danger"],
    ["부분 동기화", PARTIAL, "warning"],
    ["정상", HEALTHY, "ok"],
  ]

  it.each(cases)("%s → 보더·배경은 틴트 토큰, 제목은 강조 텍스트 토큰", (_label, status, tone) => {
    expect(customerSourceTone(status)).toEqual({
      surface: `${STATUS_TONE_BORDER_CLASS[tone]} ${STATUS_TONE_BG_CLASS[tone]}`,
      text: STATUS_TONE_TEXT_STRONG_CLASS[tone],
    })
  })

  it("실제 클래스 값이 DESIGN.md 운영 상태 스케일과 같다", () => {
    expect(customerSourceTone(FAILED)).toEqual({ surface: "border-[#F2B8B8] bg-[#FCE9E9]", text: "text-[#8F2C2C]" })
    expect(customerSourceTone(PARTIAL)).toEqual({ surface: "border-[#ECD29C] bg-[#FBF1E0]", text: "text-[#7A520F]" })
    expect(customerSourceTone(HEALTHY)).toEqual({ surface: "border-[#BDEFD8] bg-[#ECFDF5]", text: "text-[#084734]" })
  })

  it("은퇴한 팔레트 밖 리터럴(#B85C33·#FEF3EE·#F6D5C5·#D7EBDD)을 어느 톤에서도 내지 않는다", () => {
    const all = JSON.stringify([FAILED, FAILED_PARTIAL, PARTIAL, HEALTHY].map(customerSourceTone))
    for (const retired of ["#B85C33", "#FEF3EE", "#F6D5C5", "#D7EBDD"]) {
      expect(all).not.toContain(retired)
    }
  })

  it("제목 텍스트색이 그 타일 배경 위에서 WCAG AA(4.5:1) 대비를 넘는다", () => {
    for (const tone of ["danger", "warning", "ok"] as const) {
      expect(contrastRatio(STATUS_TONE[tone].textStrong, STATUS_TONE[tone].bg)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
