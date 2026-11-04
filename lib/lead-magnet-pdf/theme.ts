// 리드마그넷 PDF 지면·색·글자 크기. 색 정본은 DESIGN.md §2 — CSS 변수를 못 읽는 소비처라
// 손 미러 lib/design-tokens.ts 를 쓴다(미러가 바뀌면 PDF 도 따라간다).
// 미러에 없는 두 값만 여기서 숫자로 적는다:
//   - Classin Green(DESIGN.md §2 Primary, 어드민·인쇄용 짙은 그린 #084734) — PDF 의 유일한 포화색
//   - 헤어라인 불투명 등가(DESIGN.md §2 헤어라인 보더 토큰, #E8E8E4) — 겹침에도 진해지지 않는 선
import { color as tokens } from "@/lib/design-tokens"

export type Rgb = readonly [number, number, number]

function hexToRgb(hex: string): Rgb {
  const value = hex.replace(/^#/, "")
  return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255) as unknown as Rgb
}

function rgb255(r: number, g: number, b: number): Rgb {
  return [r / 255, g / 255, b / 255]
}

export const PDF_COLORS = {
  green: rgb255(8, 71, 52),
  ink: hexToRgb(tokens.ink),
  body: hexToRgb(tokens.fgBody),
  muted: hexToRgb(tokens.fgMuted),
  paper: hexToRgb(tokens.paper),
  sheet: hexToRgb(tokens.sheet),
  sunken: hexToRgb(tokens.sunken),
  /** 체크 칸·기입 밑줄 — 인쇄본에서 손으로 채우는 자리는 조작 경계다. */
  control: hexToRgb(tokens.lineControl),
  hair: rgb255(232, 232, 228),
} as const

/** A4(pt). */
export const PAGE = {
  width: 595.28,
  height: 841.89,
  marginX: 56,
  /** 본문이 시작하는 높이(머리글 아래). */
  top: 841.89 - 78,
  /** 본문이 끝나는 높이(바닥글 위). */
  bottom: 70,
  headerBaseline: 841.89 - 38,
  headerRule: 841.89 - 50,
  footerRule: 50,
  footerBaseline: 34,
} as const

export const CONTENT_WIDTH = PAGE.width - PAGE.marginX * 2

/** 글자 크기(pt)와 행간. DESIGN.md §3 의 위계(제목 600, 본문 400)를 인쇄 크기로 옮긴 값. */
export const TYPE = {
  coverTitle: { size: 28, leading: 37 },
  coverSubtitle: { size: 13.5, leading: 21 },
  heading: { size: 19, leading: 26 },
  subheading: { size: 12.5, leading: 18 },
  lede: { size: 10.6, leading: 17 },
  body: { size: 10.2, leading: 16 },
  small: { size: 9.4, leading: 14.5 },
  caption: { size: 8.6, leading: 13 },
  kicker: { size: 8.4, leading: 12 },
  folio: { size: 7.8, leading: 10 },
} as const

export const SPACE = {
  /** 절 머리(킥커+제목) 밑에 최소한 붙어 있어야 할 본문 높이 — 고아 제목 방지. */
  keepWithHeading: 96,
  /** 소제목 밑 최소 본문 높이. */
  keepWithSubheading: 44,
  blockGap: 10,
  sectionGap: 22,
} as const
