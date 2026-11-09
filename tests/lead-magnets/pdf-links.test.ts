// lib/lead-magnet-pdf/links.ts — PDF 안 링크 추적(utm)·절대 주소·예전 생성본 경로 판정.
import { describe, expect, it } from "vitest"

import {
  absoluteUrl,
  displayUrl,
  isLeadMagnetPdfRoutePathname,
  isLegacyGeneratedPdfUrl,
  isSafeLeadMagnetSlug,
  leadMagnetPdfRoutePath,
  leadMagnetPdfViewPath,
  legacyLeadMagnetPdfPath,
  materialDownloadBaseName,
  pdfContentDisposition,
  toPdfUri,
  withPdfTracking,
} from "@/lib/lead-magnet-pdf/links"

const SITE = "https://classin.co.kr"

function query(url: string) {
  return new URL(url, SITE).searchParams
}

describe("withPdfTracking", () => {
  it("내부 경로에 utm 3종을 붙이고 해시를 뒤에 둔다", () => {
    const tracked = withPdfTracking("/contact#contact-form", "academy-system-checklist")
    expect(tracked.startsWith("/contact?")).toBe(true)
    expect(tracked.endsWith("#contact-form")).toBe(true)
    const params = query(tracked)
    expect(params.get("utm_source")).toBe("pdf")
    expect(params.get("utm_medium")).toBe("lead_magnet")
    expect(params.get("utm_campaign")).toBe("academy-system-checklist")
  })

  it("이미 있는 utm 값과 다른 파라미터는 덮지 않는다", () => {
    const tracked = withPdfTracking("/resources/x?utm_source=newsletter&ref=a#download", "slug-a")
    const params = query(tracked)
    expect(params.get("utm_source")).toBe("newsletter")
    expect(params.get("ref")).toBe("a")
    expect(params.get("utm_medium")).toBe("lead_magnet")
    expect(params.get("utm_campaign")).toBe("slug-a")
    expect(tracked.endsWith("#download")).toBe(true)
  })

  it("외부·상대 주소는 건드리지 않는다", () => {
    expect(withPdfTracking("https://www.classin.com/kr/", "s")).toBe("https://www.classin.com/kr/")
    expect(withPdfTracking("mailto:hello@classin.co.kr", "s")).toBe("mailto:hello@classin.co.kr")
    expect(withPdfTracking("#download", "s")).toBe("#download")
  })
})

describe("absoluteUrl", () => {
  it("내부 경로는 사이트 주소에 붙인다(끝 슬래시 정리)", () => {
    const url = absoluteUrl("/contact#contact-form", "s", `${SITE}/`)
    expect(url.startsWith(`${SITE}/contact?`)).toBe(true)
    expect(query(url).get("utm_campaign")).toBe("s")
  })

  it("http(s)·mailto·tel 은 그대로", () => {
    expect(absoluteUrl("https://docs.channel.io/a", "s", SITE)).toBe("https://docs.channel.io/a")
    expect(absoluteUrl("mailto:a@b.co", "s", SITE)).toBe("mailto:a@b.co")
    expect(absoluteUrl("tel:0212345678", "s", SITE)).toBe("tel:0212345678")
  })

  it("스킴 없는 상대 주소는 사이트 경로로 본다", () => {
    expect(absoluteUrl("resources", "s", SITE)).toBe(`${SITE}/resources`)
  })
})

