import "server-only"

import { WEBSITE_FORM_LEAD_SOURCES, type LeadPayload } from "@/lib/lead-types"
import { postJson } from "@/lib/server/post-json"

// 홈페이지 폼 리드를 Compass(mkt.classin.co.kr)에도 찍는다 — 저장 직후 `POST /api/webhook/home-lead` 한 번 (2026-11-04).
//
// 설계(Compass 저장소 ADR-0081):
//  * 어드민이 정본(public.leads), Compass 는 사본이다. 어드민은 crm 스키마에 쓰지 않고 HTTP 로만 넘긴다(compass-integration-2026-09-14.md §0 의
//    "교차 쓰기 0건" 그대로). Compass 가 전화·이메일 동일인 판정, 재유입, crm.lead_refs(system='home_lead') 링크를 한다.
//  * 대상은 공개 폼 소스만(WEBSITE_FORM_LEAD_SOURCES — 데모·문의·쇼룸 예약·도입 신청). 뉴스레터는 상담이 아니고, Meta 리드폼은 Compass 가
//    웹훅으로 직접 받으니 보내면 두 번 들어간다.
//  * event_id 는 어드민 전환 이벤트 id(`lead:<id>` · `lead:<id>:reinflow:<시각>`)와 같은 값 — Compass 가 멱등 표식으로 쓴다. 같은 전달을 다시 보내도
//    리드가 두 건 되지 않는다.
//  * 설정은 env 둘(COMPASS_BRIDGE_URL — KR Team 브리지와 같은 Compass 오리진 · COMPASS_LEAD_WEBHOOK_TOKEN — Compass HOME_LEAD_TOKEN 과 같은 값).
//    하나라도 없거나 HTTPS 가 아니면 보내지 않는다(조용히 — 로컬 개발·Preview 에서 운영 Compass 로 밀지 않게). 실패는 throw → runLeadCaptureEffects 가
//    응답 warnings·「리드 전달 경고」 인시던트로 올린다. 저장을 막지 않는다.
//  * 비밀값은 Authorization 헤더로만 — 응답·로그에 넣지 않는다.

export const COMPASS_HOME_LEAD_PATH = "/api/webhook/home-lead"
/** 폼 응답이 이 왕복을 기다린다 — postJson 기본(8초)보다 짧게 */
export const COMPASS_LEAD_PUSH_TIMEOUT_MS = 6_000

export type CompassLeadPushKind = "created" | "reinflow"

/** Compass `lib/homeLeadIngest.ts` parseHomeLeadBody 가 읽는 모양 — 칸을 바꾸면 그쪽과 같이 바꾼다 */
export interface CompassLeadPushPayload {
  event_id: string
  kind: CompassLeadPushKind
  /** 어드민 public.leads.id */
  lead_id: string
  source: string
  source_detail: string | null
  name: string | null
  org: string | null
  phone: string | null
  email: string | null
  /** 어드민 branch(지역·도시 원문) — Compass 가 사전으로 시·도를 푼다 */
  region: string | null
  message: string | null
  role: string | null
  size: string | null
  page: string | null
  utm: { source: string | null; medium: string | null; campaign: string | null } | null
}

export interface CompassLeadPushOptions {
  leadId: string
  kind: CompassLeadPushKind
  eventId: string
}

export type CompassLeadPushTarget = { url: string; token: string }

/** 이 리드를 Compass 로 보내는 소스인가 — 공개 폼만(뉴스레터·Meta 리드폼 제외) */
export function isCompassPushSource(source: string | null | undefined): boolean {
  return !!source && WEBSITE_FORM_LEAD_SOURCES.has(source)
}

/** env 둘이 다 있고 HTTPS 오리진일 때만 대상. 아니면 null(보내지 않는다). 토큰은 돌려주는 객체 밖으로 내지 않는다 */
export function compassLeadPushTarget(env: Record<string, string | undefined> = process.env): CompassLeadPushTarget | null {
  const base = env.COMPASS_BRIDGE_URL?.trim()
  const token = env.COMPASS_LEAD_WEBHOOK_TOKEN?.trim()
  if (!base || !token) return null
  try {
    const url = new URL(base)
    if (url.protocol !== "https:" || url.username || url.password) return null
    url.pathname = COMPASS_HOME_LEAD_PATH
    url.search = ""
    url.hash = ""
    return { url: url.toString(), token }
  } catch {
    return null
  }
}

const str = (v: string | null | undefined): string | null => {
  const t = typeof v === "string" ? v.trim() : ""
  return t ? t : null
}

export function buildCompassLeadPushPayload(body: LeadPayload, { leadId, kind, eventId }: CompassLeadPushOptions): CompassLeadPushPayload {
  const utm = { source: str(body.utmSource), medium: str(body.utmMedium), campaign: str(body.utmCampaign) }
  return {
    event_id: eventId,
    kind,
    lead_id: leadId,
    source: body.source,
    source_detail: str(body.sourceDetail),
    name: str(body.name),
    org: str(body.org),
    phone: str(body.phone),
    email: str(body.email),
    region: str(body.branch),
    message: str(body.message),
    role: str(body.role),
    size: str(body.size),
    page: str(body.currentPage) ?? str(body.landingPage),
    utm: utm.source || utm.medium || utm.campaign ? utm : null,
  }
}

/**
 * Compass 로 한 건 보낸다. 대상이 없으면 아무것도 하지 않는다. 2xx 가 아니면 throw(`Compass: <status>`) —
 * 호출부(runLeadCaptureEffects)가 다른 외부 전달과 같이 모아 warnings 로 돌려준다.
 */
export async function pushLeadToCompass(body: LeadPayload, options: CompassLeadPushOptions): Promise<void> {
  const target = compassLeadPushTarget()
  if (!target) return
  const response = await postJson(target.url, buildCompassLeadPushPayload(body, options), {
    timeoutMs: COMPASS_LEAD_PUSH_TIMEOUT_MS,
    headers: { Authorization: `Bearer ${target.token}` },
  })
  if (!response.ok) throw new Error(`Compass: ${response.status}`)
}
