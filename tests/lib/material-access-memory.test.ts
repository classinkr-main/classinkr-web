import { describe, expect, it } from "vitest"

import {
  MATERIAL_ACCESS_TTL_MS,
  canReuseForLeadRequest,
  hasUnlockedMaterial,
  maskEmail,
  mergeRememberedMaterialAccess,
  parseRememberedMaterialAccess,
} from "@/lib/material-access-memory"

const NOW = Date.UTC(2026, 10, 6)

describe("자료 신청 정보 기억", () => {
  it("첫 신청을 기억하고 같은 자료를 다시 받을 수 있게 한다", () => {
    const memory = mergeRememberedMaterialAccess(
      null,
      { email: " Owner@Academy.KR ", name: " 홍길동 ", org: "클래스인학원", role: "", size: "51-100명" },
      "academy-system-checklist",
      NOW
    )

    expect(memory).toEqual({
      version: 1,
      email: "owner@academy.kr",
      name: "홍길동",
      org: "클래스인학원",
      size: "51-100명",
      unlockedSlugs: ["academy-system-checklist"],
      savedAt: NOW,
    })
    expect(hasUnlockedMaterial(memory, "academy-system-checklist")).toBe(true)
    expect(hasUnlockedMaterial(memory, "showroom-demo-readiness-kit")).toBe(false)
    expect(canReuseForLeadRequest(memory)).toBe(true)
    expect(parseRememberedMaterialAccess(JSON.stringify(memory), NOW)).toEqual(memory)
  })

  it("같은 이메일의 다음 자료는 이름·학원명을 유지한 채 슬러그만 더한다", () => {
    const first = mergeRememberedMaterialAccess(
      null,
      { email: "owner@academy.kr", name: "홍길동", org: "클래스인학원" },
      "academy-system-checklist",
      NOW
    )
    const second = mergeRememberedMaterialAccess(first, { email: "OWNER@academy.kr" }, "showroom-demo-readiness-kit", NOW + 1)

    expect(second?.name).toBe("홍길동")
    expect(second?.org).toBe("클래스인학원")
    expect(second?.unlockedSlugs).toEqual(["academy-system-checklist", "showroom-demo-readiness-kit"])
  })

  it("다른 이메일이면 앞사람의 이름·학원명·받은 자료를 이어 붙이지 않는다", () => {
    const first = mergeRememberedMaterialAccess(
      null,
      { email: "owner@academy.kr", name: "홍길동", org: "클래스인학원" },
      "academy-system-checklist",
      NOW
    )
    const other = mergeRememberedMaterialAccess(first, { email: "teacher@academy.kr" }, "parent-replay-retention-script-kit", NOW)

    expect(other).toEqual({
      version: 1,
      email: "teacher@academy.kr",
      unlockedSlugs: ["parent-replay-retention-script-kit"],
      savedAt: NOW,
    })
    // 블로그 게이트처럼 이메일만 있으면 /api/lead 재신청에는 쓰지 않는다(이름·학원명 필수).
    expect(canReuseForLeadRequest(other)).toBe(false)
  })

  it("잘못된 이메일은 기억하지 않는다", () => {
    expect(mergeRememberedMaterialAccess(null, { email: "not-an-email" }, "a", NOW)).toBeNull()
  })

  it.each([
    null,
    "",
    "broken json",
    "[]",
    JSON.stringify({ version: 2, email: "a@b.kr", unlockedSlugs: [], savedAt: NOW }),
    JSON.stringify({ version: 1, email: "nope", unlockedSlugs: [], savedAt: NOW }),
    JSON.stringify({ version: 1, email: "a@b.kr", unlockedSlugs: [] }),
  ])("형식이 깨진 저장값은 버린다: %s", (raw) => {
    expect(parseRememberedMaterialAccess(raw, NOW)).toBeNull()
  })

  it("180일이 지나면 다시 입력받는다", () => {
    const raw = JSON.stringify({ version: 1, email: "a@b.kr", unlockedSlugs: ["x"], savedAt: NOW })
    expect(parseRememberedMaterialAccess(raw, NOW + MATERIAL_ACCESS_TTL_MS - 1)).not.toBeNull()
    expect(parseRememberedMaterialAccess(raw, NOW + MATERIAL_ACCESS_TTL_MS + 1)).toBeNull()
  })

  it("슬러그 목록은 중복·비문자열을 거르고 최근 100개만 남긴다", () => {
    const raw = JSON.stringify({
      version: 1,
      email: "a@b.kr",
      unlockedSlugs: [null, 3, "", "x", "x", ...Array.from({ length: 120 }, (_, index) => `slug-${index}`)],
      savedAt: NOW,
    })
    const parsed = parseRememberedMaterialAccess(raw, NOW)
    expect(parsed?.unlockedSlugs).toHaveLength(100)
    expect(parsed?.unlockedSlugs.at(-1)).toBe("slug-119")
  })

  it("화면에는 이메일 앞 두 글자만 보인다", () => {
    expect(maskEmail("owner@academy.kr")).toBe("ow***@academy.kr")
    expect(maskEmail("a@b.kr")).toBe("a***@b.kr")
  })
})
