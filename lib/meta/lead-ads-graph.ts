import "server-only"

// Meta Graph 리드 상세 조회 — 어드민 앱 토큰·appsecret_proof.
//
// app/api/meta/webhook/route.ts 에 있던 함수를 글자 그대로 옮겼다(설계 META-RECEIVER-FINAL
// §4-2 H2). 바뀐 것은 import·export 뿐이다. 요청 URL·헤더·오류 메시지는
// tests/meta/lead-ads-payload.golden.test.ts 가 라우트 경계에서 잠근다.

import { createHmac } from "crypto"

import type { MetaLeadDetail } from "@/lib/meta/lead-ads-payload"

function getGraphApiVersion() {
  return process.env.META_GRAPH_API_VERSION?.trim() || "v25.0"
}

function getMetaAccessToken() {
  return (
    process.env.META_PAGE_ACCESS_TOKEN?.trim() ||
    process.env.META_ACCESS_TOKEN?.trim() ||
    process.env.META_CAPI_ACCESS_TOKEN?.trim()
  )
}

function appSecretProof(accessToken: string) {
  const appSecret = process.env.META_APP_SECRET?.trim()
  if (!appSecret) return undefined
  return createHmac("sha256", appSecret).update(accessToken).digest("hex")
}

export async function fetchMetaLeadDetail(leadgenId: string) {
  const accessToken = getMetaAccessToken()
  if (!accessToken) {
    throw new Error("META_PAGE_ACCESS_TOKEN or META_ACCESS_TOKEN is required.")
  }

  const url = new URL(
    `https://graph.facebook.com/${getGraphApiVersion()}/${leadgenId}`
  )
  url.searchParams.set(
    "fields",
    [
      "id",
      "created_time",
      "ad_id",
      "ad_name",
      "adset_id",
      "adset_name",
      "campaign_id",
      "campaign_name",
      "form_id",
      "field_data",
    ].join(",")
  )

  const proof = appSecretProof(accessToken)
  if (proof) url.searchParams.set("appsecret_proof", proof)

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    throw new Error(`Meta lead fetch failed: ${response.status} ${errorText}`)
  }

  return (await response.json()) as MetaLeadDetail
}
