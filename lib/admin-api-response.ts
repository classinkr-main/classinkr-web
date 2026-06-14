import { NextResponse } from "next/server"

// 어드민 GET 응답용 표준 캐시 헤더.
// 브라우저 프라이빗 캐시만 허용 — 30초 내 재방문은 즉시, 이후 2분까지는 stale 표시 후 갱신.
// 변경(mutation) 직후에는 lib/admin-client.ts가 cache: "no-cache"로 우회하므로 staleness 없음.
const ADMIN_CACHE_CONTROL = "private, max-age=30, stale-while-revalidate=120"

export function adminCachedJson<T>(data: T, init?: ResponseInit) {
  const response = NextResponse.json(data, init)
  response.headers.set("Cache-Control", ADMIN_CACHE_CONTROL)
  return response
}
