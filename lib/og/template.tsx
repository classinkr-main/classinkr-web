/**
 * 공유 카드(OG·트위터) 이미지 템플릿 — 루트 `app/opengraph-image.tsx` 와 블로그 `/api/og/blog/[slug]` 가 함께 쓴다.
 *
 * 정본: typography 스펙 §2-1 'OG 이미지'(C28 · T10 · P5 SY-4).
 * - 글꼴은 저장소에 둔 Pretendard 정적 OTF 400·700 두 개를 직접 싣는다. 예전처럼 `sans-serif` 만 두면
 *   Satori 가 한글을 런타임에 다른 글꼴로 대신 그려, 카카오톡 카드에서 띄어쓰기가 사라졌다('운영의새로운').
 * - 지면은 paper, 제목은 먹 700, 위에 먹 괘선(masthead) + 텍스트 워드마크. 'C' 배지·민트 원·자간 리터럴은 없다.
 * - 카카오톡 미리보기는 1200px 을 300pt 안팎으로 줄여 보여 준다. 그래서 글자는 적게, 제목은 크게 둔다.
 * 색은 CSS 변수를 못 읽으므로 `lib/design-tokens.ts` 미러만 쓴다.
 */

import { readFile } from "node:fs/promises"
import path from "node:path"

import { ImageResponse } from "next/og"

import { color } from "@/lib/design-tokens"

export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const
export const OG_IMAGE_CONTENT_TYPE = "image/png"

const FONT_DIR = path.join(process.cwd(), "assets/fonts/pretendard-static")
const FONT_FAMILY = "Pretendard"

type OgFont = { name: string; data: Buffer; weight: 400 | 700; style: "normal" }

// 인스턴스당 한 번만 읽는다(블로그 경로는 요청마다 다시 읽지 않는다). 실패하면 다음 요청이 다시 시도한다.
let fontsPromise: Promise<OgFont[]> | null = null

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

export interface OgCardContent {
  /** 워드마크 옆 짧은 구역 이름(예: '블로그'). 없으면 워드마크만 */
  section?: string
  /** 제목 위 한 줄. 범주·카테고리 */
  kicker: string
  /** 제목 줄. 정적 카드는 수동 개행으로 2줄, 동적 제목은 한 문자열(2줄에서 자른다) */
  titleLines: readonly string[]
  /** 제목 크기(px). 기본 72 — 스펙 하한 56 */
  titleSize?: number
}

const SITE_HOST = "classin.co.kr"

/** 템플릿 JSX. ImageResponse 밖(테스트 등)에서도 쓸 수 있게 따로 둔다. */
export function OgCard({ section, kicker, titleLines, titleSize = 72 }: OgCardContent) {
  const lines = titleLines.filter((line) => line.trim().length > 0).slice(0, 2)
  const singleDynamicTitle = lines.length === 1

  return (
    <div
      style={{
        width: OG_IMAGE_SIZE.width,
        height: OG_IMAGE_SIZE.height,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: color.paper,
        color: color.ink,
        fontFamily: FONT_FAMILY,
        padding: "64px 96px 84px",
      }}
    >
      {/* 머리: 텍스트 워드마크 + 주소, 아래 먹 괘선 */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          paddingBottom: 22,
          borderBottom: `3px solid ${color.ink}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
          <span style={{ fontSize: 46, fontWeight: 700, lineHeight: 1 }}>Classin</span>
          {section ? (
            <span style={{ fontSize: 30, fontWeight: 400, lineHeight: 1, color: color.fgMuted }}>{section}</span>
          ) : null}
        </div>
        <span style={{ fontSize: 28, fontWeight: 400, lineHeight: 1, color: color.fgMuted }}>{SITE_HOST}</span>
      </div>

      {/* 본문: Kicker 한 줄 + 제목 2줄 */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 30 }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 9999,
              backgroundColor: color.accent,
            }}
          />
          <span style={{ fontSize: 32, fontWeight: 400, lineHeight: 1.2, color: color.fgBody }}>{kicker}</span>
        </div>
        {singleDynamicTitle ? (
          <div
            style={{
              display: "block",
              fontSize: titleSize,
              fontWeight: 700,
              lineHeight: 1.22,
              lineClamp: 2,
              wordBreak: "keep-all",
            }}
          >
            {lines[0]}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {lines.map((line) => (
              <span key={line} style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.22 }}>
                {line}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export async function renderOgImage(content: OgCardContent): Promise<ImageResponse> {
  const fonts = await loadOgFonts()
  return new ImageResponse(<OgCard {...content} />, { ...OG_IMAGE_SIZE, fonts })
}
