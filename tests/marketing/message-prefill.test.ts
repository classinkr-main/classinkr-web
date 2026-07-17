import { describe, it, expect } from "vitest"
import {
  normalizePrefillPhone,
  parseMessagePrefill,
  stripMessagePrefillParams,
} from "@/lib/message-prefill"

describe("message-prefill (캠페인 수신자 프리필 딥링크)", () => {
  it("고객 360 딥링크 형식(인코딩된 번호+이름)을 파싱한다", () => {
    const search = `?message_to=${encodeURIComponent("010-1234-5678")}&message_name=${encodeURIComponent("김원장")}`
    expect(parseMessagePrefill(search)).toEqual({
      phone: "01012345678",
      rawPhone: "010-1234-5678",
      name: "김원장",
    })
  })

  it("이름은 선택 파라미터다", () => {
    expect(parseMessagePrefill("?message_to=01012345678")).toEqual({
      phone: "01012345678",
      rawPhone: "01012345678",
      name: null,
    })
  })

  it("message_to가 없거나 전화번호가 아니면 null", () => {
    expect(parseMessagePrefill("?tab=email")).toBeNull()
    expect(parseMessagePrefill("")).toBeNull()
    expect(parseMessagePrefill("?message_to=&message_name=x")).toBeNull()
    expect(parseMessagePrefill("?message_to=abc&message_name=x")).toBeNull()
    expect(parseMessagePrefill("?message_to=123")).toBeNull()
  })

  it("+82 국가번호·구분자를 국내 숫자 표기로 정규화한다", () => {
    expect(normalizePrefillPhone("+82 10-1234-5678")).toBe("01012345678")
    expect(normalizePrefillPhone("010 1234 5678")).toBe("01012345678")
    expect(normalizePrefillPhone("02-123-4567")).toBe("021234567")
    expect(normalizePrefillPhone("")).toBeNull()
    expect(normalizePrefillPhone("1234567890123")).toBeNull() // 13자리 초과
  })

  it("프리필 파라미터만 제거하고 나머지는 보존한다", () => {
    expect(stripMessagePrefillParams("?tab=email&message_to=01012345678&message_name=n")).toBe(
      "tab=email"
    )
    expect(stripMessagePrefillParams("?message_to=01012345678")).toBe("")
    expect(stripMessagePrefillParams("?tab=email")).toBe("tab=email")
  })
})
