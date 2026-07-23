// lib/marketing/project-sanitize.ts
// 마케팅 프로젝트(D3) API 입력 정규화 — 순수 함수(부수효과·DB 접근 없음).
// route.ts / [id]/route.ts 가 여기서 import 해 자기 파일에서 re-export 한다
// → 단위테스트는 각 라우트 파일에서 sanitizer 를 가져온다(campaign-sanitize.ts 와 동일 관행).
//
// campaign-sanitize.ts 와 동형이나 프로젝트는 channels/projectId 필드가 없고,
// status 기본값이 "active" 다(DB DEFAULT 'active' · createProject 기본값과 일치).
//
// 정책:
//  - 하드 게이트(→ null 로 입력 전체 거부): name 빈값 · status 미허용 enum · budget 음수/비정수.
//    잘못된 입력을 조용히 기본값으로 삼키지 않고 400 으로 노출한다.
//  - 강제 정규화: 파싱 불가한 날짜 → null(미지정) · 문자열 트림.

import { CAMPAIGN_STATUSES, type ProjectStatus } from "@/lib/types/marketing-campaign"
import type {
  CreateProjectInput,
  UpdateProjectInput,
} from "@/lib/repositories/marketing-projects"

/* ── 필드 프리미티브 ─────────────────────────────────────────── */

// 문자열이면 트림, 빈값이면 null. (objective/owner 처럼 nullable 텍스트용)
function trimmedOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null
  const t = value.trim()
  return t.length > 0 ? t : null
}

// 날짜: 문자열이며 Date.parse 가능해야 유효. 그 외(비문자·미파싱·빈값)는 null(미지정).
function sanitizeDate(value: unknown): string | null {
  if (typeof value !== "string") return null
  const t = value.trim()
  if (!t) return null
  return Number.isNaN(Date.parse(t)) ? null : t
}

// ProjectStatus = CampaignStatus 이므로 런타임 목록도 CAMPAIGN_STATUSES 를 공유(중복 리터럴 금지).
function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && (CAMPAIGN_STATUSES as string[]).includes(value)
}

// budget 판정: 정수≥0 → number, 명시적 null/미지정 → null, 그 외(음수·비정수·비수치) → "invalid".
type BudgetVerdict = number | null | "invalid"
function verdictBudget(value: unknown): BudgetVerdict {
  if (value === undefined || value === null) return null
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return "invalid"
  return value
}

/* ── 프로젝트 생성 입력 ──────────────────────────────────────── */

export function sanitizeProjectInput(body: unknown): CreateProjectInput | null {
  if (!body || typeof body !== "object") return null
  const b = body as Record<string, unknown>

  // name — 하드 게이트.
  const name = typeof b.name === "string" ? b.name.trim() : ""
  if (!name) return null

  // status — 미지정이면 active(프로젝트 기본값), 제공됐는데 미허용이면 거부.
  let status: ProjectStatus = "active"
  if (b.status !== undefined && b.status !== null) {
    if (!isProjectStatus(b.status)) return null
    status = b.status
  }

  // budget — 음수/비정수면 거부.
  const budget = verdictBudget(b.budget)
  if (budget === "invalid") return null

  return {
    name,
    objective: trimmedOrNull(b.objective),
    status,
    startsAt: sanitizeDate(b.startsAt),
    endsAt: sanitizeDate(b.endsAt),
    budget,
    owner: trimmedOrNull(b.owner),
  }
}

/* ── 프로젝트 부분 수정 입력 ─────────────────────────────────── */

// 제공된 키만 담는다. 잘못된 값(빈 name·미허용 status·음수 budget)은 null 로 거부.
// 빈 패치({})는 유효값 — 무변경 처리는 라우트가 담당한다.
export function sanitizeProjectPatch(body: unknown): UpdateProjectInput | null {
  if (!body || typeof body !== "object") return null
  const b = body as Record<string, unknown>
  const patch: UpdateProjectInput = {}

  if ("name" in b) {
    if (typeof b.name !== "string" || !b.name.trim()) return null
    patch.name = b.name.trim()
  }
  if ("objective" in b) patch.objective = trimmedOrNull(b.objective)
  if ("status" in b) {
    if (!isProjectStatus(b.status)) return null
    patch.status = b.status
  }
  if ("startsAt" in b) patch.startsAt = sanitizeDate(b.startsAt)
  if ("endsAt" in b) patch.endsAt = sanitizeDate(b.endsAt)
  if ("budget" in b) {
    const verdict = verdictBudget(b.budget)
    if (verdict === "invalid") return null
    patch.budget = verdict
  }
  if ("owner" in b) patch.owner = trimmedOrNull(b.owner)

  return patch
}
