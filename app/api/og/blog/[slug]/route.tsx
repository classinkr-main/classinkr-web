/**
 * 블로그 글 OG 이미지 동적 생성 (히어로 이미지 없는 글용).
 *
 * generateMetadata 가 heroImageUrl/imageUrl 이 없을 때만 이 URL을 og:image 로 쓴다.
 * 루트 app/opengraph-image.tsx 와 같은 템플릿(lib/og/template.tsx, Pretendard 400·700 내장)을 쓴다.
 * 글꼴 파일은 next.config.ts 의 outputFileTracingIncludes 로 이 함수 번들에 포함된다.
 */

import { renderOgImage } from "@/lib/og/template"
import { getPublishedPostBySlug } from "@/lib/repositories/blog"

// 동적 제목은 템플릿이 2줄에서 자른다. 그 전에 지나치게 긴 문자열만 한 번 줄인다.
const MAX_TITLE_LENGTH = 64

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

  const displayTitle = title.length > MAX_TITLE_LENGTH ? `${title.slice(0, MAX_TITLE_LENGTH)}…` : title

  return renderOgImage({
    section: "블로그",
    kicker: category,
    titleLines: [displayTitle],
    titleSize: 64,
  })
}
