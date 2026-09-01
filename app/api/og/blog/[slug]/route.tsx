/**
 * 블로그 글 OG 이미지 동적 생성 (히어로 이미지 없는 글용).
 *
 * generateMetadata 가 heroImageUrl/imageUrl 이 없을 때만 이 URL을 og:image 로 쓴다.
 * 루트 app/opengraph-image.tsx 와 동일한 브랜드 템플릿(폰트 번들 없이 sans-serif).
 */

import { ImageResponse } from "next/og"
import { getPublishedPostBySlug } from "@/lib/repositories/blog"

// 공유 미리보기 크롤러(카카오톡·슬랙·검색봇)가 같은 URL을 반복 요청한다.
// 캐시가 없으면 매번 Supabase 조회 + PNG 재렌더라 미리보기 타임아웃으로 이어진다.
export const revalidate = 86400

const WIDTH = 1200
const HEIGHT = 630

function decodeSlug(raw: string) {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  let title = "Classin 블로그"
  let category = "인사이트"
  try {
    const post = await getPublishedPostBySlug(decodeSlug(slug))
    if (post) {
      title = post.title
      category = post.category || category
    }
  } catch {
    // 조회 실패 시 기본 카피로 폴백
  }

  const displayTitle = title.length > 60 ? `${title.slice(0, 60)}…` : title

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          backgroundColor: "#FAFAF8",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px 96px",
          position: "relative",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            backgroundColor: "#084734",
          }}
        />

        {/* Logo badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 40 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              backgroundColor: "#084734",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ color: "#ffffff", fontSize: 28, fontWeight: 700 }}>C</span>
          </div>
          <span style={{ fontSize: 20, fontWeight: 600, color: "#615D59" }}>Classin 블로그</span>
        </div>

        {/* Category eyebrow */}
        <div
          style={{
            display: "flex",
            backgroundColor: "#ECFDF5",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 9999,
            padding: "6px 18px",
            fontSize: 18,
            fontWeight: 600,
            color: "#084734",
            width: "fit-content",
            marginBottom: 28,
          }}
        >
          {category}
        </div>

        {/* Title */}
        <div
          style={{
            display: "flex",
            fontSize: 60,
            fontWeight: 700,
            color: "#111110",
            lineHeight: 1.08,
            letterSpacing: "-2px",
            maxWidth: 1000,
          }}
        >
          {displayTitle}
        </div>

        {/* Bottom right */}
        <div
          style={{
            position: "absolute",
            bottom: 60,
            right: 96,
            display: "flex",
            fontSize: 14,
            fontWeight: 600,
            color: "#084734",
            backgroundColor: "#ECFDF5",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 9999,
            padding: "6px 16px",
          }}
        >
          classin.co.kr
        </div>

        <div
          style={{
            position: "absolute",
            bottom: -120,
            right: -120,
            width: 400,
            height: 400,
            borderRadius: 9999,
            backgroundColor: "#ECFDF5",
            opacity: 0.6,
          }}
        />
      </div>
    ),
    { width: WIDTH, height: HEIGHT }
  )
}
