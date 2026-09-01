import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { getSupabaseServerEnv } from "./server-env"

let cachedClient: SupabaseClient | null = null

// supabase-js 는 기본 fetch 를 그대로 쓰므로 소켓이 열려 있는 한 무한 대기한다.
// 그 상태에서 Supabase 가 느려지기만 해도(커넥션 풀 고갈, 지역 장애) 모든 함수가
// 플랫폼 타임아웃까지 매달리고, 매달린 함수가 동시 실행 슬롯을 채워 정상 요청까지
// 큐잉된다 — 부분 장애가 전면 장애로 증폭된다. 이를 막기 위한 기본 상한이다.
//
// 개별 쿼리가 자체 signal 을 넘기면 그 값을 존중한다
// (예: lib/repositories/blog.ts, lib/repositories/public-events.ts 의 6초 예산).
const DEFAULT_QUERY_TIMEOUT_MS = Number(
  process.env.SUPABASE_QUERY_TIMEOUT_MS ?? 10_000
)

function resolveUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  return input.url
}

function fetchWithDefaultTimeout(input: RequestInfo | URL, init?: RequestInit) {
  // 호출부가 이미 예산을 정했으면 덮어쓰지 않는다.
  if (init?.signal) return fetch(input, init)

  // Storage 는 업로드/다운로드라 파일 크기에 비례해 오래 걸린다.
  // 여기에 쿼리용 상한을 적용하면 정상 업로드가 끊기므로 제외한다.
  if (resolveUrl(input).includes("/storage/v1/")) return fetch(input, init)

  return fetch(input, { ...init, signal: AbortSignal.timeout(DEFAULT_QUERY_TIMEOUT_MS) })
}

export function createSupabaseAdminClient() {
  if (cachedClient) return cachedClient

  const { url, secretKey } = getSupabaseServerEnv()

  cachedClient = createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: fetchWithDefaultTimeout,
    },
  })
  return cachedClient
}
