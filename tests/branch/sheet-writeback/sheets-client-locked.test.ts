// 쓰기 단계 구글 오류 분류 — 보호된 칸·범위, 읽기 성공 뒤의 403 은 "시트 잠김"(sheet_locked)이다(F-07).
// 구글이 실제로 돌려주는 문구는 실측하지 못했다(이 저장소는 구글을 부르지 않는다) — 알려진 문구 두 가지를 본다.
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/google", () => ({ sheets: { spreadsheets: {} }, drive: {} }))

import {
  classifyGoogleError,
  classifyGoogleWriteError,
  googleErrorText,
  isProtectedRangeError,
} from "@/lib/branch/sheet-writeback/sheets-client"

const PROTECTED = "You are trying to edit a protected cell or object. Please contact the spreadsheet owner to remove protection if you need to edit."

describe("googleErrorText", () => {
  it("message · response.data.error.message · errors[].message 를 잇는다", () => {
    expect(
      googleErrorText({ message: "a", response: { data: { error: { message: "b" } } }, errors: [{ message: "c" }, { reason: "x" }] }),
    ).toBe("a | b | c")
    expect(googleErrorText(null)).toBe("")
    expect(googleErrorText("raw")).toBe("raw")
  })
})

describe("classifyGoogleWriteError", () => {
  it.each([
    ["403(서비스계정이 뷰어로 내려감)", { code: 403 }],
    ["Error 문구에 보호 칸", Object.assign(new Error(PROTECTED), { code: 400 })],
    ["응답 본문에 보호 칸", { response: { status: 400, data: { error: { message: PROTECTED } } } }],
    ["errors[] 에 보호 범위", { status: 400, errors: [{ message: "Requested range is a protected range" }] }],
  ])("%s → sheet_locked", (_label, error) => {
    expect(classifyGoogleWriteError(error)).toBe("sheet_locked")
  })

  it.each([
    [{ status: 400 }, "sheet_error"],
    [{ status: 401 }, "sheet_permission"],
    [{ status: 500 }, "outcome_unknown"],
    [Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }), "outcome_unknown"],
  ])("%j → %s(그 밖은 지금 분류와 같다)", (error, expected) => {
    expect(classifyGoogleWriteError(error)).toBe(expected)
  })

  it("읽기 단계 분류(classifyGoogleError)는 그대로 — 403 은 공유 끊김(sheet_permission)", () => {
    expect(classifyGoogleError({ code: 403 })).toBe("sheet_permission")
    expect(classifyGoogleError(Object.assign(new Error(PROTECTED), { code: 400 }))).toBe("sheet_error")
    expect(isProtectedRangeError(new Error(PROTECTED))).toBe(true)
    expect(isProtectedRangeError(new Error("Unable to parse range"))).toBe(false)
  })
})
