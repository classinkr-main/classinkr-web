// 세그먼트 → 메시지 탭 넘김(2026-09-25, 발송 1단계) — URL 생성·파싱·제거. 순수 모듈(서버·클라이언트·테스트 공용).
//
// URL 에는 저장 세그먼트 id(UUID) 하나만 싣는다. 전화·이메일·이름·조건 원문은 싣지 않는다(브라우저 기록·접근 로그
// 잔류 방지 — 고객 360 의 message_to 전화 딥링크 패턴은 따라 하지 않는다). 저장되지 않은 조건은 넘기지 않는다.
// 캠페인 허브(components/admin/campaigns/CampaignsHubClient.tsx)가 마운트 시 한 번 소모하고 router.replace 로 지운다.

export const SEGMENT_HANDOFF_PARAM = "segment"
export const SEGMENT_HANDOFF_TAB = "email"
const CAMPAIGNS_PATH = "/admin/campaigns"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface SegmentHandoff {
  /** 저장 세그먼트 id(소문자 UUID) */
  segmentId: string
}

/** 저장 세그먼트 id 인가(UUID 형식). */
export function isSegmentHandoffId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim())
}

/** 메시지 탭 딥링크 — `/admin/campaigns?tab=email&segment=<uuid>`. id 가 UUID 가 아니면 null. */
export function buildSegmentHandoffHref(segmentId: string): string | null {
  if (!isSegmentHandoffId(segmentId)) return null
  const params = new URLSearchParams()
  params.set("tab", SEGMENT_HANDOFF_TAB)
  params.set(SEGMENT_HANDOFF_PARAM, segmentId.trim().toLowerCase())
  return `${CAMPAIGNS_PATH}?${params.toString()}`
}

/** 쿼리스트링(`?…` 또는 `…`)에서 넘김을 읽는다. 없거나 UUID 가 아니면 null. */
export function parseSegmentHandoff(search: string | URLSearchParams): SegmentHandoff | null {
  const params = typeof search === "string" ? new URLSearchParams(search) : search
  const raw = params.get(SEGMENT_HANDOFF_PARAM)?.trim() ?? ""
  if (!isSegmentHandoffId(raw)) return null
  return { segmentId: raw.toLowerCase() }
}

/** segment 파라미터만 지운 쿼리스트링(다른 파라미터·순서 보존, 앞의 ? 없음). */
export function stripSegmentHandoffParams(search: string | URLSearchParams): string {
  const params = new URLSearchParams(typeof search === "string" ? search : search.toString())
  params.delete(SEGMENT_HANDOFF_PARAM)
  return params.toString()
}
