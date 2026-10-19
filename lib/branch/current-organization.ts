/** 현재 조직과 과거 장부의 팀 키를 분리한다. 조직 변경으로 과거 매출을 재귀속하지 않는다. */
export const CURRENT_BRANCH_TEAMS = ["BD", "MKT"] as const;
export const LEGACY_BRANCH_TEAMS = ["CSM"] as const;
export type CurrentBranchTeam = typeof CURRENT_BRANCH_TEAMS[number];
/** 영업 활동 시트가 현재 평가 근거인 팀. MKT 과정지표는 Compass가 소유한다. */
export const SHEET_KPI_ACTIVE_TEAMS: ReadonlySet<string> = new Set(["BD"]);

export function isCurrentBranchTeam(team: string | null | undefined): team is CurrentBranchTeam {
  return CURRENT_BRANCH_TEAMS.some((current) => current === team);
}

export function isLegacyBranchTeam(team: string | null | undefined): team is typeof LEGACY_BRANCH_TEAMS[number] {
  return LEGACY_BRANCH_TEAMS.some((legacy) => legacy === team);
}

export function branchTeamLabel(team: string): string {
  return team === "ALL" ? "KR 전체" : isLegacyBranchTeam(team) ? team + " · 이전 조직 이력" : team;
}

/** 신규 입력은 현재 팀으로 시작하고 기존 기록의 팀 값은 변경하지 않는다. */
export function defaultBranchDraftTeam(team: string): CurrentBranchTeam {
  return isCurrentBranchTeam(team) ? team : "BD";
}

export function branchDraftTeamOptions(existing: string): string[] {
  return existing && existing !== "ALL" && !isCurrentBranchTeam(existing)
    ? [...CURRENT_BRANCH_TEAMS, existing]
    : [...CURRENT_BRANCH_TEAMS];
}
