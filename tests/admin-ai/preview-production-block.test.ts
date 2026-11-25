import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

// 점검 R16 — 시안(샘플 데이터)은 운영에서 스위치가 "1" 이어도 켜지지 않는다.
const FLAG = "NEXT_PUBLIC_ADMIN_AI_PREVIEW"

async function enabled() {
  vi.resetModules()
  const { isAdminAiPreviewEnabled } = await import("@/lib/admin-ai/preview")
  return isAdminAiPreviewEnabled()
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe("갈매봇 시안 스위치 — 운영 차단", () => {
  it("VERCEL_ENV=production 이면 스위치가 1 이어도 꺼진다", async () => {
    vi.stubEnv(FLAG, "1")
    vi.stubEnv("VERCEL_ENV", "production")
    expect(await enabled()).toBe(false)
  })

  it("브라우저 번들에 구워 넣은 NEXT_PUBLIC_ADMIN_AI_ENV=production 도 막는다(서버·브라우저 판정이 같다)", async () => {
    vi.stubEnv(FLAG, "1")
    vi.stubEnv("VERCEL_ENV", "")
    vi.stubEnv("NEXT_PUBLIC_ADMIN_AI_ENV", "production")
    expect(await enabled()).toBe(false)
  })

  it.each(["preview", "development", ""])("VERCEL_ENV=%j 에서는 스위치를 따른다", async (value) => {
    vi.stubEnv(FLAG, "1")
    vi.stubEnv("VERCEL_ENV", value)
    vi.stubEnv("NEXT_PUBLIC_ADMIN_AI_ENV", value)
    expect(await enabled()).toBe(true)
  })

  it("운영이 아니어도 스위치가 없으면 꺼짐이 기본이다", async () => {
    vi.stubEnv(FLAG, undefined)
    vi.stubEnv("VERCEL_ENV", "preview")
    expect(await enabled()).toBe(false)
  })
})

describe("갈매봇 시안 스위치 — 빌드 설정", () => {
  it("next.config.ts 가 VERCEL_ENV 를 NEXT_PUBLIC_ADMIN_AI_ENV 로 구워 넣는다(지워지면 브라우저 판정만 운영에서 켜진다)", () => {
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8")
    expect(config).toMatch(/NEXT_PUBLIC_ADMIN_AI_ENV\s*:\s*process\.env\.VERCEL_ENV/)
  })
})
