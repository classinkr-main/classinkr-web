// app/api/materials/[slug]/pdf/route.ts — 공개 자료 PDF 라우트(공개 여부·응답 헤더·정적본 폴백·따로 만든 PDF·호출 상한).
import { readdirSync } from "node:fs"
import path from "node:path"

import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { getAllLeadMagnets, renderLeadMagnetPdf, checkRateLimitDistributed } = vi.hoisted(() => ({
  getAllLeadMagnets: vi.fn(),
  renderLeadMagnetPdf: vi.fn(),
  checkRateLimitDistributed: vi.fn(),
}))

vi.mock("@/lib/repositories/lead-magnets", () => ({ getAllLeadMagnets }))
vi.mock("@/lib/lead-magnet-pdf/render", () => ({ renderLeadMagnetPdf }))
vi.mock("@/lib/seo", () => ({ SITE_URL: "https://classin.co.kr" }))
vi.mock("@/lib/server/rate-limit", () => ({ checkRateLimitDistributed, getClientIp: () => "203.0.113.7" }))

import { GET } from "@/app/api/materials/[slug]/pdf/route"
import { isHandcraftedLeadMagnetPdf } from "@/lib/lead-magnet-pdf/links"
import { WORKBOOK_SLUGS } from "@/lib/lead-magnet-pdf/workbook-slugs.mjs"

// public/ 에 실제로 있는 예전 스크립트 생성본 하나(파일은 지우지 않는다 — 렌더 실패 폴백).
const STATIC_SLUG = readdirSync(path.join(process.cwd(), "public/materials/lead-magnets"))
  .filter((file) => file.endsWith(".pdf"))
  .map((file) => file.replace(/\.pdf$/, ""))
  .find((slug) => !isHandcraftedLeadMagnetPdf(slug))!

function magnet(slug: string, published = true) {
  return { slug, title: `자료 ${slug}`, published }
}

function call(slug: string, search = "") {
  const req = new NextRequest(`https://classin.co.kr/api/materials/${encodeURIComponent(slug)}/pdf${search}`)
  return GET(req, { params: Promise.resolve({ slug: encodeURIComponent(slug) }) })
}

beforeEach(() => {
  checkRateLimitDistributed.mockResolvedValue({ allowed: true, remaining: 29, resetAt: Date.now() + 60_000 })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe("GET /api/materials/[slug]/pdf", () => {
  it("없는 자료는 404 이고 그리지 않는다", async () => {
    getAllLeadMagnets.mockResolvedValue([magnet("other")])
    const response = await call("missing")
    expect(response.status).toBe(404)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(renderLeadMagnetPdf).not.toHaveBeenCalled()
  })

  it("비공개 자료는 404 다", async () => {
    getAllLeadMagnets.mockResolvedValue([magnet("hidden", false)])
    const response = await call("hidden")
    expect(response.status).toBe(404)
    expect(renderLeadMagnetPdf).not.toHaveBeenCalled()
  })

  it("공개 자료는 저장소 내용으로 그려 내려받기(attachment) PDF 로 돌려준다 — 제목 이름으로 저장(#81)", async () => {
    const all = [magnet("open-a"), magnet("open-b")]
    getAllLeadMagnets.mockResolvedValue(all)
    renderLeadMagnetPdf.mockResolvedValue(new TextEncoder().encode("%PDF-1.7 test"))

    const response = await call("open-a")

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("application/pdf")
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="open-a.pdf"; filename*=UTF-8''${encodeURIComponent("자료 open-a.pdf")}`
    )
    expect(response.headers.get("cache-control")).toBe("public, s-maxage=300, stale-while-revalidate=86400")
    expect(Buffer.from(await response.arrayBuffer()).toString("latin1")).toBe("%PDF-1.7 test")
    const [renderedMagnet, options] = renderLeadMagnetPdf.mock.calls[0]
    expect(renderedMagnet).toBe(all[0])
    expect(options.siteUrl).toBe("https://classin.co.kr")
    expect([...options.magnetsBySlug.keys()]).toEqual(["open-a", "open-b"])
  })

  it("어드민 새 탭 보기(?inline=1)만 inline 이다", async () => {
    getAllLeadMagnets.mockResolvedValue([magnet("open-a")])
    renderLeadMagnetPdf.mockResolvedValue(new TextEncoder().encode("%PDF-1.7 test"))

    const viewed = await call("open-a", "?inline=1")
    expect(viewed.headers.get("content-disposition")).toMatch(/^inline; /)

    const other = await call("open-a", "?inline=yes")
    expect(other.headers.get("content-disposition")).toMatch(/^attachment; /)
  })

  it.each(WORKBOOK_SLUGS)("따로 만든 PDF(%s, #81 워크북)는 그리지 않고 정적 파일로 302", async (slug) => {
    getAllLeadMagnets.mockResolvedValue([magnet(slug)])

    const response = await call(slug)

    expect(response.status).toBe(302)
    expect(new URL(response.headers.get("location")!).pathname).toBe(`/materials/lead-magnets/${slug}.pdf`)
    expect(renderLeadMagnetPdf).not.toHaveBeenCalled()
  })

  it("IP 당 호출 상한을 넘으면 429 이고 저장소도 렌더도 부르지 않는다", async () => {
    checkRateLimitDistributed.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 })

    const response = await call("open-a")

    expect(response.status).toBe(429)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(checkRateLimitDistributed).toHaveBeenCalledWith("203.0.113.7", "material-pdf", { windowMs: 60_000, max: 30 })
    expect(getAllLeadMagnets).not.toHaveBeenCalled()
    expect(renderLeadMagnetPdf).not.toHaveBeenCalled()
  })

  it("렌더가 실패하면 public/ 의 예전 생성본으로 302", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    getAllLeadMagnets.mockResolvedValue([magnet(STATIC_SLUG)])
    renderLeadMagnetPdf.mockRejectedValue(new Error("font missing"))

    const response = await call(STATIC_SLUG)

    expect(response.status).toBe(302)
    expect(new URL(response.headers.get("location")!).pathname).toBe(`/materials/lead-magnets/${STATIC_SLUG}.pdf`)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(console.error).toHaveBeenCalled()
  })

  it("렌더가 실패하고 정적본도 없으면 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    getAllLeadMagnets.mockResolvedValue([magnet("brand-new-draft")])
    renderLeadMagnetPdf.mockRejectedValue(new Error("boom"))

    const response = await call("brand-new-draft")
    expect(response.status).toBe(500)
    expect(response.headers.get("location")).toBeNull()
  })

  it("저장소 읽기가 실패하면 정적본이 있을 때만 302, 없으면 503", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    getAllLeadMagnets.mockRejectedValue(new Error("supabase timeout"))

    const fallback = await call(STATIC_SLUG)
    expect(fallback.status).toBe(302)

    const unavailable = await call("brand-new-draft")
    expect(unavailable.status).toBe(503)
    expect(renderLeadMagnetPdf).not.toHaveBeenCalled()
  })

  it("경로 조작 슬러그로 생성본 폴더 밖 PDF 로 보내지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    getAllLeadMagnets.mockRejectedValue(new Error("down"))
    // public/docs/files 에 실제로 있는 PDF 를 노린다 — 슬러그 검사가 없으면 302 로 새 나간다.
    const outside = readdirSync(path.join(process.cwd(), "public/docs/files")).find((file) => file.endsWith(".pdf"))!
    const response = await call(`../../docs/files/${outside.replace(/\.pdf$/, "")}`)
    expect(response.status).toBe(503)
    expect(response.headers.get("location")).toBeNull()
  })
})
