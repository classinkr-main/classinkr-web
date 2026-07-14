import { describe, expect, it } from "vitest"
import {
  PRIMARY_DOWNLOADS,
  SECONDARY_DOWNLOADS,
  detectPrimaryOs,
  highlightPlatformId,
} from "@/lib/downloads"

const allVariants = [...PRIMARY_DOWNLOADS, ...SECONDARY_DOWNLOADS].flatMap((p) => p.variants)

describe("downloads data", () => {
  it("모든 다운로드 URL은 https이며 HubSpot 추적 파라미터가 없다", () => {
    for (const v of allVariants) {
      expect(v.href.startsWith("https://")).toBe(true)
      expect(v.href).not.toContain("__hstc")
      expect(v.href).not.toContain("__hssc")
      expect(v.href).not.toContain("__hsfp")
    }
  })

  it("주요 플랫폼은 windows/mac/mobile 순서를 유지한다", () => {
    expect(PRIMARY_DOWNLOADS.map((p) => p.id)).toEqual(["windows", "mac", "mobile"])
  })

  it("모바일 플랫폼 변형은 matchOs로 ios/android를 구분한다", () => {
    const mobile = PRIMARY_DOWNLOADS.find((p) => p.id === "mobile")!
    expect(mobile.variants.map((v) => v.matchOs)).toEqual(["ios", "android"])
  })
})

describe("detectPrimaryOs", () => {
  it.each([
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "mac"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "ios"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8)", "android"],
    ["totally-unknown-agent", "windows"],
  ] as const)("%s → %s", (ua, expected) => {
    expect(detectPrimaryOs(ua)).toBe(expected)
  })
})

describe("highlightPlatformId", () => {
  it("모바일 OS는 mobile로, 그 외는 자기 자신/windows로 매핑", () => {
    expect(highlightPlatformId("ios")).toBe("mobile")
    expect(highlightPlatformId("android")).toBe("mobile")
    expect(highlightPlatformId("mac")).toBe("mac")
    expect(highlightPlatformId("windows")).toBe("windows")
  })
})
