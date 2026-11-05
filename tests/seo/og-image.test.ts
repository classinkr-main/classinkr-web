import { existsSync, readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"
import { HOME_OG_ALT, HOME_OG_TITLE_LINES } from "@/lib/og/home-card"
import { OG_IMAGE_SIZE, loadOgFonts, renderOgImage } from "@/lib/og/template"

const FONT_DIR = "assets/fonts/pretendard-static"

describe("share card (OG) image", () => {
  it("home card title is the hero headline, broken into exactly two lines", () => {
    expect(HOME_OG_TITLE_LINES).toHaveLength(2)
    expect(HOME_OG_TITLE_LINES.join(" ")).toBe(CLASSIN_POSITIONING.heroHeadline)
    const route = readFileSync("app/opengraph-image.tsx", "utf8")
    expect(route).toContain(`export const alt = "${HOME_OG_ALT}"`)
  })

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

  it("renders a 1200×630 PNG with the embedded Korean font", async () => {
    const response = await renderOgImage({
      section: "블로그",
      kicker: "운영 노하우",
      titleLines: ["학원 운영의 새로운 기준"],
    })
    expect(response.headers.get("content-type")).toBe("image/png")
    const png = Buffer.from(await response.arrayBuffer())
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG")
    expect(png.readUInt32BE(16)).toBe(OG_IMAGE_SIZE.width)
    expect(png.readUInt32BE(20)).toBe(OG_IMAGE_SIZE.height)
  }, 30_000)

  it("bundles the font files into the runtime blog OG function", () => {
    const config = readFileSync("next.config.ts", "utf8")
    expect(config).toMatch(/outputFileTracingIncludes:[\s\S]*"\/api\/og\/\*\*": \["\.\/assets\/fonts\/pretendard-static\/\*\*"\]/)
  })

  it("does not fall back to the unbundled sans-serif or the retired 'C' badge", () => {
    for (const file of ["lib/og/template.tsx", "app/opengraph-image.tsx", "app/api/og/blog/[slug]/route.tsx"]) {
      const source = readFileSync(file, "utf8")
      expect(source).not.toContain('fontFamily: "sans-serif"')
      expect(source).not.toMatch(/letterSpacing|#ECFDF5|>C</)
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
