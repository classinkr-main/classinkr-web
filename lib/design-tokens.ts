// lib/design-tokens.ts — tokens.css 의 손 미러. CSS 변수를 못 읽는 소비처 전용.
// 값을 바꾸면 tokens.css 와 같은 커밋에서 바꾼다. tests/lib/design-tokens.test.ts 가 대조한다.
export const color = {
  paper: "#FAFAF8",       // --surface-paper
  sheet: "#FFFFFF",       // --surface-sheet
  sunken: "#F6F5F4",      // --surface-sunken
  ink: "#111110",         // --surface-ink
  fgBody: "#31302E",      // --fg-body
  fgMuted: "#615D59",     // --fg-muted
  accent: "#084734",      // --fg-accent
  onAccent: "#FAFAF8",    // --fg-on-accent
  lineControl: "#8F8A84", // --line-control
  danger: "#B43E3E",      // --fg-danger
} as const
