import { beforeEach, describe, expect, it, vi } from "vitest"

// app/api/admin/docs/articles/_revalidate.ts — 관리자 발행·수정·삭제 뒤 공개 경로 재검증과
// 함께 lib/docs-content.ts 의 인스턴스 메모도 비워야 한다. 그렇지 않으면 발행한 관리자가
// 같은 인스턴스에서 최대 60초 동안 옛 문서 목록을 본다.

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  invalidateDocsContentCache: vi.fn(),
}))

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: mocks.revalidateTag,
}))
vi.mock("@/lib/docs-content", () => ({
  invalidateDocsContentCache: mocks.invalidateDocsContentCache,
}))
// admin-performance-round3-2026-09-10.md §3.3 — 어드민 문서 목록 캐시 태그도 여기서
// 무효화한다. 실제 lib/admin-docs.ts(콘텐츠 파트 소유, 무거운 모듈)까지 로드하지 않도록
// 태그 상수만 목킹한다.
vi.mock("@/app/api/admin/docs/_admin-list-cache", () => ({
  ADMIN_DOCS_LIST_CACHE_TAG: "admin-docs-list",
}))

import {
  revalidateDocsArticlePaths,
  revalidateDocsIndexPaths,
} from "@/app/api/admin/docs/articles/_revalidate"

beforeEach(() => {
  mocks.revalidatePath.mockClear()
  mocks.revalidateTag.mockClear()
  mocks.invalidateDocsContentCache.mockClear()
})

describe("docs revalidate helpers — 메모 무효화 동반", () => {
  it("revalidateDocsIndexPaths 는 공개 인덱스 경로 재검증과 함께 문서 메모를 비우고 어드민 목록 태그도 무효화한다", () => {
    revalidateDocsIndexPaths()

    expect(mocks.invalidateDocsContentCache).toHaveBeenCalledTimes(1)
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/docs")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/sitemap.xml")
    expect(mocks.revalidateTag).toHaveBeenCalledWith("admin-docs-list", "max")
  })

  it("revalidateDocsArticlePaths 는 문서 경로 재검증과 함께 문서 메모를 한 번 비우고 어드민 목록 태그도 무효화한다", () => {
    revalidateDocsArticlePaths(
      { categoryId: "start", publicPath: "/docs/start/install" },
      null,
      { categoryId: "software", publicPath: "/docs/software/board" }
    )

    expect(mocks.invalidateDocsContentCache).toHaveBeenCalledTimes(1)
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/docs/start")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/docs/start/install")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/docs/software/board")
    expect(mocks.revalidateTag).toHaveBeenCalledWith("admin-docs-list", "max")
  })
})
