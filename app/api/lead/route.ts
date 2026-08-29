import { after, NextRequest, NextResponse } from "next/server"
import { getMarketingRequestMeta } from "@/lib/marketing/server-conversions"
import { isContactTopic } from "@/lib/contact/topics"
import { checkRateLimitDistributed, getClientIp } from "@/lib/server/rate-limit"
import { submitLeadCapture } from "@/lib/server/lead-capture"
import { isCrossOriginRequest } from "@/lib/server/same-origin"

export const runtime = "nodejs"

/**
 * `contact_page` 리드의 sourceDetail 은 문의 폼의 "문의 유형"이고, 그대로
 * `leads.source_detail` 에 실려 상담 유형 집계 키가 된다. 컬럼에 CHECK 제약이 없어
 * 예전에는 이 공개 무인증 엔드포인트로 임의 문자열을 넣어 통계를 오염시킬 수 있었다.
 *
 * 검사는 **라우트 경계에서만** 한다. `submitLeadCapture()` 자체를 조이면 서버 내부
 * 호출자(`lib/checkout-requests.ts` 의 `checkout_request:{kind}`, meets-july 랜딩의
 * `landing:...`, 외부 밀어넣기 `app/api/webhook/page`)가 같이 막힌다 — 그들은 이
 * 라우트를 거치지 않으므로 영향이 없다.
 *
 * 값이 비어 오면 통과시킨다. 유형 없는 제출은 `source_detail` 이 NULL 로 남을 뿐이고,
 * 메타데이터 하나 때문에 실제 상담 요청을 떨어뜨리지 않는다.
 */
function getInvalidContactTopic(body: unknown): string | null {
  if (!body || typeof body !== "object") return null
  const record = body as Record<string, unknown>
  if (record.source !== "contact_page") return null

  const raw = record.sourceDetail ?? record.source_detail
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  return isContactTopic(trimmed) ? null : trimmed
}

export async function POST(req: NextRequest) {
  try {
    if (isCrossOriginRequest(req)) {
      return NextResponse.json(
        { ok: false, error: "허용되지 않은 요청 출처입니다." },
        { status: 403 }
      )
    }

    const ip = getClientIp(req)
    const { allowed, resetAt } = await checkRateLimitDistributed(ip, "lead", { windowMs: 60_000, max: 5 })
    if (!allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
      return NextResponse.json(
        { error: "요청이 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      )
    }

    const body = await req.json().catch(() => null)

    const invalidTopic = getInvalidContactTopic(body)
    if (invalidTopic !== null) {
      console.warn("[POST /api/lead] 등록되지 않은 문의 유형 거부:", invalidTopic.slice(0, 120))
      return NextResponse.json(
        { ok: false, error: "문의 유형이 올바르지 않습니다." },
        { status: 400 }
      )
    }

    const bodyObject = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
    const result = await submitLeadCapture(body, {
      deferTask: (task) => after(task),
      requestMeta: getMarketingRequestMeta(req, {
        sourceUrl:
          typeof bodyObject.currentPage === "string"
            ? bodyObject.currentPage
            : typeof bodyObject.current_page === "string"
              ? bodyObject.current_page
              : null,
        fbclid: typeof bodyObject.fbclid === "string" ? bodyObject.fbclid : null,
      }),
    })

    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error("[POST /api/lead] unexpected error:", error)
    return NextResponse.json(
      { ok: false, error: "상담 요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    )
  }
}
