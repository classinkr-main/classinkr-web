/**
 * 행사 슬러그 ↔ 라우트 경로 경계 인코딩. 블로그와 같은 사고·같은 해법이다(lib/blog-slug-route.ts 머리말).
 *
 * 사고(2026-11-03 운영, 그 이전 배포부터): /events/classin-meets-gwang-ju-광주-세미나-v0txw 가 캐시 미스
 * 렌더마다 500 — `TypeError: Invalid character in header content ["x-next-cache-tags"]`.
 * 상세 페이지가 revalidate=3600 ISR 이라, Vercel(minimal mode)이 디코드된 경로로 만든 암묵 태그
 * `_N_T_/events/<한글>` 을 응답 헤더에 싣다가 Node 가 던졌다. (calendar.ics 는 이 헤더를 싣지 않아 무관.)
 *
 * 해법: proxy.ts 가 헤더에 못 싣는 슬러그를 `/events/_u8_<base64url(UTF-8)>` 로 rewrite 한다.
 * 주소창·공유 링크·사이트맵·DB 슬러그는 그대로다. 행사 slug 생성기는 `_` 를 지우므로 새 슬러그가
 * 토큰 접두사와 겹치지 않는다.
 */
import {
  encodeBlogSlugToken,
  getSlugTokenRewritePath,
  isHeaderSafeBlogSlug,
  resolveBlogRouteSlug,
} from "@/lib/blog-slug-route"

/** `/events/[slug]` 의 params.slug(토큰·퍼센트 인코딩·원문) → DB 조회용 슬러그. */
export const resolveEventRouteSlug = resolveBlogRouteSlug

/** ISR 캐시가 실제로 붙는 `[slug]` 세그먼트. generateStaticParams·revalidatePath 가 같은 값을 쓴다. */
export function getEventRouteSegment(slug: string) {
  return isHeaderSafeBlogSlug(slug) ? slug : encodeBlogSlugToken(slug)
}

/** proxy.ts rewrite 대상 — `/events/<비ASCII 슬러그>` 한 세그먼트만. 목록·ASCII·하위 경로는 null. */
export function getEventSlugTokenRewritePath(pathname: string): string | null {
  return getSlugTokenRewritePath(pathname, "/events/")
}
