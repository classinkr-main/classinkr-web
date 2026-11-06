/**
 * 블로그 글 OG 이미지 동적 생성 (히어로 이미지 없는 글용).
 *
 * generateMetadata 가 heroImageUrl/imageUrl 이 없을 때만 이 URL을 og:image 로 쓴다.
 * 루트 app/opengraph-image.tsx(C′ 로고 액자)와 같은 액자에 새 마크 · 카테고리 · 제목 2줄을 싣는다(lib/og/template.tsx).
 * 글꼴·로고 파일은 next.config.ts 의 outputFileTracingIncludes 로 이 함수 번들에 포함된다.
 */

import { renderTitleOgImage } from "@/lib/og/template"
import { getPublishedPostBySlug } from "@/lib/repositories/blog"

// 줄바꿈·말줄임은 템플릿(lib/og/fit-text.ts)이 2줄에 맞춰 정한다. 맞춤 계산이 길어지지 않게 비정상적으로 긴 입력만 먼저 줄인다.
const MAX_TITLE_LENGTH = 200

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

  return renderTitleOgImage({
    kicker: category,
    title: Array.from(title).slice(0, MAX_TITLE_LENGTH).join(""),
  })
}
