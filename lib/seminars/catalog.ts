// 행사 영상 카탈로그 — 로그인 회원 전용 콘텐츠. /events 페이지에서 노출되고
// 재생은 /events/videos/[slug] 에서 회원 게이트로 임베드된다.
//
// 영상 추가/수정 방법:
//   1. 아래 SEMINARS 배열에 항목을 추가하거나 youtube 값을 교체한다.
//   2. youtube 에는 YouTube "전체 URL" 또는 "영상 ID" 둘 중 무엇을 넣어도 된다.
//      (예: "https://youtu.be/abc123", "https://www.youtube.com/watch?v=abc123", "abc123")
//   3. 회원 전용이므로 YouTube 영상은 "미등록(unlisted)" 으로 올린다.
//   4. isPublished: false 로 두면 목록/상세에서 숨겨진다.

export interface SeminarVideo {
  /** URL 슬러그. /events/videos/{slug} 로 노출된다. */
  slug: string
  /** 카드/상세 제목 */
  title: string
  /** 비회원에게도 보이는 한 줄 설명 (미리보기 가치) */
  description: string
  /** YouTube 전체 URL 또는 영상 ID. 회원에게만 임베드된다. */
  youtube: string
  /** (선택) 커스텀 포스터 이미지 URL — YouTube 썸네일이 아닌 직접 업로드 이미지. 없으면 브랜드 그라디언트 포스터 사용. */
  posterUrl?: string
  /** 비회원에게도 보이는 핵심 포인트 (미리보기 가치) */
  highlights?: string[]
  /** 발표자/연사 (선택) */
  presenter?: string
  /** 길이 라벨 (예: "32분") (선택) */
  durationLabel?: string
  /** 공개일 ISO 문자열 (예: "2026-06-26") */
  publishedAt: string
  /** false 면 목록/상세에서 숨김 */
  isPublished: boolean
}

// ⚠️ 아래는 구조 확인용 예시입니다. 실제 영상 링크를 받으면 youtube 값과 메타데이터만 교체하세요.
export const SEMINARS: SeminarVideo[] = [
  {
    slug: "2026-busan-ai-forum",
    title: "2026 부산 AI 포럼 (과사람)",
    description:
      "2026 부산 AI 포럼 현장 영상. 교육 현장의 AI 활용 흐름을 함께 확인하세요.",
    youtube: "https://youtube.com/watch?v=Y9R40PX0iww&feature=youtu.be",
    presenter: "과사람",
    publishedAt: "2026-06-26",
    isPublished: true,
  },
]

/**
 * 클라이언트(비회원 노출)로 넘겨도 안전한 공개 projection.
 * `youtube`(영상 ID/URL)를 의도적으로 제외해 게이팅 누출을 막는다.
 */
export type PublicSeminarCard = Pick<
  SeminarVideo,
  "slug" | "title" | "description" | "presenter" | "durationLabel" | "posterUrl"
>

export function toPublicSeminarCard(seminar: SeminarVideo): PublicSeminarCard {
  return {
    slug: seminar.slug,
    title: seminar.title,
    description: seminar.description,
    presenter: seminar.presenter,
    durationLabel: seminar.durationLabel,
    posterUrl: seminar.posterUrl,
  }
}

/** "전체 URL 또는 ID" 입력에서 11자리 YouTube 영상 ID 를 추출한다. 추출 실패 시 입력값을 그대로 반환. */
export function extractYoutubeId(input: string): string {
  const value = input.trim()
  // 이미 ID 형태(영문/숫자/-/_, 11자)면 그대로 사용
  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value

  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/,
  ]
  for (const pattern of patterns) {
    const match = value.match(pattern)
    if (match?.[1]) return match[1]
  }
  return value
}

/** 영상 ID 가 아직 채워지지 않은 플레이스홀더인지 여부. */
export function isPlaceholderYoutube(input: string): boolean {
  return !/^[a-zA-Z0-9_-]{11}$/.test(extractYoutubeId(input))
}

export function getPublishedSeminars(): SeminarVideo[] {
  return SEMINARS.filter((seminar) => seminar.isPublished).sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt)
  )
}

export function getSeminarBySlug(slug: string): SeminarVideo | null {
  return SEMINARS.find((seminar) => seminar.slug === slug && seminar.isPublished) ?? null
}
