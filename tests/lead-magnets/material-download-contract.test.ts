// 자료 다운로드 끝단 계약(#81 × 런타임 PDF) — 공개된 자료 전부가 「그 자리에서 내려받기」로 끝나고,
// 따로 만든 PDF(#81 워크북)는 정적 파일 그대로 나간다.
//
// cloud_10.4 가 #81 위에 글자 충돌 없이 얹혔을 때 둘 다 조용히 깨졌다:
//  (a) 생성본 경로가 확장자 없는 /api/materials/<slug>/pdf 로 바뀌어 deliverMaterialDownload 가 페이지 이동을 하고,
//      라우트는 inline 이라 Chrome 뷰어 탭이 다시 열렸다.
//  (b) 12쪽 워크북(academy-system-checklist)이 서버 생성본(pdf-lib)으로 바뀌었다.
// 이 파일은 lib/materials.ts(목적지) → lib/materials-client.ts(전달 방식) → 라우트·next.config 헤더를 한 줄로 잇는다.
import { readFileSync } from "node:fs"
import path from "node:path"

import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { getLeadMagnetBySlugFromStore, getAllLeadMagnets, renderLeadMagnetPdf } = vi.hoisted(() => ({
  getLeadMagnetBySlugFromStore: vi.fn(),
  getAllLeadMagnets: vi.fn(),
  renderLeadMagnetPdf: vi.fn(),
}))

vi.mock("@/lib/repositories/lead-magnets", () => ({ getLeadMagnetBySlugFromStore, getAllLeadMagnets }))
vi.mock("@/lib/identity/stitch", () => ({ stitchIdentity: async () => undefined }))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({ insert: async () => ({ error: null }) }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: { message: "not used" } }) }) },
  }),
}))
vi.mock("@/lib/lead-magnet-pdf/render", () => ({ renderLeadMagnetPdf }))
vi.mock("@/lib/seo", () => ({ SITE_URL: "https://classin.co.kr" }))
vi.mock("@/lib/server/rate-limit", () => ({
  checkRateLimitDistributed: async () => ({ allowed: true, remaining: 1, resetAt: 0 }),
  getClientIp: () => "203.0.113.7",
}))

import { GET as getPdf } from "@/app/api/materials/[slug]/pdf/route"
import {
  isHandcraftedLeadMagnetPdf,
  isLeadMagnetPdfRoutePathname,
  legacyLeadMagnetPdfPath,
  materialDownloadBaseName,
} from "@/lib/lead-magnet-pdf/links"
import { WORKBOOK_SLUGS } from "@/lib/lead-magnet-pdf/workbook-slugs.mjs"
import { prepareMaterialDownload } from "@/lib/materials"
import { deliverMaterialDownload, isMaterialFileUrl } from "@/lib/materials-client"
import nextConfig from "@/next.config"

const ORIGIN = "https://classin.co.kr"

type Magnet = { slug: string; title: string; published?: boolean; resourceUrl?: string; storagePath?: string; gate?: string }

const magnets = (JSON.parse(readFileSync(path.join(process.cwd(), "data", "lead-magnets.json"), "utf8")) as Magnet[]).filter(
  (magnet) => magnet.published !== false && !magnet.storagePath?.trim() && magnet.resourceUrl?.trim().endsWith(".pdf")
)

async function destinationOf(magnet: Magnet) {
  getLeadMagnetBySlugFromStore.mockResolvedValue({ gate: "open", storagePath: "", ...magnet, published: true })
  const result = await prepareMaterialDownload({ slug: magnet.slug })
  return { url: result!.destinationUrl, signed: result!.signed }
}

