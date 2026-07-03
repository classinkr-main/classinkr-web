// 문서 발행 → 챗봇 인덱스(docs_ai_chunks) 갱신 서버 훅.
// 감사에서 확인된 결함: reindex가 편집 화면의 클라이언트 best-effort 호출뿐이라
// 실패 무통보 + 버전 롤백·API 직접 호출 경로에서 인덱스가 미갱신됐다.
// 발행 상태에 닿는 쓰기 라우트가 서버측에서 reindexDocsAiChunks(articleId)를
// 호출하는지, 실패 시 본 응답을 깨지 않고 reindexWarning만 내려주는지 검증한다.
import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const verifyAdmin = vi.fn()
const getVerifiedAdminContext = vi.fn()
const reindexDocsAiChunks = vi.fn()

const createDocsArticle = vi.fn()
const getDocsArticleById = vi.fn()
const patchDocsArticle = vi.fn()
const deleteDocsArticle = vi.fn()
const upsertDocsRedirect = vi.fn()
const getDocsArticleDraft = vi.fn()
const publishDocsArticleDraft = vi.fn()
const rollbackDocsArticleToVersion = vi.fn()
const bulkPatchDocsArticles = vi.fn()

vi.mock("@/lib/admin-auth", () => ({
  verifyAdmin,
  getVerifiedAdminContext,
}))

vi.mock("@/lib/admin-docs", () => ({
  reindexDocsAiChunks,
}))

