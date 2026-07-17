// 팀 아이덴티티 색 토큰 SSOT — DESIGN.md "Team Identity 색" 절과 1:1.
// BD/MKT/CSM 팀 구분색의 유일한 정본. 뱃지·라벨·범례 등 "이게 어느 팀 것인가"를
// 표시할 때만 쓴다 — 상태(정상/부족 등)·확도(확정/고확도/예정)·페이싱 등급 같은
// 의미 축에는 절대 재사용하지 않는다(그 축은 DESIGN.md §2 Status 스케일 또는
// lib/branch/confidence-tokens.ts를 쓴다).
//
// BD(#084734)·CSM(#A8741A)은 각각 Status 축의 Success·Warning과 값이 겹치지만,
// 이는 "팀 색이 상태 색을 겸한다"는 뜻이 아니라 같은 팔레트에서 고른 결과일 뿐이다.
// MKT(#7B8B36, 올리브)만 Status 스케일에 대응이 없는 진짜 예외 토큰이며, 이 파일이
// 그 유일한 SSOT다 — confidence-tokens.ts가 #1E5DA8을 "확도 신호 전용 예외"로
// 공식화한 것과 같은 패턴으로, MKT 올리브를 "팀 아이덴티티 전용 예외"로 공식화한다.
// 다른 곳에서 "#7B8B36" 리터럴을 재정의하지 않는다 — scripts/check-design-tokens.mjs가
// 이 파일 밖의 신규 리터럴을 차단한다.

export type TeamKey = "BD" | "MKT" | "CSM"

export interface TeamColorToken {
  key: TeamKey
  label: string
  /** 팀 색 — 뱃지 글자, 범례 도트, 라벨 강조에 사용. */
  color: string
  /** 틴트 배경(hex) — 뱃지·칩 배경. */
  tintBg: string
  /** 틴트 보더(hex) — 뱃지·칩 보더. */
  tintBorder: string
}

export const TEAM_COLORS: Record<TeamKey, TeamColorToken> = {
  BD: {
    key: "BD",
    label: "BD",
    color: "#084734", // Status Success 축과 값이 겹침(우연) — 팀 색으로서 독립적으로 관리
    tintBg: "#ECFDF5",
    tintBorder: "#BDEFD8",
  },
  MKT: {
    key: "MKT",
    label: "MKT",
    color: "#7B8B36", // 냉색 금지·Status 3색 어디에도 없는 팀 아이덴티티 전용 예외 토큰
    tintBg: "#F1F4DE",
    tintBorder: "#DCE3B7",
  },
  CSM: {
    key: "CSM",
    label: "CSM",
    color: "#A8741A", // Status Warning 축과 값이 겹침(우연) — 팀 색으로서 독립적으로 관리
    tintBg: "#FBF1E0",
    tintBorder: "#ECD29C",
  },
}

/** team 문자열(느슨한 입력 포함)을 팀 색 hex로. 미매칭 시 중립 텍스트 회색으로 폴백. */
export function teamColorOf(team: string | null | undefined, fallback = "#615D59"): string {
  if (!team) return fallback
  return TEAM_COLORS[team as TeamKey]?.color ?? fallback
}
