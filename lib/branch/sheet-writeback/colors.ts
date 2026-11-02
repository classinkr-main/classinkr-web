// REV 주차 칸 글자색 ↔ 확도 — 순수 모듈(클라이언트 겸용).
//
// 판정 임계는 lib/branch/google-sheets.ts 의 isRedText/isBlueText 와 같은 식이다. google-sheets 는
// server-only 라 여기서 import 할 수 없으므로 판정 정본을 이 파일에 두고, google-sheets.ts 가 이 파일을
// 재수출하도록 바꾼다(parser 그룹 몫 — 바꾼 뒤에는 사본이 하나만 남는다).
//
// 쓰는 색은 정확히 세 가지다: 확정 {1,0,0} · 고확도 {0,0,1} · 예정 {0,0,0}. 두 앱의 읽기 판정
// (Home r≥0.75·g≤0.3·b≤0.3 / Compass r>0.7·g<0.3·b<0.3)을 모두 확실히 통과한다.

export interface RgbColor {
  red?: number
  green?: number
  blue?: number
}

/** 빨강(확정) · 파랑(고확도) · 검정(예정 — 색 없음 포함). */
export type WeekColor = "r" | "b" | "k"
export type DraftConfidenceLike = "expected" | "high-confidence" | "confirmed"

// REV 시트 운영 규칙: 금액의 글자색 빨강 = 확정 매출. 고객명 칸의 갈색(#B45F06, r0.71/g0.37)은
// 제외해야 하므로 green 상한을 0.3 으로 둔다.
export function isRedText(fg: RgbColor | null | undefined): boolean {
  if (!fg) return false
  return (fg.red ?? 0) >= 0.75 && (fg.green ?? 0) <= 0.3 && (fg.blue ?? 0) <= 0.3
}

// 글자색 파랑 = 클로징 임박(90%+). 기본 파랑(#0000FF)과 구글 기본 블루(#1155CC, #4A86E8) 계열.
export function isBlueText(fg: RgbColor | null | undefined): boolean {
  if (!fg) return false
  const red = fg.red ?? 0
  const green = fg.green ?? 0
  const blue = fg.blue ?? 0
  return blue >= 0.5 && blue - red >= 0.25 && blue - green >= 0.15
}

export function weekColorOf(fg: RgbColor | null | undefined): WeekColor {
  if (isRedText(fg)) return "r"
  if (isBlueText(fg)) return "b"
  return "k"
}

export function rgbForWeekColor(color: WeekColor): { red: number; green: number; blue: number } {
  if (color === "r") return { red: 1, green: 0, blue: 0 }
  if (color === "b") return { red: 0, green: 0, blue: 1 }
  return { red: 0, green: 0, blue: 0 }
}

export function weekColorForConfidence(c: DraftConfidenceLike): WeekColor {
  if (c === "confirmed") return "r"
  if (c === "high-confidence") return "b"
  return "k"
}

export function colorForConfidence(c: DraftConfidenceLike): { red: number; green: number; blue: number } {
  return rgbForWeekColor(weekColorForConfidence(c))
}

export function confidenceForColor(c: WeekColor): DraftConfidenceLike {
  if (c === "r") return "confirmed"
  if (c === "b") return "high-confidence"
  return "expected"
}

export function isWeekColor(v: unknown): v is WeekColor {
  return v === "r" || v === "b" || v === "k"
}

/** "high_confidence"(DB 생성 칼럼 표기)도 받아 들인다. 모르는 값은 null. */
export function parseDraftConfidence(v: unknown): DraftConfidenceLike | null {
  if (typeof v !== "string") return null
  const normalized = v.trim().toLowerCase().replace(/_/g, "-")
  if (normalized === "expected" || normalized === "high-confidence" || normalized === "confirmed") return normalized
  return null
}
