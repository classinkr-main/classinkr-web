import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

/* ─────────────────────────────────────────────────────────────
   광고성 발송 동의 인덱스 — 자동화 세그먼트 발송(leads 분기, CT11)·세그먼트 대상 미리보기·
   이메일 직접 입력 발송(해지자 제외)이 함께 쓴다. lib/automation-engine.ts 에서 옮겨 왔고,
   automation-engine 은 같은 이름으로 다시 내보낸다(동작·import 경로 불변).
   ─────────────────────────────────────────────────────────────
   동의 근거 = newsletter_subscribers.status "active"(공개 폼에서 마케팅 동의 시 여기로 동기화된다)
   또는 user_profiles.marketing_consent = true. 같은 이메일(대소문자 무시)의 구독 행이 하나라도 active 가
   아니면(해지) "blocked" — 해지가 로그인 프로필 동의보다 우선. 미결정·조회 실패는 거부로 취급한다(fail-closed —
   로더가 던지고, 호출부가 거부로 처리한다).

   분류(classifyEmailConsent)는 세그먼트 대상 미리보기용이다:
     unsubscribed      해지(구독 행 중 active 아님이 하나라도)
     subscriber_active 구독 active — 세그먼트 발송(미리보기)의 유일한 발송 가능 버킷
     profile_only      로그인 프로필 동의만(구독 행 없음) — 메일 속 수신거부 링크가 프로필 동의를 끄지 못해
                       이번 라운드에는 세그먼트 발송 대상에서 뺀다(2026-09-25 결정). 자동화 CT11 게이트는 기존대로 허용.
     none              동의 근거 없음 */

const CONSENT_PAGE_SIZE = 1000
const CONSENT_MAX_PAGES = 50

export type EmailConsentClass = "subscriber_active" | "profile_only" | "unsubscribed" | "none"

export interface LeadMarketingConsentIndex {
  /** 소문자 이메일 → 구독 상태. 같은 이메일(대소문자 무시) 행 중 하나라도 active가 아니면 "blocked". */
  subscriberStatusByEmail: Map<string, "active" | "blocked">
  /** user_profiles.marketing_consent = true 인 소문자 이메일 */
  profileConsentEmails: Set<string>
}

function consentEmailKey(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase()
}

/** 이 리드 이메일에 광고성 발송을 해도 되는가 — 해지면 false, 동의 근거가 없으면 false. */
export function isLeadMarketingEligible(email: string, index: LeadMarketingConsentIndex): boolean {
  const key = consentEmailKey(email)
  if (!key) return false
  const status = index.subscriberStatusByEmail.get(key)
  if (status === "blocked") return false
  return status === "active" || index.profileConsentEmails.has(key)
}

/** 이메일 하나의 동의 분류 — 해지 우선, 구독 active, 프로필 동의만, 근거 없음 순. 빈 주소는 none. */
export function classifyEmailConsent(email: string, index: LeadMarketingConsentIndex): EmailConsentClass {
  const key = consentEmailKey(email)
  if (!key) return "none"
  const status = index.subscriberStatusByEmail.get(key)
  if (status === "blocked") return "unsubscribed"
  if (status === "active") return "subscriber_active"
  if (index.profileConsentEmails.has(key)) return "profile_only"
  return "none"
}

/** 해지한 주소인가 — 이메일 직접 입력 발송이 수신자에서 뺄 때 쓴다(동의 근거 유무는 보지 않는다). */
export function isEmailUnsubscribed(email: string, index: LeadMarketingConsentIndex): boolean {
  const key = consentEmailKey(email)
  return Boolean(key) && index.subscriberStatusByEmail.get(key) === "blocked"
}

type ConsentPage = { data: unknown[] | null; error: { message: string } | null }

/** range 페이지네이션(실제 받은 행 수만큼 전진, 빈 페이지에서 종료). 상한 초과·오류는 던진다. */
async function readAllConsentRows(
  label: string,
  fetchPage: (from: number, to: number) => PromiseLike<ConsentPage>
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let from = 0
  for (let page = 0; ; page += 1) {
    if (page >= CONSENT_MAX_PAGES) {
      throw new Error(`[automation] ${label} 조회가 ${CONSENT_MAX_PAGES}페이지를 넘었습니다 — 상한을 재검토하세요.`)
    }
    const { data, error } = await fetchPage(from, from + CONSENT_PAGE_SIZE - 1)
    if (error) throw new Error(`[automation] ${label} 조회 실패: ${error.message}`)
    const batch = (data ?? []) as Record<string, unknown>[]
    if (batch.length === 0) break
    rows.push(...batch)
    from += batch.length
  }
  return rows
}

export async function loadLeadMarketingConsentIndex(): Promise<LeadMarketingConsentIndex> {
  const sb = createSupabaseAdminClient()
  const [subscribers, profiles] = await Promise.all([
    readAllConsentRows("구독 상태", (from, to) =>
      sb
        .from("newsletter_subscribers")
        .select("id, email, status")
        .order("id", { ascending: true })
        .range(from, to)
    ),
    readAllConsentRows("로그인 마케팅 동의", (from, to) =>
      sb
        .from("user_profiles")
        .select("id, email")
        .eq("marketing_consent", true)
        .not("email", "is", null)
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ])

  const subscriberStatusByEmail = new Map<string, "active" | "blocked">()
  for (const row of subscribers) {
    const key = consentEmailKey(row.email as string | null)
    if (!key) continue
    if (row.status !== "active") subscriberStatusByEmail.set(key, "blocked")
    else if (!subscriberStatusByEmail.has(key)) subscriberStatusByEmail.set(key, "active")
  }

  const profileConsentEmails = new Set<string>()
  for (const row of profiles) {
    const key = consentEmailKey(row.email as string | null)
    if (key) profileConsentEmails.add(key)
  }

  return { subscriberStatusByEmail, profileConsentEmails }
}
