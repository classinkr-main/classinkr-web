/**
 * 공유 카드(OG·트위터) 이미지 템플릿 — 루트 `app/opengraph-image.tsx`(홈·기본 카드)와 블로그 `/api/og/blog/[slug]` 가 쓴다.
 *
 * 디자인: C′ 로고 액자(DESIGN.md §9 V22, 2026-11-06 운영자 선택). 초록 0.
 * - 지면 sunken, 안쪽 60px 에 2px 먹 머리카락 액자. 아래 선은 가운데가 끊기고 그 틈에 주소 한 줄이 선 높이에 앉는다.
 * - 홈: 액자 광학 중심에 먹 단색 공식 락업(마크 + 워드마크) 하나. 글자 없음.
 * - 블로그: 같은 액자·축에 락업에서 창으로 잘라 낸 새 마크 → 범주 → 제목 2줄.
 * 로고는 assets/og/classin-lockup-ink.png(공식 래스터를 먹으로 채운 것, scripts/build-og-lockup.mjs)만 쓰고 다시 그리지 않는다.
 * 글꼴은 Pretendard 정적 OTF 400·700(typography §2-1 C28). 색은 CSS 변수를 못 읽으므로 `lib/design-tokens.ts` 미러만 쓴다.
 * 카카오톡 미리보기는 1200px 을 280px 안팎으로 줄인다 — 액자·로고·제목 크기는 그 크기에서 읽히게 정했다.
 */

import { readFile } from "node:fs/promises"
import path from "node:path"

import { ImageResponse } from "next/og"

import { color } from "@/lib/design-tokens"
import { fitLine, fitTitle } from "@/lib/og/fit-text"

export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const
export const OG_IMAGE_CONTENT_TYPE = "image/png"

const W = OG_IMAGE_SIZE.width
const H = OG_IMAGE_SIZE.height
const FONT_DIR = path.join(process.cwd(), "assets/fonts/pretendard-static")
const LOGO_FILE = path.join(process.cwd(), "assets/og/classin-lockup-ink.png")
const FONT_FAMILY = "Pretendard"
const SITE_HOST = "classin.co.kr"

/* 액자 — 홈·블로그 같은 값. 넉넉한 바깥 여백이 매트 역할을 하고, 카톡 2:1 자름·위아래 30px 바깥에 놓인다 */
const INSET = 60
const HAIR = 2
const FRAME_COLOR = "rgba(17,17,16,0.18)"
/** 아래 액자선 틈: 주소 폭(약 120px) + 양옆 숨 */
const GAP = 184
const CAPTION_SIZE = 22

/* 홈 락업 — 휴대폰 280px 카드에서 약 54px, 워드마크까지 읽힌다. 기하 중심보다 조금 위(광학 중심) */
const LOGO_H = 232
const LOGO_LIFT = 8

/* 블로그 */
/** 락업 래스터(797×524) 안의 새 마크 영역(알파 기준 측정 + 안티앨리어싱 여유) */
const BIRD = { x: 60, y: 0, w: 678, h: 250 }
const MARK_H = 56
/** 덩어리 위아래 중심을 홈 락업(약 y=307)과 맞추는 들어올림 */
const BLOCK_LIFT = 2
const KICKER_SIZE = 28
/** 새 마크 → 범주는 넉넉히, 범주 → 제목은 붙여 범주가 제목의 머리말로 읽히게 */
const KICKER_GAP = 40
const TITLE_GAP = 14
const TITLE_SIZE = 64
const TITLE_LINE_HEIGHT = 1.3
/** 제목 한 줄 최대 폭(맞춤 계산용). 줄 상자는 좌우 96px 안쪽이라 폭 어림 오차를 흡수한다 */
const TITLE_MEASURE = 936
const KICKER_MEASURE = 720
const LINE_BOX = W - 96 * 2

type OgFont = { name: string; data: Buffer; weight: 400 | 700; style: "normal" }
type OgLogo = { src: string; width: number; height: number }

// 인스턴스당 한 번만 읽는다(블로그 경로는 요청마다 다시 읽지 않는다). 실패하면 다음 요청이 다시 시도한다.
let fontsPromise: Promise<OgFont[]> | null = null
let logoPromise: Promise<OgLogo> | null = null

export function loadOgFonts(): Promise<OgFont[]> {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      readFile(path.join(FONT_DIR, "Pretendard-Regular.otf")),
      readFile(path.join(FONT_DIR, "Pretendard-Bold.otf")),
    ])
      .then(([regular, bold]): OgFont[] => [
        { name: FONT_FAMILY, data: regular, weight: 400, style: "normal" },
        { name: FONT_FAMILY, data: bold, weight: 700, style: "normal" },
      ])
      .catch((error: unknown) => {
        fontsPromise = null
        throw error
      })
  }
  return fontsPromise
}

/** 먹 단색 락업. 크기는 PNG 머리(IHDR)에서 읽어 스크립트로 다시 만들어도 비율이 맞는다 */
export function loadOgLogo(): Promise<OgLogo> {
  if (!logoPromise) {
    logoPromise = readFile(LOGO_FILE)
      .then((png) => ({
        src: `data:image/png;base64,${png.toString("base64")}`,
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
      }))
      .catch((error: unknown) => {
        logoPromise = null
        throw error
      })
  }
  return logoPromise
}

const LINE_Y = H - INSET - HAIR