/** deliverMaterialDownload 를 브라우저 없이 돌린다 — 자료 페이지(/resources/<slug>)에서 누른 것처럼. */
function deliverOnResourcePage(result: { url: string; signed: boolean }, slug: string, title: string) {
  const assign = vi.fn()
  const anchor = { href: "", download: "", rel: "", style: {} as Record<string, string>, click: vi.fn(), remove: vi.fn() }
  vi.stubGlobal("window", { location: { origin: ORIGIN, pathname: `/resources/${slug}`, assign } })
  vi.stubGlobal("document", { createElement: () => anchor, body: { appendChild: vi.fn() } })
  const outcome = deliverMaterialDownload(result, title)
  return { outcome, assign, anchor }
}

async function materialsAttachmentHeader() {
  const rules = (await nextConfig.headers?.()) ?? []
  const rule = rules.find((entry) => entry.source === "/materials/:path*")
  return rule?.headers.find((header) => header.key.toLowerCase() === "content-disposition")?.value
}

beforeEach(() => {
  renderLeadMagnetPdf.mockResolvedValue(new TextEncoder().encode("%PDF-1.7 test"))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("자료 다운로드 끝단 계약", () => {
  it("검사할 공개 PDF 자료가 있다(생성본·워크북 둘 다)", () => {
    expect(magnets.length).toBeGreaterThan(10)
    expect(magnets.some((magnet) => isHandcraftedLeadMagnetPdf(magnet.slug))).toBe(true)
    expect(magnets.some((magnet) => !isHandcraftedLeadMagnetPdf(magnet.slug))).toBe(true)
    for (const slug of WORKBOOK_SLUGS) expect(magnets.map((magnet) => magnet.slug)).toContain(slug)
  })

  it.each(magnets.map((magnet) => [magnet.slug, magnet] as const))(
    "%s: 목적지는 파일이고, 자료 페이지를 떠나지 않고 제목 이름으로 내려받는다",
    async (slug, magnet) => {
      const destination = await destinationOf(magnet)

      expect(isMaterialFileUrl(destination.url, destination.signed, ORIGIN), destination.url).toBe(true)

      const { outcome, assign, anchor } = deliverOnResourcePage(destination, slug, magnet.title)
      expect(outcome).toBe("downloaded")
      expect(assign).not.toHaveBeenCalled()
      expect(anchor.click).toHaveBeenCalledTimes(1)
      expect(anchor.download).toBe(`${materialDownloadBaseName(magnet.title)}.pdf`)
      expect(anchor.download).not.toBe(`${slug}.pdf`)
    }
  )

  it.each(magnets.map((magnet) => [magnet.slug, magnet] as const))(
    "%s: 그 주소의 응답은 내려받기(attachment)다 — 뷰어 탭으로 열리지 않는다",
    async (slug, magnet) => {
      const destination = await destinationOf(magnet)
      const pathname = new URL(destination.url, ORIGIN).pathname

      if (isHandcraftedLeadMagnetPdf(slug)) {
        // 따로 만든 PDF 는 정적 파일 그대로(#81 워크북 포함) — 서버 생성본으로 바꾸지 않는다.
        expect(destination.url).toBe(legacyLeadMagnetPdfPath(slug))
      }

      if (isLeadMagnetPdfRoutePathname(pathname)) {
        getAllLeadMagnets.mockResolvedValue([{ ...magnet, published: true }])
        const response = await getPdf(new NextRequest(new URL(destination.url, ORIGIN)), {
          params: Promise.resolve({ slug: encodeURIComponent(slug) }),
        })
        expect(response.status).toBe(200)
        const disposition = response.headers.get("content-disposition") ?? ""
        expect(disposition).toMatch(/^attachment; /)
        // 브라우저는 이 헤더의 이름을 <a download> 보다 앞세운다 — 둘이 같아야 제목 이름으로 저장된다.
        const encoded = disposition.split("filename*=UTF-8''")[1]
        const savedName = encoded ? decodeURIComponent(encoded) : disposition.match(/filename="([^"]+)"/)?.[1]
        expect(savedName).toBe(`${materialDownloadBaseName(magnet.title)}.pdf`)
      } else {
        expect(pathname.startsWith("/materials/")).toBe(true)
        expect(await materialsAttachmentHeader()).toBe("attachment")
      }
    }
  )
})
