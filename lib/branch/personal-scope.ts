import type { DshOutput } from "./parsers/dsh"
import { normalizeBranchMemberName } from "./member-names"
import { isCurrentBranchTeam, isLegacyBranchTeam } from "./current-organization"

export const UNMAPPED_BRANCH_MEMBER = "__unmapped_current_user__"

export function branchManagerLabel(value: string) {
  return value === UNMAPPED_BRANCH_MEMBER ? "내 담당 · 계정 연결 필요" : value
}

export function branchManagerMatches(value: string | null | undefined, manager: string) {
  return normalizeBranchMemberName(value)?.toLowerCase() === normalizeBranchMemberName(manager)?.toLowerCase()
}

/** 개인 목표는 승인된 개인 행만 쓴다. 팀·전사 목표나 분해 비율을 대신 배정하지 않는다. */
export function scopeDshToManager(dsh: DshOutput, manager?: string | null): DshOutput {
  if (!manager) return dsh
  const rows = dsh.rows.filter((row) => row.level === "member" && branchManagerMatches(row.member, manager))
  const members = Object.fromEntries(Object.entries(dsh.members).filter(([name]) => branchManagerMatches(name, manager)))
  return {
    rows: [...rows, ...rows.map((row) => ({ ...row, level: "team" as const, team: "ALL", member: undefined }))],
    members,
    breakdown: [],
  }
}

/** 빈 담당·특정 팀은 명시적 전체 보기다. 기본 ALL 팀·기간·탭 링크는 개인 기본값을 유지한다. */
export function initialBranchManager(params: Pick<URLSearchParams, "has" | "get">, ownManager: string) {
  if (params.has("mgr")) return params.get("mgr") === "__me" ? ownManager : normalizeBranchMemberName(params.get("mgr")) ?? ""
  const team = params.get("team")
  if (isCurrentBranchTeam(team) || isLegacyBranchTeam(team)) return ""
  return ownManager
}
