import { type NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { checkRateLimitDistributed, getClientIp } from "@/lib/server/rate-limit"
import { verifyEmailClickToken } from "@/lib/server/security-tokens"

// 이메일 캠페인 클릭 추적(2026-08-18 성과 루프) — /api/track/open(픽셀)과 짝을 이루는
// 리다이렉트 카운터. 발송 시점에 서명한 cid+URL 조합만 목적지로 보낸다(오픈 리다이렉터 방지).
// 추적 실패가 수신자의 링크 이동을 막아서는 안 된다 — 카운트는 best-effort.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const cid = (req.nextUrl.searchParams.get("cid") ?? "").trim()
  const target = req.nextUrl.searchParams.get("u") ?? ""
  const sig = req.nextUrl.searchParams.get("sig")

  let validTarget = false
  try {
    validTarget =
      /^https?:\/\//.test(target) && UUID_RE.test(cid) && verifyEmailClickToken(cid, target, sig)
  } catch {
    // 토큰 시크릿 미설정 등 — 검증 불가면 리다이렉트하지 않는다.
    validTarget = false
  }

  // 서명이 깨진 요청은 홈으로 — 임의 목적지로는 절대 보내지 않는다.
  if (!validTarget) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin), 302)
  }

  // 레이트리밋 초과 시 카운트만 생략하고 이동은 시켜준다(수신자 경험 우선).
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimitDistributed(ip, "track-click", {
    windowMs: 60_000,
    max: 240,
  })

  if (allowed) {
    try {
      const sb = createSupabaseAdminClient()
      const { error } = await sb.rpc("increment_campaign_click_count", { campaign_id: cid })
      if (error) {
        console.warn("[track/click] increment_campaign_click_count failed:", error.message)
      }
    } catch (error) {
      console.warn("[track/click] click tracking failed:", error)
    }
  }

  return NextResponse.redirect(target, 302)
}
