// app/api/materials/[slug]/pdf/route.ts — 공개 자료 PDF 라우트(공개 여부·응답 헤더·정적본 폴백).
import { readdirSync } from "node:fs"
import path from "node:path"

import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const { getAllLeadMagnets, renderLeadMagnetPdf } = vi.hoisted(() => ({
  getAllLeadMagnets: vi.fn(),
  renderLeadMagnetPdf: vi.fn(),
}))

vi.mock("@/lib/repositories/lead-magnets", () => ({ getAllLeadMagnets }))
vi.mock("@/lib/lead-magnet-pdf/render", () => ({ renderLeadMagnetPdf }))
vi.mock("@/lib/seo", () => ({ SITE_URL: "https://classin.co.kr" }))

import { GET } from "@/app/api/materials/[slug]/pdf/route"

// public/ 에 실제로 있는 예전 생성본 하나(파일은 지우지 않는다 — 렌더 실패 폴백).
const STATIC_SLUG = readdirSync(path.join(process.cwd(), "public/materials/lead-magnets"))
  .find((file) => file.endsWith(".pdf"))!
  .replace(/\.pdf$/, "")

function magnet(slug: string, published = true) {
  return { slug, title: `자료 ${slug}`, published }
}

function call(slug: string) {
  const req = new NextRequest(`https://classin.co.kr/api/materials/${encodeURIComponent(slug)}/pdf`)
  return GET(req, { params: Promise.resolve({ slug: encodeURIComponent(slug) }) })
}

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

  it("공개 자료는 저장소 내용으로 그려 inline PDF 로 돌려준다", async () => {
    const all = [magnet("open-a"), magnet("open-b")]
    getAllLeadMagnets.mockResolvedValue(all)
    renderLeadMagnetPdf.mockResolvedValue(new TextEncoder().encode("%PDF-1.7 test"))

    const response = await call("open-a")

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("application/pdf")
    expect(response.headers.get("content-disposition")).toBe('inline; filename="open-a.pdf"')
    expect(response.headers.get("cache-control")).toBe("public, s-maxage=300, stale-while-revalidate=86400")
    expect(Buffer.from(await response.arrayBuffer()).toString("latin1")).toBe("%PDF-1.7 test")
    const [renderedMagnet, options] = renderLeadMagnetPdf.mock.calls[0]
    expect(renderedMagnet).toBe(all[0])
    expect(options.siteUrl).toBe("https://classin.co.kr")
    expect([...options.magnetsBySlug.keys()]).toEqual(["open-a", "open-b"])
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