/** 액자 + 아래 선 틈의 주소. 반투명 선이 겹쳐 귀가 진해지지 않게 맞대기만 한다(Satori 는 right/bottom 이 불안정해 left/top 만 쓴다) */
function PlateFrame() {
  const sideHeight = LINE_Y - INSET - HAIR
  const segment = (W - INSET * 2 - GAP) / 2
  const line = { position: "absolute" as const, display: "flex", backgroundColor: FRAME_COLOR }

  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, display: "flex" }}>
      <div style={{ ...line, left: INSET, top: INSET, width: W - INSET * 2, height: HAIR }} />
      <div style={{ ...line, left: INSET, top: INSET + HAIR, width: HAIR, height: sideHeight }} />
      <div style={{ ...line, left: W - INSET - HAIR, top: INSET + HAIR, width: HAIR, height: sideHeight }} />
      <div style={{ ...line, left: INSET, top: LINE_Y, width: segment, height: HAIR }} />
      <div style={{ ...line, left: W - INSET - segment, top: LINE_Y, width: segment, height: HAIR }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: LINE_Y + HAIR / 2 - 16,
          width: W,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: CAPTION_SIZE, fontWeight: 400, lineHeight: 1, color: color.fgMuted }}>{SITE_HOST}</span>
      </div>
    </div>
  )
}

function Plate({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        position: "relative",
        backgroundColor: color.sunken,
        fontFamily: FONT_FAMILY,
      }}
    >
      <PlateFrame />
      {children}
    </div>
  )
}

/** 홈·기본 카드: 락업 하나 */
export function LogoPlateCard({ logo }: { logo: OgLogo }) {
  const logoWidth = Math.round((logo.width / logo.height) * LOGO_H)
  const logoTop = Math.round(H / 2 - LOGO_H / 2 - LOGO_LIFT)

  return (
    <Plate>
      <div style={{ position: "absolute", left: 0, top: logoTop, width: W, display: "flex", justifyContent: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori(ImageResponse)는 next/image 를 그리지 못한다 */}
        <img src={logo.src} alt="" width={logoWidth} height={LOGO_H} />
      </div>
    </Plate>
  )
}

/** 락업에서 새 마크만 창으로 보여 준다(다시 그리지 않는다) */
function BirdMark({ logo }: { logo: OgLogo }) {
  const scale = MARK_H / BIRD.h
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        overflow: "hidden",
        width: Math.round(BIRD.w * scale),
        height: MARK_H,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori(ImageResponse)는 next/image 를 그리지 못한다 */}
      <img
        src={logo.src}
        alt=""
        width={Math.round(logo.width * scale)}
        height={Math.round(logo.height * scale)}
        style={{ position: "absolute", left: -Math.round(BIRD.x * scale), top: -Math.round(BIRD.y * scale) }}
      />
    </div>
  )
}

export interface TitlePlateContent {
  /** 제목 위 조용한 한 줄(블로그 카테고리). 비면 생략 */
  kicker?: string
  title: string
}

/** 블로그 카드: 같은 액자·가운데 축에 새 마크 → 범주 → 제목 2줄 */
export function TitlePlateCard({ logo, kicker, title }: TitlePlateContent & { logo: OgLogo }) {
  const lines = fitTitle(title, TITLE_SIZE, TITLE_MEASURE)
  const kickerText = kicker?.trim() ? fitLine(kicker, KICKER_SIZE, KICKER_MEASURE) : ""

  return (
    <Plate>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: INSET + HAIR - BLOCK_LIFT,
          width: W,
          height: H - INSET * 2 - HAIR * 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <BirdMark logo={logo} />
        {kickerText ? (
          <div style={{ marginTop: KICKER_GAP, display: "flex", width: LINE_BOX, justifyContent: "center", overflow: "hidden" }}>
            <span style={{ fontSize: KICKER_SIZE, fontWeight: 400, lineHeight: 1, whiteSpace: "nowrap", color: color.fgMuted }}>
              {kickerText}
            </span>
          </div>
        ) : null}
        <div style={{ marginTop: TITLE_GAP, display: "flex", flexDirection: "column", alignItems: "center" }}>
          {lines.map((line, index) => (
            // 줄마다 따로 가운데. 폭 어림이 빗나가 넘쳐도 양옆이 같이 잘려 축과 96px 여백은 지켜진다
            <div key={index} style={{ display: "flex", width: LINE_BOX, justifyContent: "center", overflow: "hidden" }}>
              <span
                style={{
                  fontSize: TITLE_SIZE,
                  fontWeight: 700,
                  lineHeight: TITLE_LINE_HEIGHT,
                  whiteSpace: "nowrap",
                  color: color.ink,
                }}
              >
                {line}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Plate>
  )
}

export async function renderHomeOgImage(): Promise<ImageResponse> {
  const [fonts, logo] = await Promise.all([loadOgFonts(), loadOgLogo()])
  return new ImageResponse(<LogoPlateCard logo={logo} />, { ...OG_IMAGE_SIZE, fonts })
}

export async function renderTitleOgImage(content: TitlePlateContent): Promise<ImageResponse> {
  const [fonts, logo] = await Promise.all([loadOgFonts(), loadOgLogo()])
  return new ImageResponse(<TitlePlateCard logo={logo} {...content} />, { ...OG_IMAGE_SIZE, fonts })
}
