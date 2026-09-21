import { describe, expect, it } from "vitest"

import {
  STATUS_TONE,
  STATUS_TONE_BG_CLASS,
  STATUS_TONE_BORDER_CLASS,
  STATUS_TONE_CLASS,
  STATUS_TONE_TEXT_CLASS,
  STATUS_TONE_TEXT_STRONG_CLASS,
  type StatusTone,
} from "@/lib/crm/status-tone"

const TONES: StatusTone[] = ["danger", "warning", "ok"]

describe("status-tone SSOT", () => {
  it("matches DESIGN.md 운영 상태 스케일 literals (Account360Lens 정본)", () => {
    expect(STATUS_TONE.danger).toEqual({ text: "#B43E3E", textStrong: "#8F2C2C", bg: "#FCE9E9", border: "#F2B8B8" })
    expect(STATUS_TONE.warning).toEqual({ text: "#A8741A", textStrong: "#7A520F", bg: "#FBF1E0", border: "#ECD29C" })
    expect(STATUS_TONE.ok).toMatchObject({ text: "#084734", bg: "#ECFDF5", border: "#BDEFD8" })
  })

  it("keeps every class map in sync with the hex tokens (no drift between style and className)", () => {
    for (const tone of TONES) {
      const t = STATUS_TONE[tone]
      expect(STATUS_TONE_CLASS[tone]).toBe(`text-[${t.text}] bg-[${t.bg}] border-[${t.border}]`)
      expect(STATUS_TONE_TEXT_CLASS[tone]).toBe(`text-[${t.text}]`)
      expect(STATUS_TONE_TEXT_STRONG_CLASS[tone]).toBe(`text-[${t.textStrong}]`)
      expect(STATUS_TONE_BORDER_CLASS[tone]).toBe(`border-[${t.border}]`)
      expect(STATUS_TONE_BG_CLASS[tone]).toBe(`bg-[${t.bg}]`)
    }
  })

  it("never carries the retired #B85C33 literal", () => {
    expect(JSON.stringify({ STATUS_TONE, STATUS_TONE_CLASS })).not.toContain("#B85C33")
  })
})
