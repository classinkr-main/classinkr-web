/**
 * 팀원별 고정 색상 — 캘린더에서 "이게 누구 건지" 즉시 읽히게 한다.
 *
 * 구글 캘린더의 실패("색깔도 비슷하고 누구 건지가 제대로 안 나와 있어요")를 되풀이하지 않으려고
 * 색상을 해시로 자동 배정하지 않고 손으로 고정한다. 해시 배정은 팀원이 늘 때마다 기존 사람 색이
 * 바뀌고, 인접한 두 명이 비슷한 색을 받는다.
 *
 * 키는 data/team-calendars.json의 name과 정확히 일치해야 한다 —
 * 그 파일의 name이 곧 캘린더 이벤트의 assignee다(lib/team-member-calendars.ts 참조).
 */
export const TEAM_MEMBER_COLORS: Record<string, string> = {
  문준혁: "#084734",
  정규성: "#B85C33",
  신희성: "#0E766E",
  김민재: "#6D4AA8",
  김정무: "#1F4E79",
  이왕찬: "#A8741A",
  황찬우: "#9B2C5D",
  박한: "#3F6212",
  진소망: "#5B6470",
}

export const TEAM_MEMBER_FALLBACK_COLOR = "#A39E98"

export function getTeamMemberColor(name: string | null | undefined): string {
  if (!name) return TEAM_MEMBER_FALLBACK_COLOR
  return TEAM_MEMBER_COLORS[name.trim()] ?? TEAM_MEMBER_FALLBACK_COLOR
}
