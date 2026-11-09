// app/api/admin/lead-magnets/pdf-preview/route.ts — 저장 전 초안 PDF 미리보기(관리자 전용).
// 계약: POST { leadMagnet } → application/pdf inline. 잘못된 본문 400, 큰 본문 413.
import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const { verifyAdmin, getAllLeadMagnets, renderLeadMagnetPdf } = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  getAllLeadMagnets: vi.fn(),
  renderLeadMagnetPdf: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({ verifyAdmin }))
vi.mock("@/lib/repositories/lead-magnets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/repositories/lead-magnets")>()),
  getAllLeadMagnets,
}))
vi.mock("@/lib/lead-magnet-pdf/render", () => ({ renderLeadMagnetPdf }))
vi.mock("@/lib/seo", () => ({ SITE_URL: "https://classin.co.kr" }))

import { POST } from "@/app/api/admin/lead-magnets/pdf-preview/route"

const URL_ = "https://classin.co.kr/api/admin/lead-magnets/pdf-preview"

function post(body: string, headers: Record<string, string> = {}) {
  return new NextRequest(URL_, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  })
}

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe("POST /api/admin/lead-magnets/pdf-preview", () => {
  it("관리자 인증이 첫 단계다 — 실패 응답을 그대로 돌려주고 본문을 읽지 않는다", async () => {
    verifyAdmin.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    const req = post(JSON.stringify({ leadMagnet: { title: "초안" } }))
    const text = vi.spyOn(req, "text")

    const response = await POST(req)

    expect(response.status).toBe(401)
    expect(verifyAdmin).toHaveBeenCalledWith(req)
    expect(text).not.toHaveBeenCalled()
    expect(renderLeadMagnetPdf).not.toHaveBeenCalled()
  })

  it("교차 출처 거부(verifyAdmin 의 403)도 그대로 돌려준다", async () => {
    verifyAdmin.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }))
    const response = await POST(post("{}", { origin: "https://evil.example" }))
    expect(response.status).toBe(403)
    expect(renderLeadMagnetPdf).not.toHaveBeenCalled()
  })

  it.each([
    ["깨진 JSON", "{not json"],
    ["leadMagnet 없음", JSON.stringify({ title: "x" })],
    ["leadMagnet 배열", JSON.stringify({ leadMagnet: [] })],
    ["leadMagnet 문자열", JSON.stringify({ leadMagnet: "x" })],
    ["본문이 배열", JSON.stringify([{ leadMagnet: {} }])],
    ["빈 본문", ""],
  ])("%s → 400 (500 아님)", async (_label, body) => {
    verifyAdmin.mockResolvedValue(undefined)
    const response = await POST(post(body))
    expect(response.status).toBe(400)
    expect(renderLeadMagnetPdf).not.toHaveBeenCalled()
  })

  it("큰 본문은 413", async () => {
    verifyAdmin.mockResolvedValue(undefined)
    const huge = JSON.stringify({ leadMagnet: { title: "x", summary: "가".repeat(200_000) } })
    expect((await POST(post(huge))).status).toBe(413)
    expect((await POST(post("{}", { "content-length": String(10 * 1024 * 1024) }))).status).toBe(413)
    expect(renderLeadMagnetPdf).not.toHaveBeenCalled()
  })

  it("초안을 normalizeLeadMagnet 으로 정규화해 그리고 저장하지 않는 PDF 로 돌려준다", async () => {
    verifyAdmin.mockResolvedValue(undefined)
    const stored = [{ slug: "related-a", title: "관련", published: true }]
    getAllLeadMagnets.mockResolvedValue(stored)
    renderLeadMagnetPdf.mockResolvedValue(new TextEncoder().encode("%PDF-preview"))

    const response = await POST(post(JSON.stringify({ leadMagnet: { title: "  새 초안  ", slug: "Draft Slug!", sections: "bad" } })))

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("application/pdf")
    expect(response.headers.get("content-disposition")).toBe('inline; filename="draft-slug.pdf"')
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    const [draft, options] = renderLeadMagnetPdf.mock.calls[0]
    expect(draft).toMatchObject({ slug: "draft-slug", title: "새 초안", status: "draft", sections: [] })
    expect(options.siteUrl).toBe("https://classin.co.kr")
    expect(options.magnetsBySlug.get("related-a")).toBe(stored[0])
  })

  it("목록 읽기가 실패해도 미리보기는 그린다(관련 자료 링크만 빠진다)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    verifyAdmin.mockResolvedValue(undefined)
    getAllLeadMagnets.mockRejectedValue(new Error("supabase down"))
    renderLeadMagnetPdf.mockResolvedValue(new TextEncoder().encode("%PDF-"))

    const response = await POST(post(JSON.stringify({ leadMagnet: { title: "초안" } })))

    expect(response.status).toBe(200)
    expect(renderLeadMagnetPdf.mock.calls[0][1].magnetsBySlug.size).toBe(0)
  })

  it("렌더 실패는 500 JSON", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    verifyAdmin.mockResolvedValue(undefined)
    getAllLeadMagnets.mockResolvedValue([])
    renderLeadMagnetPdf.mockRejectedValue(new Error("boom"))

    const response = await POST(post(JSON.stringify({ leadMagnet: { title: "초안" } })))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "PDF 미리보기를 만들지 못했습니다." })
  })
})
