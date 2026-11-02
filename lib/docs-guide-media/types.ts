import type { DocMedia } from "@/lib/docs"

/** "<카테고리>/<slug>" → 섹션 제목 → 붙일 화면 목록 */
export type GuideMediaMap = Record<string, Record<string, DocMedia[]>>
