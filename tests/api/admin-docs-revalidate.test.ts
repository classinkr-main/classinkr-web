import { beforeEach, describe, expect, it, vi } from "vitest"

// app/api/admin/docs/articles/_revalidate.ts — 관리자 발행·수정·삭제 뒤 공개 경로 재검증과
// 함께 lib/docs-content.ts 의 인스턴스 메모도 비워야 한다. 그렇지 않으면 발행한 관리자가
// 같은 인스턴스에서 최대 60초 동안 옛 문서 목록을 본다.

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  invalidateDocsContentCache: vi.fn(),
}))

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/docs-content", () => ({
  invalidateDocsContentCache: mocks.invalidateDocsContentCache,
}))

import {
  revalidateDocsArticlePaths,
  revalidateDocsIndexPaths,
} from "@/app/api/admin/docs/articles/_revalidate"

beforeEach(() => {
  mocks.revalidatePath.mockClear()
  mocks.invalidateDocsContentCache.mockClear()
})

describe("docs revalidate helpers — 메모 무효화 동반", () => {
  it("revalidateDocsIndexPaths 는 공개 인덱스 경로 재검증과 함께 문서 메모를 비운다", () => {
    revalidateDocsIndexPaths()

    expect(mocks.invalidateDocsContentCache).toHaveBeenCalledTimes(1)
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/docs")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/sitemap.xml")
  })

  it("revalidateDocsArticlePaths 는 문서 경로 재검증과 함께 문서 메모를 한 번 비운다", () => {
    revalidateDocsArticlePaths(
      { categoryId: "start", publicPath: "/docs/start/install" },
      null,
      { categoryId: "software", publicPath: "/docs/software/board" }
    )

    expect(mocks.invalidateDocsContentCache).toHaveBeenCalledTimes(1)
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/docs/start")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/docs/start/install")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/docs/software/board")
  })
})
