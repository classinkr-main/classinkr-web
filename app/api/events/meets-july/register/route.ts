/**
 * POST /api/events/meets-july/register
 * "Classin Meets · 7월(전주/광주)" 랜딩(public/l/meets-july/index.html)의 신청 폼 수신부.
 *
 * ── 두 개의 싱크 ──────────────────────────────────────────────────────────
 *  1) 참석 명단 구글 시트(운영자가 실제로 보는 원장) — **주 싱크**
 *  2) CRM 리드(submitLeadCapture) — 어드민/자동화 쪽 스파인
 *
 * ── 실패 정책(의도적) ─────────────────────────────────────────────────────
 *  - 시트 append 실패: 수기 복구가 가능하도록 신청 내용 전부를 error 로그로 남기고,
 *    CRM 쓰기는 **그대로 시도한 뒤**, 사용자에게는 500 + 재시도 안내를 돌려준다.
 *    시트가 비었는데 {ok:true} 를 주면 신청자는 접수됐다고 믿고 운영자는 명단에서
 *    영영 못 본다 — 가장 나쁜 결말이라 절대 성공으로 응답하지 않는다.
 *  - CRM 쓰기 실패(시트는 성공): 로그만 남기고 {ok:true}. 운영자가 보는 원장에는
 *    이미 들어갔으므로 신청자를 다시 폼으로 돌려보낼 이유가 없다.
 *  - 시트 실패 → 사용자가 재시도 → 시트 성공 + CRM 중복 시도가 될 수 있으나,
 *    lead-capture 는 동일 연락처 60초 중복 제출을 성공 응답으로 흡수한다.
 */

import { after, NextRequest, NextResponse } from "next/server"

import { getMarketingRequestMeta } from "@/lib/marketing/server-conversions"
import { appendMeetsAttendee } from "@/lib/meets/attendee-sheet"
import { formatMeetsCityLabel, getMeetsCity } from "@/lib/meets/july-2026"
import { submitLeadCapture } from "@/lib/server/lead-capture"
import { checkRateLimitDistributed, getClientIp } from "@/lib/server/rate-limit"
import { isCrossOriginRequest } from "@/lib/server/same-origin"

export const runtime = "nodejs"

// TLD 2자 이상 강제 — lead-capture 와 같은 기준(약한 이메일은 어차피 거기서 또 걸린다).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/

// 적대적 클라이언트가 시트 셀에 거대한 문자열을 밀어 넣지 못하도록 필드별 상한을 둔다.
const FIELD_LIMITS = {
  name: 60,
  org: 120,
  role: 60,
  phone: 40,
  email: 254,
  utm: 200,
  clickId: 400,
  url: 500,
} as const

const MIN_PHONE_DIGITS = 9

function clampString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return ""
  return value.trim().slice(0, maxLength)
}

