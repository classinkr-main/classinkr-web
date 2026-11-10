import { getRedirectUrl, unstable_doesMiddlewareMatch, unstable_getResponseFromNextConfig } from "next/experimental/testing/server"
import { describe, expect, it } from "vitest"

import nextConfig from "@/next.config"
import { config as proxyConfig } from "@/proxy"

// /expo(박람회 키오스크 쇼케이스, public/expo — docs/active/expo-showcase-kr.md)는 사이트 공통 보안 헤더 중 셋을 덮는다:
// 같은 출처 iframe(frame-ancestors·X-Frame-Options), 카메라(Permissions-Policy), WASM(CSP 'wasm-unsafe-eval').
// 덮기는 headers() 규칙 순서(나중 규칙이 같은 키를 이김)에 기대므로, 실제 next.config 를 Next 의 라우팅 로직에 태워 최종 값을 본다.

const ORIGIN = "https://classin.co.kr"

async function responseFor(pathname: string) {
  return unstable_getResponseFromNextConfig({ url: `${ORIGIN}${pathname}`, nextConfig })
}

function directive(csp: string | null, name: string): string[] {
  const part = (csp ?? "").split(";").map((p) => p.trim()).find((p) => p.startsWith(`${name} `))
  return part ? part.split(/\s+/).slice(1) : []
}

describe("/expo 진입 리다이렉트", () => {
  it("/expo 는 /expo/index.html 로 임시 리다이렉트한다", async () => {
    const response = await responseFor("/expo")
    expect(response.status).toBe(307)
    expect(getRedirectUrl(response)).toBe(`${ORIGIN}/expo/index.html`)
  })

  it("쿼리(?install 등)를 보존한다", async () => {
    const response = await responseFor("/expo?install&lang=ko")
    expect(response.status).toBe(307)
    const target = new URL(getRedirectUrl(response) ?? "")
    expect(target.pathname).toBe("/expo/index.html")
    expect(target.searchParams.has("install")).toBe(true)
    expect(target.searchParams.get("lang")).toBe("ko")
  })

  it("리다이렉트 응답은 캐시에 오래 남지 않는다", async () => {
    expect((await responseFor("/expo")).headers.get("cache-control")).toBe("no-cache")
  })

  it("/expo/ 는 끝 슬래시를 지운 뒤 같은 리다이렉트로 이어진다", async () => {
    const response = await responseFor("/expo/")
    expect(response.status).toBe(308)
    expect(getRedirectUrl(response)).toBe(`${ORIGIN}/expo`)
  })

  it("/expo/index.html 자체는 리다이렉트하지 않는다", async () => {
    const response = await responseFor("/expo/index.html")
    expect(getRedirectUrl(response)).toBeNull()
  })
})

