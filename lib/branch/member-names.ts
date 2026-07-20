const MEMBER_NAME_ALIASES: Record<string, string> = {
  "new 2": "Minjae",
  minjae: "Minjae",
  somang: "Somang",
}

export function normalizeBranchMemberName(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return MEMBER_NAME_ALIASES[trimmed.toLowerCase()] ?? trimmed
}

// 매니저 영문 정규명 → 한글 이름 별칭(전체명 + 이름만). 한글/영문 교차 검색용.
// 출처: data/team-calendars.json — 박한=Han · 문준혁=Junhyuk · 진소망=Somang · 이왕찬=Wangchan · 김민재=Minjae.
const MEMBER_KOREAN_ALIASES: Record<string, string[]> = {
  Han: ["박한", "한"],
  Junhyuk: ["문준혁", "준혁"],
  Somang: ["진소망", "소망"],
  Wangchan: ["이왕찬", "왕찬"],
  Minjae: ["김민재", "민재"],
}

/**
 * 매니저명의 검색용 문자열 — 원문·영문 정규명·한글 별칭을 공백으로 이어 소문자로 반환한다.
 * 부분일치 검색(query.includes) 대상: "Wangchan"·"wangchan"·"WangChan"·"이왕찬"·"왕찬"이 모두 매칭된다.
 */
export function branchMemberSearchHaystack(value: string | null | undefined): string {
  const raw = value?.trim() ?? ""
  if (!raw) return ""
  const canonical = normalizeBranchMemberName(raw) ?? raw
  const korean = MEMBER_KOREAN_ALIASES[canonical] ?? []
  return [raw, canonical, ...korean].join(" ").toLowerCase()
}
