import { describe, expect, it } from "vitest"

import { buildMaterialDownloadFilename, isMaterialFileUrl } from "@/lib/materials-client"

const ORIGIN = "https://classin.co.kr"

describe("자료 다운로드 전달", () => {
  it("서명 URL 과 PDF 경로는 파일로 보고 그 자리에서 내려받는다", () => {
    expect(isMaterialFileUrl("https://x.supabase.co/storage/v1/object/sign/materials/a?token=1", true, ORIGIN)).toBe(true)
    expect(isMaterialFileUrl("/materials/lead-magnets/academy-system-checklist.pdf", false, ORIGIN)).toBe(true)
    expect(isMaterialFileUrl("/materials/kit.PDF?v=2", false, ORIGIN)).toBe(true)
  })

  it("자료 상세·외부 문서 같은 페이지 주소는 파일로 보지 않는다(예전처럼 이동)", () => {
    expect(isMaterialFileUrl("/resources/academy-system-checklist", false, ORIGIN)).toBe(false)
    expect(isMaterialFileUrl("https://docs.channel.io/classinkorea/ko/articles/x", false, ORIGIN)).toBe(false)
  })

  it("저장 파일 이름은 자료 제목과 원래 확장자를 쓴다", () => {
    expect(
      buildMaterialDownloadFilename("우리 학원 수업 운영 누수 진단표", "/materials/lead-magnets/academy-system-checklist.pdf", ORIGIN)
    ).toBe("우리 학원 수업 운영 누수 진단표.pdf")
    expect(buildMaterialDownloadFilename('A/B: "키트"?', "/materials/kit.zip", ORIGIN)).toBe("A B 키트.zip")
    expect(buildMaterialDownloadFilename("  ", "/materials/x", ORIGIN)).toBe("classin-material.pdf")
  })
})
