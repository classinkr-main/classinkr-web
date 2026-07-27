// lib/marketing/campaign-sanitize.ts
// 크로스채널 캠페인(D1) API 입력 정규화 — 순수 함수(부수효과·DB 접근 없음).
// 세 라우트(route.ts / [id]/route.ts / [id]/links/route.ts)가 여기서 import 해
// 자기 파일에서 re-export 한다 → 단위테스트는 각 라우트 파일에서 sanitizer 를 가져온다.
//
// 정책:
//  - 하드 게이트(→ null 로 입력 전체 거부): name 빈값 · status 미허용 enum ·
//    budget 음수/비정수 · refType 미허용 · refId 빈값. 잘못된 입력을 조용히 기본값으로
//    삼키지 않고 400 으로 노출시키기 위함(리드·동의처럼 무음 실패 금지 기조).
//  - 강제 정규화(필드 코어싱): 파싱 불가한 날짜 → null(= 미지정) · channels 비문자 제거 ·
//    문자열 트림. 날짜 오타는 캠페인 생성을 죽이지 않고 "미지정"으로 흡수한다.

import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_REF_TYPES,
  type CampaignStatus,
  type CampaignRefType,
} from "@/lib/types/marketing-campaign"
import type {
  CreateCampaignInput,
  UpdateCampaignInput,
} from "@/lib/repositories/marketing-campaigns"

/* ── 필드 프리미티브 ─────────────────────────────────────────── */

// 문자열이면 트림, 빈값이면 null. (objective/owner/projectId 처럼 nullable 텍스트용)
function trimmedOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null
  const t = value.trim()
  return t.length > 0 ? t : null
}

// 날짜: 문자열이며 Date.parse 가능해야 유효. 그 외(비문자·미파싱·빈값)는 null(미지정).
// DATE 컬럼은 시간 부분을 절삭하므로 입력 문자열을 그대로 보존한다.
function sanitizeDate(value: unknown): string | null {
  if (typeof value !== "string") return null
  const t = value.trim()
  if (!t) return null
  return Number.isNaN(Date.parse(t)) ? null : t
}

// channels: 배열이 아니면 []. 문자열만 남기고 트림·빈값 제거(정보성 선언 채널).
function sanitizeChannels(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
}

// status enum 판정(런타임 SSOT 배열 기준).
function isCampaignStatus(value: unknown): value is CampaignStatus {
  return typeof value === "string" && (CAMPAIGN_STATUSES as string[]).includes(value)
}

// budget 판정 결과: 정수≥0 → number, 명시적 null → null, 그 외(음수·비정수·비수치) → "invalid".
type BudgetVerdict = number | null | "invalid"
function verdictBudget(value: unknown): BudgetVerdict {
  if (value === undefined || value === null) return null
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return "invalid"
  return value
}

/* ── 캠페인 생성 입력 ────────────────────────────────────────── */

export function sanitizeCampaignInput(body: unknown): CreateCampaignInput | null {
  if (!body || typeof body !== "object") return null
  const b = body as Record<string, unknown>

  // name — 하드 게이트.
  const name = typeof b.name === "string" ? b.name.trim() : ""
  if (!name) return null

  // status — 미지정이면 planned, 제공됐는데 미허용이면 거부.
  let status: CampaignStatus = "planned"
  if (b.status !== undefined && b.status !== null) {
    if (!isCampaignStatus(b.status)) return null
    status = b.status
  }

  // budget — 음수/비정수면 거부.
  const budget = verdictBudget(b.budget)
  if (budget === "invalid") return null

  return {
    name,
    objective: trimmedOrNull(b.objective),
    status,
    channels: sanitizeChannels(b.channels),
    startsAt: sanitizeDate(b.startsAt),
    endsAt: sanitizeDate(b.endsAt),
    budget,
    owner: trimmedOrNull(b.owner),
    projectId: trimmedOrNull(b.projectId),
  }
}

/* ── 캠페인 부분 수정 입력 ───────────────────────────────────── */

// 제공된 키만 담는다. 잘못된 값(빈 name·미허용 status·음수 budget)은 null 로 거부.
// 빈 패치({})는 유효값 — 무변경 처리는 라우트가 담당한다.
export function sanitizeCampaignPatch(body: unknown): UpdateCampaignInput | null {
  if (!body || typeof body !== "object") return null
  const b = body as Record<string, unknown>
  const patch: UpdateCampaignInput = {}

  if ("name" in b) {
    if (typeof b.name !== "string" || !b.name.trim()) return null
    patch.name = b.name.trim()
  }
  if ("objective" in b) patch.objective = trimmedOrNull(b.objective)
  if ("status" in b) {
    if (!isCampaignStatus(b.status)) return null
    patch.status = b.status
  }
  if ("channels" in b) patch.channels = sanitizeChannels(b.channels)
  if ("startsAt" in b) patch.startsAt = sanitizeDate(b.startsAt)
  if ("endsAt" in b) patch.endsAt = sanitizeDate(b.endsAt)
  if ("budget" in b) {
    const verdict = verdictBudget(b.budget)
    if (verdict === "invalid") return null
    patch.budget = verdict
  }
  if ("owner" in b) patch.owner = trimmedOrNull(b.owner)
  if ("projectId" in b) patch.projectId = trimmedOrNull(b.projectId)

  return patch
}

/* ── 링크 입력 ───────────────────────────────────────────────── */

export function sanitizeLinkInput(
  body: unknown,
): { refType: CampaignRefType; refId: string } | null {
  if (!body || typeof body !== "object") return null
  const b = body as Record<string, unknown>
  if (typeof b.refType !== "string" || !(CAMPAIGN_REF_TYPES as string[]).includes(b.refType)) {
    return null
  }
  const refId = typeof b.refId === "string" ? b.refId.trim() : ""
  if (!refId) return null
  return { refType: b.refType as CampaignRefType, refId }
}
