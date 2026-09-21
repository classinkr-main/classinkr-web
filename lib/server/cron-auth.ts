import "server-only"

// crypto.timingSafeEqual 로 비교한다 — 문자열 `===`/`!==` 비교는 첫 불일치 바이트에서
// 바로 끊기므로 응답 시간차로 CRON_SECRET을 한 글자씩 추측당할 수 있다(타이밍 사이드채널).
import { timingSafeEqual } from "crypto"

const BEARER_PREFIX = "Bearer "

export type CronAuthResult = "ok" | "missing_secret" | "unauthorized"

/**
 * 11개 cron 라우트가 공유하는 인증 판정.
 *
 * - 인증은 Authorization: Bearer ${CRON_SECRET} 하나뿐이다.
 * - x-vercel-cron 헤더는 보지 않는다 — 근거는 app/api/cron/sync-branch/route.ts 상단 주석
 *   참조(그 헤더를 신뢰하는 게이트를 추가했다가 크론이 전부 401로 죽은 사고 기록).
 * - 어떤 입력에도 throw 하지 않는다. 길이가 다른 두 버퍼로 timingSafeEqual을 호출하면
 *   예외가 나므로, 비교 전에 길이를 먼저 맞춰본다.
 */
export function checkCronAuth(
  req: { headers: { get(name: string): string | null } },
  secret: string | undefined = process.env.CRON_SECRET
): CronAuthResult {
  if (!secret) return "missing_secret"

  const authHeader = req.headers.get("authorization")
  if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) return "unauthorized"

  const provided = authHeader.slice(BEARER_PREFIX.length)
  const providedBuffer = Buffer.from(provided, "utf8")
  const secretBuffer = Buffer.from(secret, "utf8")

  if (providedBuffer.length !== secretBuffer.length) return "unauthorized"

  return timingSafeEqual(providedBuffer, secretBuffer) ? "ok" : "unauthorized"
}