/** 비어 있으면 undefined — lead-capture 의 normalizeString 과 동일한 관례. */
function optionalString(value: unknown, maxLength: number): string | undefined {
  const clamped = clampString(value, maxLength)
  return clamped || undefined
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 })
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
    // /api/lead 와 버킷을 분리한다 — 설명회 신청 때문에 일반 상담 폼이 막히면 안 된다.
    const { allowed, resetAt } = await checkRateLimitDistributed(ip, "meets-july-register", {
      windowMs: 60_000,
      max: 5,
    })
    if (!allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
      return NextResponse.json(
        { ok: false, error: "요청이 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      )
    }

    const raw = await req.json().catch(() => null)
    if (!raw || typeof raw !== "object") {
      return badRequest("요청 형식이 올바르지 않습니다.")
    }
    const body = raw as Record<string, unknown>

    /* ── 서버 검증 — 클라이언트 검증은 참고만 하고 아무것도 신뢰하지 않는다 ── */

    const city = getMeetsCity(body.city)
    if (!city) {
      return badRequest("신청 가능한 설명회 일정이 아닙니다. 도시를 다시 선택해 주세요.")
    }

    const name = clampString(body.name, FIELD_LIMITS.name)
    const org = clampString(body.org, FIELD_LIMITS.org)
    const role = clampString(body.role, FIELD_LIMITS.role)
    const phone = clampString(body.phone, FIELD_LIMITS.phone)
    const email = clampString(body.email, FIELD_LIMITS.email).toLowerCase()

    if (!name) return badRequest("성함을 입력해 주세요.")
    if (!org) return badRequest("학원/기관명을 입력해 주세요.")
    if (!role) return badRequest("직책을 입력해 주세요.")
    if (!phone) return badRequest("연락처를 입력해 주세요.")
    if (phone.replace(/\D/g, "").length < MIN_PHONE_DIGITS) {
      return badRequest("연락처 형식을 다시 확인해 주세요.")
    }
    // 이메일은 선택 항목이다 — 비워도 접수된다. 다만 적어 넣었다면 형식은 맞아야
    // 한다(오타난 주소를 명단에 그대로 남기면 나중에 연락이 안 된다).
    if (email && !EMAIL_REGEX.test(email)) {
      return badRequest("이메일 형식을 다시 확인해 주세요.")
    }

    const marketingConsent = body.marketingConsent === true

    const attribution = {
      utmSource: optionalString(body.utmSource, FIELD_LIMITS.utm),
      utmMedium: optionalString(body.utmMedium, FIELD_LIMITS.utm),
      utmCampaign: optionalString(body.utmCampaign, FIELD_LIMITS.utm),
      utmTerm: optionalString(body.utmTerm, FIELD_LIMITS.utm),
      utmContent: optionalString(body.utmContent, FIELD_LIMITS.utm),
      gclid: optionalString(body.gclid, FIELD_LIMITS.clickId),
      fbclid: optionalString(body.fbclid, FIELD_LIMITS.clickId),
      landingPage: optionalString(body.landingPage, FIELD_LIMITS.url),
      referrer: optionalString(body.referrer, FIELD_LIMITS.url),
    }

    const submittedAt = new Date()

    /* ── 싱크 1: 참석 명단 시트(주 싱크) ────────────────────────────────── */

    let sheetFailed = false
    try {
      const appended = await appendMeetsAttendee({
        city: city.key,
        name,
        org,
        role,
        phone,
        email,
        submittedAt,
        attribution,
      })
      console.info(
        `[meets-july/register] sheet append ok city=${city.key} tab=${appended.sheetTabTitle} range=${appended.appendedRange}`
      )
    } catch (error) {
      sheetFailed = true
      // 수기 복구용 — 이 한 줄만 보고 명단에 직접 옮겨 적을 수 있어야 한다.
      console.error("[meets-july/register] sheet append FAILED — 수기 입력 필요:", {
        city: city.key,
        sheetTabTitle: city.sheetTabTitle,
        submittedAt: submittedAt.toISOString(),
        name,
        org,
        role,
        phone,
        email,
        marketingConsent,
        attribution,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    /* ── 싱크 2: CRM 리드 ───────────────────────────────────────────────── */

    try {
      // contact_page 는 lead-capture 에서 org/name/phone/message 를 모두 요구한다.
      // 폼에 자유 서술 칸이 없으므로 신청한 일정을 message 로 합성한다.
      const leadResult = await submitLeadCapture(
        {
          source: "contact_page",
          name,
          org,
          role,
          email,
          phone,
          message: `[Classin Meets 설명회 신청] ${formatMeetsCityLabel(city)}`,
          marketingConsent,
          eventSlug: city.leadEventSlug,
          sourceDetail: `landing:meets-july:${city.key}`,
          utmSource: attribution.utmSource,
          utmMedium: attribution.utmMedium,
          utmCampaign: attribution.utmCampaign,
          utmTerm: attribution.utmTerm,
          utmContent: attribution.utmContent,
          gclid: attribution.gclid,
          fbclid: attribution.fbclid,
          landingPage: attribution.landingPage,
          currentPage: attribution.landingPage,
          referrer: attribution.referrer,
        },
        {
          deferTask: (task) => after(task),
          requestMeta: getMarketingRequestMeta(req, {
            sourceUrl: attribution.landingPage ?? null,
            fbclid: attribution.fbclid ?? null,
          }),
        }
      )

      if (!leadResult.body.ok) {
        console.error(
          `[meets-july/register] CRM lead capture rejected city=${city.key} status=${leadResult.status} error=${leadResult.body.error}`
        )
      }
    } catch (error) {
      // 시트가 이미 성공했다면 신청자에게는 성공이다 — 여기서 응답을 뒤집지 않는다.
      console.error("[meets-july/register] CRM lead capture threw:", error)
    }

    if (sheetFailed) {
      return NextResponse.json(
        {
          ok: false,
          error: "신청 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[POST /api/events/meets-july/register] unexpected error:", error)
    return NextResponse.json(
      { ok: false, error: "신청 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    )
  }
}