describe("/expo 보안 헤더", () => {
  it("같은 출처 iframe 을 허용하고 다른 출처의 액자 넣기는 막는다", async () => {
    const response = await responseFor("/expo/index.html")
    const csp = response.headers.get("content-security-policy")
    expect(directive(csp, "frame-ancestors")).toEqual(["'self'"])
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN")
  })

  it("WASM 은 열되 eval 은 열지 않는다", async () => {
    const csp = (await responseFor("/expo/ai/robot/tracker-worker.js")).headers.get("content-security-policy")
    const scripts = directive(csp, "script-src")
    expect(scripts).toContain("'wasm-unsafe-eval'")
    expect(scripts).not.toContain("'unsafe-eval'")
    expect(directive(csp, "worker-src")).toEqual(["'self'", "blob:"])
  })

  it("외부 출처는 YouTube 개인정보 보호 모드 임베드뿐이다(본사 Firestore·분석 도구 없음)", async () => {
    const csp = (await responseFor("/expo/index.html")).headers.get("content-security-policy") ?? ""
    const hosts = csp.match(/https?:\/\/[^\s;]+/g) ?? []
    expect(hosts).toEqual(["https://www.youtube-nocookie.com"])
    // blob: 은 GLTFLoader 가 모델 속 텍스처를 읽는 데 쓴다(같은 문서가 만든 blob 만 해당)
    expect(directive(csp, "connect-src")).toEqual(["'self'", "blob:"])
    expect(directive(csp, "default-src")).toEqual(["'self'"])
    expect(csp).not.toContain("firestore.googleapis.com")
  })

  it("카메라만 같은 출처에 열고 마이크·위치는 막는다", async () => {
    const policy = (await responseFor("/expo/ai/index.html")).headers.get("permissions-policy") ?? ""
    expect(policy).toContain("camera=(self)")
    expect(policy).toContain("microphone=()")
    expect(policy).toContain("geolocation=()")
    expect(policy).toContain("fullscreen=(self)")
  })

  it("검색에 노출하지 않는다", async () => {
    expect((await responseFor("/expo/index.html")).headers.get("x-robots-tag")).toBe("noindex, nofollow")
  })

  it("공통 보안 헤더(HSTS·nosniff)는 그대로 유지한다", async () => {
    const response = await responseFor("/expo/index.html")
    expect(response.headers.get("strict-transport-security")).toContain("max-age=31536000")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin")
  })

  it("사이트 나머지 페이지의 헤더는 바뀌지 않는다", async () => {
    const response = await responseFor("/about")
    expect(directive(response.headers.get("content-security-policy"), "frame-ancestors")).toEqual(["'none'"])
    expect(response.headers.get("x-frame-options")).toBe("DENY")
    expect(response.headers.get("permissions-policy")).toContain("camera=()")
    expect(response.headers.get("x-robots-tag")).toBeNull()
  })

  it("/expo 로 시작하는 다른 경로(/exposure)에는 예외가 새지 않는다", async () => {
    const response = await responseFor("/exposure")
    expect(response.headers.get("x-frame-options")).toBe("DENY")
  })
})

describe("/expo 캐시", () => {
  it.each([
    "/expo/index.html",
    "/expo/sw.js",
    "/expo/version.json",
    "/expo/manifest.webmanifest",
    "/expo/shell.js",
    "/expo/ai/index.html",
    "/expo/ai/robot/vendor/wasm/vision_wasm_internal.wasm",
    "/expo/editions/kr.json",
    "/expo/i18n/shell/ko.json",
  ])("%s 는 매번 재검증한다", async (pathname) => {
    expect((await responseFor(pathname)).headers.get("cache-control")).toBe("no-cache")
  })

  it.each(["/expo/ai/clips/real_poll.mp4", "/expo/rooms/media/layers/room-3d.glb", "/expo/fonts-i18n/ko-400.woff2"])(
    "%s 같은 정적 미디어는 짧게 캐시하고 immutable 로 두지 않는다",
    async (pathname) => {
      const value = (await responseFor(pathname)).headers.get("cache-control") ?? ""
      expect(value).toMatch(/max-age=86400\b/)
      expect(value).not.toContain("immutable")
    }
  )
})

describe("proxy(미들웨어) 범위", () => {
  it.each(["/expo", "/expo/index.html", "/expo/version.json", "/expo/ai/clips/real_poll.mp4", "/expo/rooms/draco/draco_decoder.wasm"])(
    "%s 는 미들웨어를 타지 않는다",
    (pathname) => {
      expect(unstable_doesMiddlewareMatch({ config: proxyConfig, url: `${ORIGIN}${pathname}` })).toBe(false)
    }
  )

  it.each(["/", "/admin", "/admin/branch", "/blog/some-post", "/exposure", "/api/contact"])(
    "%s 는 그대로 미들웨어를 탄다",
    (pathname) => {
      expect(unstable_doesMiddlewareMatch({ config: proxyConfig, url: `${ORIGIN}${pathname}` })).toBe(true)
    }
  )

  it("정적 자산 제외 규칙은 그대로다", () => {
    expect(unstable_doesMiddlewareMatch({ config: proxyConfig, url: `${ORIGIN}/images/logo.png` })).toBe(false)
    expect(unstable_doesMiddlewareMatch({ config: proxyConfig, url: `${ORIGIN}/_next/static/chunk.js` })).toBe(false)
  })
})
