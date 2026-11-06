import { existsSync, readFileSync } from "node:fs"

import sharp from "sharp"
import { describe, expect, it } from "vitest"

import { color } from "@/lib/design-tokens"
import { OG_IMAGE_SIZE, loadOgFonts, loadOgLogo, renderHomeOgImage, renderTitleOgImage } from "@/lib/og/template"

const FONT_DIR = "assets/fonts/pretendard-static"
const LOGO_FILE = "assets/og/classin-lockup-ink.png"

async function decode(response: Response) {
  expect(response.headers.get("content-type")).toBe("image/png")
  const png = Buffer.from(await response.arrayBuffer())
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, info }
}

/** 초록이 도드라진 픽셀 수(G 가 R·B 보다 확연히 큰 픽셀) */
function greenPixels(data: Buffer) {
  let count = 0
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
    if (g > r + 24 && g > b + 24) count++
  }
  return count
}

describe("share card (OG) assets", () => {
  it("ships the Pretendard 400·700 OTFs with their licence and loads them once", async () => {
    for (const file of ["Pretendard-Regular.otf", "Pretendard-Bold.otf", "OFL.txt"]) {
      expect(existsSync(`${FONT_DIR}/${file}`)).toBe(true)
    }
    const fonts = await loadOgFonts()
    expect(fonts.map((font) => [font.name, font.weight])).toEqual([
      ["Pretendard", 400],
      ["Pretendard", 700],
    ])
    expect(await loadOgFonts()).toBe(fonts)
  })

  it("uses the official lockup filled with ink only (shape from the raster, colour from color.ink)", async () => {
    const logo = await loadOgLogo()
    expect(logo.src.startsWith("data:image/png;base64,")).toBe(true)
    expect([logo.width, logo.height]).toEqual([797, 524])
    expect(await loadOgLogo()).toBe(logo)

    const { data } = await sharp(LOGO_FILE).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const ink = color.ink.match(/[0-9a-f]{2}/gi)!.map((hex) => parseInt(hex, 16))
    let opaque = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue
      opaque++
      expect([data[i], data[i + 1], data[i + 2]]).toEqual(ink)
    }
    expect(opaque).toBeGreaterThan(10_000)
  })
})

describe("share card (OG) rendering", () => {
  it("home card is a 1200×630 PNG with the logo and no green at all", async () => {
    const { data, info } = await decode(await renderHomeOgImage())
    expect([info.width, info.height]).toEqual([OG_IMAGE_SIZE.width, OG_IMAGE_SIZE.height])
    expect(greenPixels(data)).toBe(0)

    // 로고가 실제로 그려졌다: 가운데 영역에 먹 픽셀이 충분하다
    let dark = 0
    for (let y = 200; y < 420; y++) {
      for (let x = 420; x < 780; x++) {
        const i = (y * info.width + x) * 4
        if (data[i] < 60 && data[i + 1] < 60 && data[i + 2] < 60) dark++
      }
    }
    expect(dark).toBeGreaterThan(5_000)
  }, 30_000)

  it("blog card renders the title plate with no green and nothing outside the 96px side margins", async () => {
    const { data, info } = await decode(
      await renderTitleOgImage({
        kicker: "운영 노하우",
        title: "학원수업녹화강사동의부터보관기간까지처음도입할때정해야할일곱가지운영기준총정리",
      })
    )
    expect([info.width, info.height]).toEqual([OG_IMAGE_SIZE.width, OG_IMAGE_SIZE.height])
    expect(greenPixels(data)).toBe(0)

    // 제목 글자(먹)는 좌우 96px 안쪽에만 있다 — 띄어쓰기 없는 긴 제목도 넘치지 않는다
    for (let y = 120; y < 520; y++) {
      for (const x of [...Array(96).keys(), ...Array.from({ length: 96 }, (_, k) => info.width - 96 + k)]) {
        const i = (y * info.width + x) * 4
        expect(data[i] < 60 && data[i + 1] < 60 && data[i + 2] < 60).toBe(false)
      }
    }
  }, 30_000)
})

describe("share card (OG) wiring", () => {
  it("describes the home card as the logo", () => {
    expect(readFileSync("app/opengraph-image.tsx", "utf8")).toContain('export const alt = "클래스인 Classin 로고"')
  })

  it("bundles the font and logo files into the runtime blog OG function", () => {
    const config = readFileSync("next.config.ts", "utf8")
    expect(config).toContain('"/api/og/**": ["./assets/fonts/pretendard-static/**", "./assets/og/**"]')
  })

  it("does not fall back to the unbundled sans-serif, green accents or inline letter spacing", () => {
    for (const file of ["lib/og/template.tsx", "app/opengraph-image.tsx", "app/api/og/blog/[slug]/route.tsx"]) {
      const source = readFileSync(file, "utf8")
      expect(source).not.toContain('fontFamily: "sans-serif"')
      expect(source).not.toMatch(/letterSpacing|color\.accent|#ECFDF5/)
    }
  })
})

describe("share card URL", () => {
  it("versions the default og:image / twitter:image URL so Kakao and Facebook refetch a changed card", async () => {
    const { OG_IMAGE_VERSION, createPublicMetadata } = await import("@/lib/seo")
    const metadata = createPublicMetadata({ description: "설명", path: "/pricing" })
    const og = metadata.openGraph?.images as Array<{ url: string }>
    expect(og[0].url).toBe(`https://classin.co.kr/opengraph-image?v=${OG_IMAGE_VERSION}`)
    expect(metadata.twitter?.images).toEqual([`https://classin.co.kr/twitter-image?v=${OG_IMAGE_VERSION}`])
  })
})
