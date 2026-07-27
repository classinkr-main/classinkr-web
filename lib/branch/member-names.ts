const MEMBER_NAME_ALIASES: Record<string, string> = {
  "new 2": "Minjae",
  minjae: "Minjae",
  somang: "Somang",
  // 황찬우 — 시트가 성(Hwang)으로 기재하지만 표기 정본은 이름(Chanwoo)이다(2026-07-27 확정).
  // 다른 멤버는 전부 이름 표기라 성 표기가 섞이면 같은 사람이 두 명으로 보인다.
  hwang: "Chanwoo",
}

export function normalizeBranchMemberName(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return MEMBER_NAME_ALIASES[trimmed.toLowerCase()] ?? trimmed
}

// 매니저 영문 정규명 → 한글 이름 별칭(전체명 + 이름만). 한글/영문 교차 검색용.
// 출처: data/team-calendars.json — 박한=Han · 문준혁=Junhyuk · 진소망=Somang · 이왕찬=Wangchan · 김민재=Minjae · 황찬우=Chanwoo.
const MEMBER_KOREAN_ALIASES: Record<string, string[]> = {
  Han: ["박한", "한"],
  Junhyuk: ["문준혁", "준혁"],
  Somang: ["진소망", "소망"],
  Wangchan: ["이왕찬", "왕찬"],
  Minjae: ["김민재", "민재"],
  Chanwoo: ["황찬우", "찬우"],
}

// M14 — 한글 별칭 조회를 canonical의 대소문자와 무관하게 하기 위한 소문자 키 보조 인덱스.
// Han/Junhyuk/Wangchan/Chanwoo는 MEMBER_NAME_ALIASES에 항목이 없어 canonical이 저장 원문의
// 대소문자를 그대로 유지한다 — 매니저가 소문자 "wangchan"으로 저장되면 정규 대문자 키("Wangchan")
// 직접 조회가 빗나가 "이왕찬"/"왕찬" 한글 별칭이 매칭되지 않던 버그를 없앤다.
const MEMBER_KOREAN_ALIASES_BY_LOWER: Record<string, string[]> = Object.fromEntries(
  Object.entries(MEMBER_KOREAN_ALIASES).map(([canonical, aliases]) => [canonical.toLowerCase(), aliases]),
)

/**
 * 매니저명의 검색용 문자열 — 원문·영문 정규명·한글 별칭을 공백으로 이어 소문자로 반환한다.
 * 부분일치 검색(query.includes) 대상: "Wangchan"·"wangchan"·"WangChan"·"이왕찬"·"왕찬"이 모두 매칭된다.
 * 한글 별칭 조회는 canonical을 소문자로 정규화해 대소문자 저장 편차(예: "wangchan")에도 걸린다.
 */
export function branchMemberSearchHaystack(value: string | null | undefined): string {
  const raw = value?.trim() ?? ""
  if (!raw) return ""
  const canonical = normalizeBranchMemberName(raw) ?? raw
  const korean = MEMBER_KOREAN_ALIASES_BY_LOWER[canonical.toLowerCase()] ?? []
  return [raw, canonical, ...korean].join(" ").toLowerCase()
}
