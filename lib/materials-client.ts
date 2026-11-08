"use client"

import { getAnonymousId } from "@/lib/consent/consent"
import { isLeadMagnetPdfRoutePathname, materialDownloadBaseName } from "@/lib/lead-magnet-pdf/links"

export interface MaterialDownloadClientInput {
  slug: string
  email?: string | null
  source: string
  postSlug?: string | null
}

export interface MaterialDownloadClientResult {
  ok: true
  url: string
  signed: boolean
  stored: boolean
  gate: "open" | "email" | "login"
}

export class MaterialDownloadError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number
  ) {
    super(message)
    this.name = "MaterialDownloadError"
  }
}

const FILE_EXTENSION_PATTERN = /\.(pdf|zip|pptx?|docx?|xlsx?|hwpx?|csv)$/i

/**
 * 다운로드 API 가 돌려준 주소가 '파일'인지 판단한다. 서명 URL(Supabase Storage)은 항상 파일이고,
 * 같은 출처의 PDF 라우트(/api/materials/<slug>/pdf — 저장된 자료로 그때그때 그린다)도 확장자는 없지만 파일이다.
 * 그 밖에는 경로 확장자로 본다. 파일이 아니면(자료 상세 페이지·외부 문서 링크) 예전처럼 이동한다.
 */
export function isMaterialFileUrl(url: string, signed: boolean, origin = "http://localhost") {
  if (signed) return true
  try {
    const destination = new URL(url, origin)
    if (destination.origin === new URL(origin).origin && isLeadMagnetPdfRoutePathname(destination.pathname)) return true
    return FILE_EXTENSION_PATTERN.test(destination.pathname)
  } catch {
    return false
  }
}

/** 저장될 파일 이름 — 슬러그 대신 자료 제목으로(`우리 학원 수업 운영 누수 진단표.pdf`). */
export function buildMaterialDownloadFilename(title: string, url: string, origin = "http://localhost") {
  let extension = ".pdf"
  try {
    const match = new URL(url, origin).pathname.match(FILE_EXTENSION_PATTERN)
    if (match) extension = `.${match[1].toLowerCase()}`
  } catch {
    // 주소를 못 읽으면 PDF 로 둔다.
  }
  // PDF 라우트의 Content-Disposition 과 같은 이름(lib/lead-magnet-pdf/links.ts) — 브라우저는 그 헤더를 앞세운다.
  const base = materialDownloadBaseName(title)
  return `${base || "classin-material"}${extension}`
}

export type MaterialDeliveryOutcome = "downloaded" | "same-page" | "navigated"

/**
 * 받은 주소로 자료를 전달한다.
 *
 * 예전에는 `window.location.assign(url)`로 PDF 주소로 이동했다. 같은 출처의 공개 PDF 는 Chrome 이
 * 탭 안 뷰어로 열고, 자료 페이지를 떠나 버려 '뒤로 가기 → 폼 다시 입력'이 반복됐다. 파일이면
 * `<a download>` 로 그 자리에서 내려받고 페이지는 그대로 둔다.
 */
export function deliverMaterialDownload(
  result: Pick<MaterialDownloadClientResult, "url" | "signed">,
  title: string
): MaterialDeliveryOutcome {
  const origin = window.location.origin
  const destination = new URL(result.url, origin)

  if (destination.origin === origin && destination.pathname === window.location.pathname) {
    return "same-page"
  }

  if (!isMaterialFileUrl(result.url, result.signed, origin)) {
    window.location.assign(result.url)
    return "navigated"
  }

  const anchor = document.createElement("a")
  anchor.href = destination.toString()
  // 같은 출처 파일은 download 속성 이름으로 저장된다. 다른 출처(서명 URL)는 속성이 무시되지만
  // 서버가 attachment 로 내려 주므로 페이지를 떠나지 않고 저장된다.
  anchor.download = buildMaterialDownloadFilename(title, result.url, origin)
  anchor.rel = "noopener"
  anchor.style.display = "none"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  return "downloaded"
}

export async function requestMaterialDownload(input: MaterialDownloadClientInput) {
  const response = await fetch(`/api/materials/${encodeURIComponent(input.slug)}/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: input.email,
      source: input.source,
      postSlug: input.postSlug,
      anonymousId: getAnonymousId(),
    }),
  })

  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.url) {
    throw new MaterialDownloadError(
      data?.error ?? "자료 다운로드를 준비하지 못했습니다.",
      data?.code ?? "download_failed",
      response.status
    )
  }

  return data as MaterialDownloadClientResult
}
