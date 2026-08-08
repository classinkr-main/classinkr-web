import type { BlogPost as SupaBlogPost } from "@/lib/supabase/database.types"

/**
 * 목록에 찍는 날짜의 원본. 정렬 키(published_at)와 반드시 같아야 한다 —
 * created_at을 표시하면 "최신순" 목록이 화면상 역전돼 보인다
 * (발행일과 작성일이 다른 글에서 발생하며, 그 글이 최상단일 때 특히 눈에 띈다).
 * published_at이 없는 레거시 글만 created_at으로 떨어진다.
 */
export function resolveDisplayDateSource(
  row: Pick<SupaBlogPost, "published_at" | "created_at">,
) {
  return row.published_at ?? row.created_at
}

/**
 * ko-KR 로캘은 이미 "2023. 08. 02." 형태를 준다. 여기에 마침표마다 공백을 또 붙이면
 * "2023.  08.  02." 처럼 이중 공백이 되어 복사·스크린리더 낭독에 그대로 노출된다.
 */
export function formatBlogDisplayDate(isoString: string): string {
  return new Date(isoString)
    .toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .replace(/\s+/g, " ")
    .replace(/\.\s*$/, "")
    .trim()
}
