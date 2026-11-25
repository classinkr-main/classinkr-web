/**
 * Upstash Redis REST 연결 설정 — 여러 서버 인스턴스가 함께 보는 저장소.
 * 분산 요청 제한(rate-limit.ts checkRateLimitDistributed)과 갈매봇 확인표 일회용 판정
 * (lib/admin-ai/server/ticket-claims.ts)이 같은 연결을 쓴다. 둘 다 설정돼야 켜진다.
 * 값은 로그·응답에 싣지 않는다.
 */
export const UPSTASH_URL_ENV = "UPSTASH_REDIS_REST_URL"
export const UPSTASH_TOKEN_ENV = "UPSTASH_REDIS_REST_TOKEN"

export interface UpstashRestConfig {
  url: string
  token: string
}

export function readUpstashRestConfig(env: Record<string, string | undefined> = process.env): UpstashRestConfig | null {
  const url = env[UPSTASH_URL_ENV]?.trim()
  const token = env[UPSTASH_TOKEN_ENV]?.trim()
  return url && token ? { url, token } : null
}
