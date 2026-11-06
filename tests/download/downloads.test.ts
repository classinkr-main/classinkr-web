import { describe, expect, it } from "vitest"
import {
  PRIMARY_DOWNLOADS,
  SECONDARY_DOWNLOADS,
  detectPrimaryOs,
  fileExtension,
  formatFileSize,
  highlightPlatformId,
  isStoreVariant,
  macChipFromArchitecture,
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

describe("iPadOS 데스크톱 UA", () => {
  const ipadDesktopUa = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"

  it("터치 포인트가 2개 이상인 Mac UA 는 iOS 로 본다(.dmg 를 권하지 않는다)", () => {
    expect(detectPrimaryOs(ipadDesktopUa, 5)).toBe("ios")
  })

  it("터치 없는 Mac 은 그대로 mac", () => {
    expect(detectPrimaryOs(ipadDesktopUa, 0)).toBe("mac")
    expect(detectPrimaryOs(ipadDesktopUa)).toBe("mac")
  })
})

describe("설치 파일 표기", () => {
  it("직접 내려받는 파일은 크기(bytes)를 갖고, 스토어 링크는 갖지 않는다", () => {
    for (const v of allVariants) {
      if (isStoreVariant(v)) expect(v.bytes).toBeUndefined()
      else expect(v.bytes).toBeGreaterThan(10 * 1024 * 1024)
    }
  })

  it("확장자는 URL 경로에서 읽고, 스토어는 null", () => {
    const byLabel = (label: string) => allVariants.find((v) => v.label === label)!
    expect(fileExtension(byLabel("다운로드"))).toBe(".exe")
    expect(fileExtension(byLabel("Apple Silicon"))).toBe(".dmg")
    expect(fileExtension(byLabel("x86_64"))).toBe(".deb")
    expect(fileExtension(byLabel("App Store"))).toBeNull()
  })

  it("크기는 1024 단위 MB 정수", () => {
    expect(formatFileSize(271399128)).toBe("259MB")
    expect(formatFileSize(379543611)).toBe("362MB")
  })
})

describe("macChipFromArchitecture", () => {
  it.each([
    ["arm", "apple-silicon"],
    ["x86", "intel"],
    ["", null],
    [undefined, null],
  ] as const)("%s → %s", (arch, expected) => {
    expect(macChipFromArchitecture(arch)).toBe(expected)
  })
})
