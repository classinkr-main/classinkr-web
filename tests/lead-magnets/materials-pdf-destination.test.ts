// lib/materials.ts — 예전 스크립트 생성본 경로(resourceUrl)는 그때그때 그리는 PDF 라우트로 보낸다.
// 따로 만든 PDF(#81 워크북 등)는 정적 파일 그대로.
import { afterEach, describe, expect, it, vi } from "vitest"

const { getLeadMagnetBySlugFromStore, stitchIdentity, inserts, createSignedUrl } = vi.hoisted(() => ({
  getLeadMagnetBySlugFromStore: vi.fn(),
  stitchIdentity: vi.fn(async () => undefined),
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://storage.example/signed" }, error: null })),
}))

vi.mock("@/lib/repositories/lead-magnets", () => ({ getLeadMagnetBySlugFromStore }))
vi.mock("@/lib/identity/stitch", () => ({ stitchIdentity }))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => ({
      insert: async (payload: Record<string, unknown>) => {
        inserts.push({ table, payload })
        return { error: null }
      },
    }),
    storage: { from: () => ({ createSignedUrl }) },
  }),
}))

import { prepareMaterialDownload } from "@/lib/materials"

// 파이썬 생성기가 만든 자료(public/ 의 Producer 가 ReportLab) — tests/lead-magnets/pdf-handcrafted.test.ts 가 분류를 지킨다.
const GENERATED = "electronic-whiteboard-classroom-checklist"
// #81 의 12쪽 워크북(WORKBOOK_SLUGS).
const WORKBOOK = "academy-system-checklist"

function magnet(overrides: Record<string, unknown>) {
  return { slug: GENERATED, title: "자료", published: true, gate: "open", storagePath: "", ...overrides }
}

async function destinationFor(overrides: Record<string, unknown>) {
  getLeadMagnetBySlugFromStore.mockResolvedValue(magnet(overrides))
  const result = await prepareMaterialDownload({ slug: String(overrides.slug ?? GENERATED) })
  return result!
}

afterEach(() => {
  vi.clearAllMocks()
  inserts.length = 0
})

describe("prepareMaterialDownload — PDF 목적지", () => {
  it("자기 슬러그의 예전 생성본 경로는 렌더 라우트로 바꾼다", async () => {
    const result = await destinationFor({ resourceUrl: `/materials/lead-magnets/${GENERATED}.pdf` })
    expect(result.destinationUrl).toBe(`/api/materials/${GENERATED}/pdf`)
    expect(result.signed).toBe(false)
    const download = inserts.find((row) => row.table === "material_downloads")
    expect(download?.payload.destination_url).toBe(`/api/materials/${GENERATED}/pdf`)
  })

  it("워크북(따로 만든 PDF)은 정적 파일 그대로 — 서버 생성본으로 바꾸지 않는다(#81)", async () => {
    const result = await destinationFor({ slug: WORKBOOK, resourceUrl: `/materials/lead-magnets/${WORKBOOK}.pdf` })
    expect(result.destinationUrl).toBe(`/materials/lead-magnets/${WORKBOOK}.pdf`)
  })

  it("다른 슬러그의 생성본 경로·다른 PDF·외부 링크는 그대로 둔다", async () => {
    expect((await destinationFor({ resourceUrl: "/materials/lead-magnets/other-slug.pdf" })).destinationUrl).toBe(
      "/materials/lead-magnets/other-slug.pdf"
    )
    expect((await destinationFor({ resourceUrl: "/docs/files/brochure.pdf" })).destinationUrl).toBe("/docs/files/brochure.pdf")
    expect((await destinationFor({ resourceUrl: "https://notion.so/x" })).destinationUrl).toBe("https://notion.so/x")
  })

  it("resourceUrl 이 비면 자료 상세로", async () => {
    expect((await destinationFor({ resourceUrl: "" })).destinationUrl).toBe(`/resources/${GENERATED}`)
  })

  it("storagePath 가 있으면 예전처럼 서명 URL 을 쓴다(생성본 경로여도)", async () => {
    const result = await destinationFor({
      resourceUrl: `/materials/lead-magnets/${GENERATED}.pdf`,
      storagePath: `lead-magnets/${GENERATED}.pdf`,
    })
    expect(result.destinationUrl).toBe("https://storage.example/signed")
    expect(result.signed).toBe(true)
    expect(createSignedUrl).toHaveBeenCalledWith(`lead-magnets/${GENERATED}.pdf`, 60, { download: true })
  })

  it("비공개 자료는 null", async () => {
    getLeadMagnetBySlugFromStore.mockResolvedValue(magnet({ published: false }))
    expect(await prepareMaterialDownload({ slug: GENERATED })).toBeNull()
  })
})