vi.mock("@/lib/repositories/docs-articles", () => ({
  createDocsArticle,
  getDocsArticleById,
  patchDocsArticle,
  deleteDocsArticle,
  upsertDocsRedirect,
  getDocsArticleDraft,
  publishDocsArticleDraft,
  rollbackDocsArticleToVersion,
  bulkPatchDocsArticles,
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

function articleDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: "art-1",
    categoryId: "cat-1",
    slug: "sample-doc",
    title: "샘플 문서",
    description: "설명",
    audience: [],
    productArea: "general",
    docType: "guide",
    difficulty: "beginner",
    status: "published",
    visibility: "public",
    noindex: false,
    featured: false,
    orderIndex: 0,
    tags: [],
    keywords: [],
    symptoms: [],
    chatbotSummary: null,
    contentMarkdown: "# 본문",
    contentJson: null,
    seoTitle: null,
    seoDescription: null,
    publicPath: "/docs/cat-1/sample-doc",
    publishedAt: null,
    updatedAt: "2026-07-01T00:00:00Z",
    ...overrides,
  }
}

function reindexOk() {
  reindexDocsAiChunks.mockResolvedValue({
    configured: true,
    status: "live",
    generatedAt: "2026-07-02T00:00:00Z",
    articleCount: 1,
    chunkCount: 3,
    warnings: [],
  })
}

function jsonRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(`https://classin.kr${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

function allowAdmin() {
  verifyAdmin.mockResolvedValue(null)
  getVerifiedAdminContext.mockResolvedValue({ name: "관리자", userId: "admin-1" })
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("PATCH /api/admin/docs/articles/[id] — 서버측 reindex 훅", () => {
  async function callPatch(body: Record<string, unknown>) {
    const { PATCH } = await import("@/app/api/admin/docs/articles/[id]/route")
    return PATCH(jsonRequest("/api/admin/docs/articles/art-1", "PATCH", body), {
      params: Promise.resolve({ id: "art-1" }),
    })
  }

  it("게시 문서 본문 수정 시 단일 문서 reindex를 호출한다", async () => {
    allowAdmin()
    reindexOk()
    getDocsArticleById.mockResolvedValue(articleDetail())
    patchDocsArticle.mockResolvedValue(articleDetail({ contentMarkdown: "# 수정 본문" }))

    const response = await callPatch({ contentMarkdown: "# 수정 본문" })

    expect(response.status).toBe(200)
    expect(reindexDocsAiChunks).toHaveBeenCalledTimes(1)
    expect(reindexDocsAiChunks).toHaveBeenCalledWith("art-1")
    const body = await response.json()
    expect(body.reindexWarning).toBeUndefined()
  })

  it("게시 해제(published→draft)도 chunk 정리를 위해 reindex를 호출한다", async () => {
    allowAdmin()
    reindexOk()
    getDocsArticleById.mockResolvedValue(articleDetail({ status: "published" }))
    patchDocsArticle.mockResolvedValue(articleDetail({ status: "draft" }))

    const response = await callPatch({ status: "draft" })

    expect(response.status).toBe(200)
    expect(reindexDocsAiChunks).toHaveBeenCalledWith("art-1")
  })

  it("draft 문서의 draft 저장 변경은 reindex하지 않는다", async () => {
    allowAdmin()
    getDocsArticleById.mockResolvedValue(articleDetail({ status: "draft" }))
    patchDocsArticle.mockResolvedValue(articleDetail({ status: "draft", title: "수정 제목" }))

    const response = await callPatch({ title: "수정 제목" })

    expect(response.status).toBe(200)
    expect(reindexDocsAiChunks).not.toHaveBeenCalled()
  })

  it("reindex 실패 시 본 응답은 성공 유지 + reindexWarning으로 알린다", async () => {
    allowAdmin()
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    reindexDocsAiChunks.mockRejectedValue(new Error("supabase down"))
    getDocsArticleById.mockResolvedValue(articleDetail())
    patchDocsArticle.mockResolvedValue(articleDetail({ contentMarkdown: "# 수정 본문" }))

    const response = await callPatch({ contentMarkdown: "# 수정 본문" })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.id).toBe("art-1")
    expect(body.reindexWarning).toContain("챗봇 검색 인덱스")
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

describe("POST /api/admin/docs/articles — 생성 시 reindex 훅", () => {
  async function callCreate(body: Record<string, unknown>) {
    const { POST } = await import("@/app/api/admin/docs/articles/route")
    return POST(jsonRequest("/api/admin/docs/articles", "POST", body))
  }

  const createPayload = {
    categoryId: "cat-1",
    slug: "new-doc",
    title: "새 문서",
    description: "설명",
    contentMarkdown: "# 본문",
  }

  it("published로 생성하면 reindex를 호출한다", async () => {
    allowAdmin()
    reindexOk()
    createDocsArticle.mockResolvedValue(articleDetail({ id: "art-new", status: "published" }))

    const response = await callCreate({ ...createPayload, status: "published" })

    expect(response.status).toBe(201)
    expect(reindexDocsAiChunks).toHaveBeenCalledWith("art-new")
  })

  it("draft로 생성하면 reindex하지 않는다", async () => {
    allowAdmin()
    createDocsArticle.mockResolvedValue(articleDetail({ id: "art-new", status: "draft" }))

    const response = await callCreate({ ...createPayload, status: "draft" })

    expect(response.status).toBe(201)
    expect(reindexDocsAiChunks).not.toHaveBeenCalled()
  })
})

describe("POST /api/admin/docs/articles/[id]/draft/publish — 반영 시 reindex 훅", () => {
  it("공개본 반영 후 reindex를 호출한다", async () => {
    allowAdmin()
    reindexOk()
    getDocsArticleById.mockResolvedValue(articleDetail())
    getDocsArticleDraft.mockResolvedValue({
      articleId: "art-1",
      draftPayload: { contentMarkdown: "# 초안 본문" },
      changeNote: null,
      createdBy: null,
      updatedBy: null,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z",
    })
    publishDocsArticleDraft.mockResolvedValue(articleDetail({ contentMarkdown: "# 초안 본문" }))

    const { POST } = await import("@/app/api/admin/docs/articles/[id]/draft/publish/route")
    const response = await POST(
      jsonRequest("/api/admin/docs/articles/art-1/draft/publish", "POST"),
      { params: Promise.resolve({ id: "art-1" }) }
    )

    expect(response.status).toBe(200)
    expect(reindexDocsAiChunks).toHaveBeenCalledWith("art-1")
  })
})

describe("POST /api/admin/docs/articles/[id]/versions/[versionId]/rollback — 롤백 시 reindex 훅", () => {
  async function callRollback() {
    const { POST } = await import(
      "@/app/api/admin/docs/articles/[id]/versions/[versionId]/rollback/route"
    )
    return POST(jsonRequest("/api/admin/docs/articles/art-1/versions/ver-1/rollback", "POST"), {
      params: Promise.resolve({ id: "art-1", versionId: "ver-1" }),
    })
  }

  it("게시 문서 롤백 후 reindex를 호출한다 (감사 결함 경로)", async () => {
    allowAdmin()
    reindexOk()
    rollbackDocsArticleToVersion.mockResolvedValue(articleDetail())

    const response = await callRollback()

    expect(response.status).toBe(200)
    expect(reindexDocsAiChunks).toHaveBeenCalledWith("art-1")
  })

  it("draft 문서 롤백은 reindex하지 않는다", async () => {
    allowAdmin()
    rollbackDocsArticleToVersion.mockResolvedValue(articleDetail({ status: "draft" }))

    const response = await callRollback()

    expect(response.status).toBe(200)
    expect(reindexDocsAiChunks).not.toHaveBeenCalled()
  })

  it("reindex 실패 시에도 롤백 응답은 성공 유지 + reindexWarning", async () => {
    allowAdmin()
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    reindexDocsAiChunks.mockRejectedValue(new Error("supabase down"))
    rollbackDocsArticleToVersion.mockResolvedValue(articleDetail())

    const response = await callRollback()

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.reindexWarning).toContain("챗봇 검색 인덱스")
    consoleError.mockRestore()
  })
})

describe("PATCH /api/admin/docs/articles/bulk — 일괄 수정 시 reindex 훅", () => {
  async function callBulk(body: Record<string, unknown>) {
    const { PATCH } = await import("@/app/api/admin/docs/articles/bulk/route")
    return PATCH(jsonRequest("/api/admin/docs/articles/bulk", "PATCH", body))
  }

  it("status 일괄 변경 시 문서별로 reindex를 호출한다", async () => {
    allowAdmin()
    reindexOk()
    bulkPatchDocsArticles.mockResolvedValue({ updatedCount: 2 })

    const response = await callBulk({ ids: ["art-1", "art-2"], status: "published" })

    expect(response.status).toBe(200)
    expect(reindexDocsAiChunks).toHaveBeenCalledTimes(2)
    expect(reindexDocsAiChunks).toHaveBeenNthCalledWith(1, "art-1")
    expect(reindexDocsAiChunks).toHaveBeenNthCalledWith(2, "art-2")
  })

  it("featured만 바꾸는 일괄 변경은 reindex하지 않는다", async () => {
    allowAdmin()
    bulkPatchDocsArticles.mockResolvedValue({ updatedCount: 2 })

    const response = await callBulk({ ids: ["art-1", "art-2"], featured: true })

    expect(response.status).toBe(200)
    expect(reindexDocsAiChunks).not.toHaveBeenCalled()
  })
})
