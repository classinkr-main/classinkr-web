"use client"

import { getAnonymousId } from "@/lib/consent/consent"

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