describe("예전 생성본 경로", () => {
  it("자기 슬러그의 정확한 경로일 때만 참", () => {
    expect(legacyLeadMagnetPdfPath("a-b")).toBe("/materials/lead-magnets/a-b.pdf")
    expect(isLegacyGeneratedPdfUrl("/materials/lead-magnets/a-b.pdf", "a-b")).toBe(true)
    expect(isLegacyGeneratedPdfUrl("  /materials/lead-magnets/a-b.pdf ", "a-b")).toBe(true)
    expect(isLegacyGeneratedPdfUrl("/materials/lead-magnets/other.pdf", "a-b")).toBe(false)
    expect(isLegacyGeneratedPdfUrl("/materials/lead-magnets/a-b.pdf?v=2", "a-b")).toBe(false)
    expect(isLegacyGeneratedPdfUrl("https://classin.co.kr/materials/lead-magnets/a-b.pdf", "a-b")).toBe(false)
    expect(isLegacyGeneratedPdfUrl("/resources/a-b", "a-b")).toBe(false)
    expect(isLegacyGeneratedPdfUrl(undefined, "a-b")).toBe(false)
  })

  it("렌더 라우트 경로는 슬러그를 인코딩한다", () => {
    expect(leadMagnetPdfRoutePath("a-b")).toBe("/api/materials/a-b/pdf")
    expect(leadMagnetPdfRoutePath("자료")).toBe(`/api/materials/${encodeURIComponent("자료")}/pdf`)
  })

  it("어드민 새 탭 보기 주소만 inline 질의를 단다", () => {
    expect(leadMagnetPdfViewPath("a-b")).toBe("/api/materials/a-b/pdf?inline=1")
  })

  it("렌더 라우트 경로를 알아본다(확장자 없는 파일 — #81 그 자리 내려받기)", () => {
    expect(isLeadMagnetPdfRoutePathname(leadMagnetPdfRoutePath("a-b"))).toBe(true)
    expect(isLeadMagnetPdfRoutePathname(leadMagnetPdfRoutePath("자료"))).toBe(true)
    expect(isLeadMagnetPdfRoutePathname("/api/materials/a-b/download")).toBe(false)
    expect(isLeadMagnetPdfRoutePathname("/api/materials/a/b/pdf")).toBe(false)
    expect(isLeadMagnetPdfRoutePathname("/x/api/materials/a-b/pdf")).toBe(false)
    expect(isLeadMagnetPdfRoutePathname("/resources/a-b")).toBe(false)
  })

  it("경로 조작 슬러그를 거른다", () => {
    expect(isSafeLeadMagnetSlug("academy-system-checklist")).toBe(true)
    expect(isSafeLeadMagnetSlug("한글-자료")).toBe(true)
    expect(isSafeLeadMagnetSlug("../etc/passwd")).toBe(false)
    expect(isSafeLeadMagnetSlug("a/b")).toBe(false)
    expect(isSafeLeadMagnetSlug("")).toBe(false)
  })
})

describe("응답 헤더·주석 URI", () => {
  it("제목이 없으면 ASCII 슬러그 이름 — inline/attachment 는 부르는 쪽이 정한다", () => {
    expect(pdfContentDisposition("academy-system-checklist", "inline")).toBe('inline; filename="academy-system-checklist.pdf"')
    expect(pdfContentDisposition("academy-system-checklist", "attachment")).toBe(
      'attachment; filename="academy-system-checklist.pdf"'
    )
  })

  it("한글 슬러그는 filename* 로 싣고 헤더 값은 ASCII 다", () => {
    const value = pdfContentDisposition("한글-자료", "inline")
    expect(value).toMatch(/^inline; filename="[\x20-\x7e]+"; filename\*=UTF-8''/)
    expect(/^[\x20-\x7e]+$/.test(value)).toBe(true)
    expect(() => new Headers({ "Content-Disposition": value })).not.toThrow()
  })

  it("제목을 주면 <a download> 와 같은 제목 이름으로 저장된다(ASCII 대체 이름은 슬러그)", () => {
    const value = pdfContentDisposition("academy-admin-dashboard-template", "attachment", "학원 운영 대시보드 (템플릿)")
    expect(value).toBe(
      `attachment; filename="academy-admin-dashboard-template.pdf"; filename*=UTF-8''${encodeURIComponent("학원 운영 대시보드 ")}%28${encodeURIComponent("템플릿")}%29.pdf`
    )
    expect(/^[\x20-\x7e]+$/.test(value)).toBe(true)
    expect(() => new Headers({ "Content-Disposition": value })).not.toThrow()
    // filename* 를 되읽으면 원래 제목 이름이다.
    expect(decodeURIComponent(value.split("filename*=UTF-8''")[1])).toBe("학원 운영 대시보드 (템플릿).pdf")
  })

  it("파일 이름 몸통은 못 쓰는 글자를 걷고 80자에서 자른다", () => {
    expect(materialDownloadBaseName('A/B: "키트"?')).toBe("A B 키트")
    expect(materialDownloadBaseName("  ")).toBe("")
    expect(materialDownloadBaseName(undefined)).toBe("")
    expect(materialDownloadBaseName("가".repeat(100))).toHaveLength(80)
  })

  it("링크 주석 URI 는 7비트 ASCII", () => {
    for (const url of [`${SITE}/resources/한글?utm_campaign=자료#다운로드`, "mailto:a@b.co?subject=문의", `${SITE}/a(b)`]) {
      expect(/^[\x20-\x7e]+$/.test(toPdfUri(url))).toBe(true)
    }
  })

  it("인쇄용 짧은 주소는 프로토콜·utm 을 뗀다", () => {
    expect(displayUrl(`${SITE}/contact?utm_source=pdf#contact-form`)).toBe("classin.co.kr/contact")
    expect(displayUrl("https://www.classin.com/kr/how-to/")).toBe("classin.com/kr/how-to")
    expect(displayUrl("mailto:hello@classin.co.kr?subject=x")).toBe("hello@classin.co.kr")
  })
})
